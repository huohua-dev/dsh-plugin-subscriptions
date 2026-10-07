#!/usr/bin/env node
/**
 * Assemble the prebuilt git-install tree published to the `dist` branch.
 *
 * Git-hosted installs (`dsh plugin add github:<owner>/dsh-plugin-subscriptions`)
 * fetch the repository, and pnpm 11 refuses to run a git dependency's
 * `prepare` script unless `allowBuilds` names that exact commit tarball — so
 * every new commit would need a fresh manual allowlist entry. The `dist`
 * branch sidesteps that: it carries the already-built `lib/` and a manifest
 * with no lifecycle scripts, so pnpm has nothing to build or approve.
 *
 * Usage: pnpm build && node scripts/make-dist.mjs <outDir>
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outArg = process.argv[2]
if (!outArg) {
  console.error('usage: node scripts/make-dist.mjs <outDir>')
  process.exit(2)
}
const out = resolve(outArg)
if (out === root || root.startsWith(out + '/')) {
  console.error(`refusing to write the dist tree over the repository: ${out}`)
  process.exit(2)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Every entry point the manifest advertises must already be built.
const required = new Set([pkg.main, pkg.types])
for (const target of Object.values(pkg.exports ?? {})) {
  if (typeof target === 'string') required.add(target)
  else for (const file of Object.values(target)) required.add(file)
}
required.add(pkg.dsh?.bundle?.patch)
const missing = [...required].filter(file => file && !existsSync(join(root, file)))
if (missing.length) {
  console.error(`missing build outputs (run \`pnpm build\` first): ${missing.join(', ')}`)
  process.exit(1)
}

// Install-time manifest: no lifecycle scripts (that is the whole point), and
// nothing that only matters for developing this repository.
const manifest = { ...pkg }
delete manifest.scripts
delete manifest.devDependencies
delete manifest.pnpm
delete manifest.packageManager

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

// `files` decides what an installed package contains; package.json, README*
// and LICENSE are always included by npm/pnpm packlists.
const always = readdirSync(root).filter(name => /^(README|LICENSE)/i.test(name))
for (const entry of [...(pkg.files ?? []), ...always]) {
  cpSync(join(root, entry), join(out, entry), { recursive: true })
}

console.log(`dist tree for ${pkg.name}@${pkg.version} written to ${out}`)
