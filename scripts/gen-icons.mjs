// Generate platform app icons from the master SVG (build/icon.svg).
// Outputs: build/icon.png (1024), build/icon.ico (Windows), build/icon.icns (macOS, if iconutil present).
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const run = promisify(execFile)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const buildDir = path.join(root, 'build')
const svg = path.join(buildDir, 'icon.svg')

async function png(size) {
  return sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer()
}

async function main() {
  const svgBuf = await fs.readFile(svg)
  if (!svgBuf) throw new Error('missing build/icon.svg')

  // Master PNG
  await fs.writeFile(path.join(buildDir, 'icon.png'), await png(1024))
  console.log('✓ build/icon.png (1024)')

  // Windows .ico
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoBufs = await Promise.all(icoSizes.map(png))
  await fs.writeFile(path.join(buildDir, 'icon.ico'), await pngToIco(icoBufs))
  console.log('✓ build/icon.ico')

  // macOS .icns via iconutil + an .iconset
  const iconset = path.join(buildDir, 'icon.iconset')
  await fs.rm(iconset, { recursive: true, force: true })
  await fs.mkdir(iconset, { recursive: true })
  const specs = [
    [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png']
  ]
  for (const [size, name] of specs) await fs.writeFile(path.join(iconset, name), await png(size))
  try {
    await run('iconutil', ['-c', 'icns', '-o', path.join(buildDir, 'icon.icns'), iconset])
    console.log('✓ build/icon.icns')
  } catch (e) {
    console.warn('⚠ iconutil failed (macOS only) — skipping .icns:', e.message)
  }
  await fs.rm(iconset, { recursive: true, force: true })
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
