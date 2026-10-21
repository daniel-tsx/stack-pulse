import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

export function loadTs(file, overrides = {}, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const compiledModule = { exports: {} }
  runInNewContext(compiled, {
    module: compiledModule,
    exports: compiledModule.exports,
    URL,
    URLSearchParams,
    Request,
    Response,
    Headers,
    console,
    require: (name) => (Object.hasOwn(overrides, name) ? overrides[name] : require(name)),
    ...globals,
  })
  return compiledModule.exports
}

// Run the production neon-http Drizzle adapter and generated SQL on local pg.
// Neon promises defer execution until awaited or submitted as one transaction.
export function localNeonClient(pool) {
  const execute = (connection, query) =>
    connection.query({
      text: query.text,
      values: query.params,
      rowMode: query.options?.arrayMode ? 'array' : undefined,
    })
  const client = {
    query(text, params, options) {
      const query = { text, params, options }
      return { ...query, then: (resolve, reject) => execute(pool, query).then(resolve, reject) }
    },
    async transaction(queries) {
      const connection = await pool.connect()
      try {
        await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED')
        const results = []
        for (const query of queries) results.push(await execute(connection, query))
        await connection.query('COMMIT')
        return results
      } catch (error) {
        await connection.query('ROLLBACK')
        throw error
      } finally {
        connection.release()
      }
    },
  }
  return client
}
