import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

// Exercise the actual provider configuration and the script it sends in SSR HTML.
const require = createRequire(import.meta.url)
const source = readFileSync(
  new URL('../src/components/theme-provider.tsx', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const compiledModule = { exports: {} }
runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require })
const html = renderToStaticMarkup(
  createElement(compiledModule.exports.ThemeProvider, null, createElement('main', null, 'content')),
)
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1]
assert.ok(script, 'A synchronous initialization script must precede page content')
assert.ok(html.includes('type="text/javascript"'), 'The SSR initialization script must execute')
assert.ok(html.indexOf('</script>') < html.indexOf('<main>'))

function initialize(saved, systemDark, storageBlocked = false) {
  const root = { theme: 'dark', style: {}, setAttribute: (_, value) => (root.theme = value) }
  runInNewContext(script, {
    document: { documentElement: root },
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: {
      getItem(key) {
        assert.equal(key, 'stackpulse-theme')
        if (storageBlocked) throw new Error('Storage blocked')
        return saved
      },
    },
  })
  return root
}

test('first visit stays Dark even with a light OS preference', () => {
  const root = initialize(null, false)
  assert.equal(root.theme, 'dark')
  assert.equal(root.style.colorScheme, 'dark')
})

for (const saved of ['dark', 'light', 'system']) {
  for (const systemDark of [true, false]) {
    test(`saved ${saved}, OS ${systemDark ? 'dark' : 'light'}: correct before hydration`, () => {
      const expected = saved === 'system' ? (systemDark ? 'dark' : 'light') : saved
      const root = initialize(saved, systemDark)
      assert.equal(root.theme, expected)
      assert.equal(root.style.colorScheme, expected)
    })
  }
}

test('blocked localStorage leaves the CSS Dark default intact without throwing', () => {
  assert.equal(initialize(null, false, true).theme, 'dark')
})

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const light = css.match(/:root\[data-theme='light'\] \{([^}]+)\}/)[1]
const palette = Object.fromEntries(
  [...light.matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map(([, name, hex]) => [
    name,
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255),
  ]),
)
const blend = (foreground, background, alpha) =>
  foreground.map((value, i) => value * alpha + background[i] * (1 - alpha))
function luminance(rgb) {
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('Light text and syntax accents meet AA on page, panel, and tinted badge surfaces', () => {
  const text = [
    'ink',
    'dust',
    'fade',
    'mute',
    'lime',
    'rose',
    'amber',
    'cyan',
    'emerald',
    'violet',
    'magenta',
  ]
  for (const token of text) {
    for (const surface of ['void', 'shade', 'lift', 'panel']) {
      const ratio = contrast(palette[token], palette[surface])
      assert.ok(ratio >= 4.5, `${token} on ${surface}: ${ratio.toFixed(2)}`)
    }
  }
  for (const token of ['lime', 'rose', 'amber', 'cyan', 'emerald']) {
    const ratio = contrast(palette[token], blend(palette[token], palette.shade, 0.1))
    assert.ok(ratio >= 4.5, `${token} badge: ${ratio.toFixed(2)}`)
  }
})

test('Light inverted lime/rose buttons remain readable at rest and hover', () => {
  for (const token of ['lime', 'rose']) {
    for (const alpha of [1, 0.85]) {
      const ratio = contrast(palette.void, blend(palette[token], palette.void, alpha))
      assert.ok(ratio >= 4.5, `${token} button at ${alpha}: ${ratio.toFixed(2)}`)
    }
  }
})
