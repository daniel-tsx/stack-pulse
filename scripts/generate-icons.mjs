import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// Two source SVGs:
//  - icon.svg     → favicon tier (void fill, no baseline, bold strokes) for tiny sizes
//  - app-icon.svg → master glyph on a squircle, safe-area inset, for app/OS/OG icons
const faviconSvg = readFileSync(resolve(root, 'src/app/icon.svg'))
const appIconSvg = readFileSync(resolve(root, 'public/brand/app-icon.svg'))

const brandDir = resolve(root, 'public/brand')
mkdirSync(brandDir, { recursive: true })

// High render density so small SVGs rasterise crisply before downscaling.
const png = (svg, size, density = 1024) =>
  sharp(svg, { density }).resize(size, size).png().toBuffer()

const write = (path, buf) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
  console.log('wrote', path)
}

// favicon.ico — favicon-tier source, multi-resolution
const icoBuffers = await Promise.all([16, 32, 48, 64].map((s) => png(faviconSvg, s)))
const ico = await pngToIco(icoBuffers)
write(resolve(root, 'public/favicon.ico'), ico)
write(resolve(root, 'src/app/favicon.ico'), ico)

// favicon PNG exports (brand kit)
write(resolve(brandDir, 'favicon-16x16.png'), await png(faviconSvg, 16))
write(resolve(brandDir, 'favicon-32x32.png'), await png(faviconSvg, 32))

// app / OS / OG icons — richer app-icon source
write(resolve(root, 'src/app/apple-icon.png'), await png(appIconSvg, 180, 512))
write(resolve(root, 'public/logo.png'), await png(appIconSvg, 512, 512))
write(resolve(brandDir, 'icon-180.png'), await png(appIconSvg, 180, 512))
write(resolve(brandDir, 'icon-192.png'), await png(appIconSvg, 192, 512))
write(resolve(brandDir, 'icon-512.png'), await png(appIconSvg, 512, 512))
