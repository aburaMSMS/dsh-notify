/**
 * Generates the DeepSeek-branded toast assets:
 * - assets/dsh-notify.png — the DeepSeek whale mark rasterized from the
 *   official favicon SVG (square, 256px), used as the toast's
 *   appLogoOverride image;
 * - assets/dsh-notify.ico — the same PNG wrapped in an ICO container, used
 *   as the Start-Menu shortcut icon (the toast header identity icon).
 *
 * The logo is DeepSeek's trademark, used locally to identify notifications
 * from the DSH harness; replace LOGO_URL (SVG or PNG) to re-brand. Requires
 * the sharp devDependency for SVG rasterization.
 *
 * Run: node scripts/generate-icon.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const LOGO_URL = 'https://fe-static.deepseek.com/chat/favicon.svg'
const SIZE = 256
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

async function download() {
  const response = await fetch(LOGO_URL)
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

/** Wrap a PNG into a single-image ICO container (PNG-in-ICO, Vista+). */
function pngToIco(png) {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = width >= 256 ? 0 : width
  entry[1] = height >= 256 ? 0 : height
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

const source = await download()
const png = await sharp(source).resize(SIZE, SIZE).png().toBuffer()
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'dsh-notify.png'), png)
writeFileSync(join(outDir, 'dsh-notify.ico'), pngToIco(png))
console.log(`wrote dsh-notify.png + dsh-notify.ico (${SIZE}x${SIZE}, source ${source.length} bytes)`)
