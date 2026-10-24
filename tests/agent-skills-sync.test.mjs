import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

function fixture(t, crlf = false) {
  const directory = mkdtempSync(join(tmpdir(), 'stackpulse-agent-sync-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const manifest = JSON.parse(readFileSync(join(root, '.agents/skill-sources.json'), 'utf8'))
  manifest.skills = manifest.skills.filter((skill) =>
    ['ponytail', 'grilling', 'frontend-design'].includes(skill.name),
  )
  for (const skill of manifest.skills) {
    const source = join(root, '.agents/skills', skill.name)
    const target = join(directory, '.agents/skills', skill.name)
    cpSync(source, target, { recursive: true })
    if (crlf) {
      for (const file of Object.keys(skill.files)) {
        const path = join(target, file)
        writeFileSync(
          path,
          readFileSync(path, 'utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
        )
      }
    }
  }
  mkdirSync(join(directory, 'scripts'))
  cpSync(
    join(root, 'scripts/sync-agent-skills.mjs'),
    join(directory, 'scripts/sync-agent-skills.mjs'),
  )
  const write = (path, data) => {
    const target = join(directory, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
  }
  const saveManifest = () => write('.agents/skill-sources.json', JSON.stringify(manifest))
  saveManifest()
  const run = (...args) => {
    const result = spawnSync(process.execPath, ['scripts/sync-agent-skills.mjs', ...args], {
      cwd: directory,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    })
    assert.ifError(result.error)
    return result
  }
  return {
    directory,
    manifest,
    saveManifest,
    run,
    write,
    read: (path) => readFileSync(join(directory, path), 'utf8'),
  }
}

test('initial sync from a CRLF checkout creates identical full copies and is repeatable', (t) => {
  const f = fixture(t, true)
  assert.equal(f.run('--check').status, 1)
  assert.equal(existsSync(join(f.directory, '.claude')), false, '--check must not create files')
  assert.equal(f.run().status, 0)
  assert.equal(f.run('--check').status, 0)
  for (const skill of f.manifest.skills) {
    for (const file of Object.keys(skill.files)) {
      const source = f.read(`.agents/skills/${skill.name}/${file}`).replaceAll('\r\n', '\n')
      const target = f.read(`.claude/skills/${skill.name}/${file}`)
      assert.equal(target, source)
    }
  }
  assert.equal(f.run().status, 0)
  assert.equal(f.run('--check').status, 0)
})

test('check reports drift without changing it; sync repairs drift and missing files', (t) => {
  const f = fixture(t)
  assert.equal(f.run().status, 0)
  f.write('.claude/skills/ponytail/SKILL.md', 'drift')
  assert.equal(f.run('--check').status, 1)
  assert.equal(f.read('.claude/skills/ponytail/SKILL.md'), 'drift')
  rmSync(join(f.directory, '.claude/skills/grilling/agents/openai.yaml'))
  assert.equal(f.run().status, 0)
  assert.equal(f.run('--check').status, 0)
})

test('a changed source in a later package prevents ALL target writes', (t) => {
  const f = fixture(t)
  assert.equal(f.run().status, 0)
  f.write('.claude/skills/ponytail/SKILL.md', 'keep until all sources validate')
  f.write('.agents/skills/grilling/agents/openai.yaml', 'unreviewed edit')
  for (const args of [[], ['--check']]) {
    const result = f.run(...args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Source changed/)
  }
  assert.equal(f.read('.claude/skills/ponytail/SKILL.md'), 'keep until all sources validate')
})

test('unrecorded source resources and missing licenses fail integrity', (t) => {
  const f = fixture(t)
  f.write('.agents/skills/ponytail/extra.md', 'unrecorded')
  assert.match(f.run().stderr, /Unrecorded source files/)
  rmSync(join(f.directory, '.agents/skills/ponytail/extra.md'))
  rmSync(join(f.directory, '.agents/skills/ponytail/LICENSE'))
  assert.equal(f.run().status, 1)
  assert.equal(existsSync(join(f.directory, '.claude')), false)
})

test('unexpected managed target files are preserved and never silently removed', (t) => {
  const f = fixture(t)
  assert.equal(f.run().status, 0)
  f.write('.claude/skills/grilling/custom.md', 'preserve me')
  const result = f.run()
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unexpected Claude files/)
  assert.equal(f.read('.claude/skills/grilling/custom.md'), 'preserve me')
})

test('unmanaged custom skills and existing Claude settings are untouched', (t) => {
  const f = fixture(t)
  f.write('.agents/skills/custom/SKILL.md', 'custom source')
  f.write('.claude/skills/custom/SKILL.md', 'custom target')
  f.write('.claude/settings.local.json', '{"permissions":{}}')
  assert.equal(f.run().status, 0)
  assert.equal(f.run('--check').status, 0)
  assert.equal(f.read('.agents/skills/custom/SKILL.md'), 'custom source')
  assert.equal(f.read('.claude/skills/custom/SKILL.md'), 'custom target')
  assert.equal(f.read('.claude/settings.local.json'), '{"permissions":{}}')
})

test('Windows CRLF content has the same integrity and synchronized meaning', (t) => {
  const f = fixture(t)
  for (const skill of f.manifest.skills)
    for (const file of Object.keys(skill.files)) {
      const path = `.agents/skills/${skill.name}/${file}`
      f.write(path, f.read(path).replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'))
    }
  assert.equal(f.run().status, 0)
  const target = '.claude/skills/ponytail/SKILL.md'
  f.write(target, f.read(target).replaceAll('\n', '\r\n'))
  assert.equal(f.run('--check').status, 0)
})

test('unsafe manifest names/paths and duplicate skills fail before writes', (t) => {
  const f = fixture(t)
  const original = structuredClone(f.manifest.skills)
  for (const mutate of [
    () => {
      f.manifest.skills[0].name = '../escape'
    },
    () => {
      f.manifest.skills[0].files['../outside.md'] = 'a'.repeat(64)
    },
    () => {
      f.manifest.skills[0].files['C:\\outside.md'] = 'a'.repeat(64)
    },
    () => {
      f.manifest.skills.push(f.manifest.skills[0])
    },
  ]) {
    f.manifest.skills = structuredClone(original)
    mutate()
    f.saveManifest()
    assert.equal(f.run().status, 1)
    assert.equal(existsSync(join(f.directory, '.claude')), false)
  }
})

test('unsupported arguments fail without changing target copies', (t) => {
  const f = fixture(t)
  assert.match(f.run('--update-upstream').stderr, /Usage:/)
  assert.equal(f.run('--check', '--check').status, 1)
  assert.equal(existsSync(join(f.directory, '.claude')), false)
})
