import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
assert(
  args.length === 0 || (args.length === 1 && args[0] === '--check'),
  'Usage: node scripts/sync-agent-skills.mjs [--check]',
)
const check = args.includes('--check')
const manifest = JSON.parse(await readFile(join(root, '.agents/skill-sources.json'), 'utf8'))
assert.equal(manifest.version, 1, 'Unsupported skill manifest version')
assert.ok(Array.isArray(manifest.skills) && manifest.skills.length > 0, 'No recorded skills')
const names = manifest.skills.map((skill) => skill.name)
assert.equal(new Set(names).size, names.length, 'Duplicate skill names')

async function realDirectory(directory, optional = false) {
  try {
    const stat = await lstat(directory)
    assert(stat.isDirectory() && !stat.isSymbolicLink(), `Use a real directory: ${directory}`)
    return true
  } catch (error) {
    if (optional && error.code === 'ENOENT') return false
    throw error
  }
}

async function filesAt(directory, optional = false) {
  if (!(await realDirectory(directory, optional))) return []
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Use real files: ${join(directory, entry.name)}`)
    if (entry.isDirectory()) {
      files.push(
        ...(await filesAt(join(directory, entry.name))).map((file) => `${entry.name}/${file}`),
      )
    } else {
      assert(entry.isFile(), `Unsupported entry: ${entry.name}`)
      files.push(entry.name)
    }
  }
  return files.sort()
}

// Only the Codex entry point replaces Claude's Skill-tool invocation.
function claudeCopy(name, file, source) {
  if (name !== 'grill-me' || file !== 'SKILL.md') return source
  const codexCall = 'Read [../grilling/SKILL.md](../grilling/SKILL.md) and follow it.'
  assert(source.includes(codexCall), 'Missing Grill Me adapter')
  return source.replace(codexCall, 'Call the Skill tool with "grilling".')
}

for (const directory of ['.agents', '.agents/skills', '.claude', '.claude/skills']) {
  await realDirectory(join(root, directory), directory.startsWith('.claude'))
}

// Preflight every package before writing any Claude copy.
const copies = []
for (const skill of manifest.skills) {
  assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Unsafe skill name')
  const source = join(root, '.agents/skills', skill.name)
  const target = join(root, '.claude/skills', skill.name)
  const files = Object.keys(skill.files).sort()
  assert(files.includes('SKILL.md') && files.includes('LICENSE'), `Incomplete skill: ${skill.name}`)
  for (const file of files) {
    assert(
      file.split('/').every((part) => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..'),
      `Unsafe skill path: ${file}`,
    )
    assert.match(skill.files[file], /^[a-f0-9]{64}$/, `Invalid hash: ${skill.name}/${file}`)
  }
  assert.deepEqual(await filesAt(source), files, `Unrecorded source files: ${skill.name}`)
  const existing = await filesAt(target, !check)
  assert(
    existing.every((file) => files.includes(file)),
    `Unexpected Claude files: ${skill.name}`,
  )
  for (const file of files) {
    // Match the reference's UTF-8/LF hash format across Windows checkouts.
    const data = (await readFile(join(source, file), 'utf8')).replaceAll('\r\n', '\n')
    assert.equal(
      createHash('sha256').update(data).digest('hex'),
      skill.files[file],
      `Source changed; review provenance and update its hash: ${skill.name}/${file}`,
    )
    copies.push([join(target, file), claudeCopy(skill.name, file, data)])
  }
}
for (const [destination, data] of copies) {
  if (check) {
    assert.equal(
      (await readFile(destination, 'utf8')).replaceAll('\r\n', '\n'),
      data,
      `Out of sync: ${destination}`,
    )
  } else {
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, data)
  }
}
console.log(`${check ? 'Checked' : 'Synced'} ${names.length} skills (${copies.length} files)`)
