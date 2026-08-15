import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Distribution-contract checks for the dsh-notify package: everything a
 * `dsh plugin add` installation and the profile composer rely on must be
 * declared and present. These assertions fail the suite when the manifest,
 * exports, or runtime imports drift from the published artifact layout.
 */
const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string): string => readFileSync(`${root}${rel}`, 'utf8')
const exists = (rel: string): boolean => existsSync(`${root}${rel}`)

const manifest = JSON.parse(read('package.json')) as {
  exports: Record<string, unknown>
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
  dsh: {
    bundle?: { patch?: string }
    client?: { platform?: string; inject?: string[] }
  }
}

describe('package distribution contract', () => {
  it('exports the cordis patch so consumers can resolve the bundle layer by subpath', () => {
    expect(manifest.exports['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    expect(exists('cordis.patch.yml')).toBe(true)
  })

  it('declares a real bundle patch and client platform entry', () => {
    expect(manifest.dsh.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client?.platform).toBe('web')
    expect(manifest.exports['./client']).toBeDefined()
    expect(exists('lib/client.js')).toBe(true)
    expect(exists('lib/index.js')).toBe(true)
  })

  it('depends on the DSH-vendored schemastery package, not the unrelated bare package', () => {
    // dsh profiles link @deepseek-ai/schemastery into their module fallback;
    // the bare "schemastery" npm package is never installed there, so a host
    // bundle importing it fails at boot with ERR_MODULE_NOT_FOUND.
    expect(manifest.peerDependencies.schemastery).toBeUndefined()
    expect(manifest.peerDependencies['@deepseek-ai/schemastery']).toBeDefined()
    expect(manifest.devDependencies['@deepseek-ai/schemastery']).toBeDefined()
    const schema = read('src/schema.ts')
    expect(schema).toContain("import z from '@deepseek-ai/schemastery'")
    expect(schema).not.toMatch(/from\s+['"]schemastery['"]/u)
  })
})
