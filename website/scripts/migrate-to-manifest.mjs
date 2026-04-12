#!/usr/bin/env node

/**
 * Migration script: extract manifest.yaml + docs.mdx from existing blueprint files.
 *
 * For each blueprint, reads the existing JSON/MDX files and produces:
 * 1. manifest.yaml — single source of truth for metadata
 * 2. docs.mdx — custom version page body (only if content differs from default template)
 *
 * Usage: node scripts/migrate-to-manifest.mjs [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import YAML from 'yaml'

const BLUEPRINTS_DIR = path.resolve(import.meta.dirname, '../docs/blueprints')

const DRY_RUN = process.argv.includes('--dry-run')

// ── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function subdirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function isVersionDir(name) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(name)
}

// ── Extract manifest from existing files ────────────────────────────────────

function extractManifest(blueprintDir, category, blueprintId) {
  const blueprintJson = readJson(path.join(blueprintDir, 'blueprint.json'))

  // Find the first library to get maintainer and integration info
  const libraryIds = subdirs(blueprintDir).filter(
    (d) => !d.startsWith('.') && d !== 'node_modules',
  )

  let maintainers = []
  let supportedIntegrations = []
  let supportedHooks = []
  let supportedControllers = null

  if (libraryIds.length > 0) {
    const firstLibId = libraryIds[0]
    const libraryJsonPath = path.join(blueprintDir, firstLibId, 'library.json')
    if (fs.existsSync(libraryJsonPath)) {
      const libraryJson = readJson(libraryJsonPath)
      maintainers = libraryJson.maintainers || []
      supportedIntegrations = libraryJson.supported_integrations || []
    }

    // Find first release for hooks/controllers info
    const releaseIds = subdirs(path.join(blueprintDir, firstLibId))
    if (releaseIds.length > 0) {
      const releaseJsonPath = path.join(
        blueprintDir,
        firstLibId,
        releaseIds[0],
        'release.json',
      )
      if (fs.existsSync(releaseJsonPath)) {
        const releaseJson = readJson(releaseJsonPath)
        supportedHooks = releaseJson.supported_hooks || []
        supportedControllers = releaseJson.supported_controllers || null
        // Use release maintainers if library didn't have them
        if (maintainers.length === 0) {
          maintainers = releaseJson.maintainers || []
        }
        // Use release integrations if library didn't have them
        if (supportedIntegrations.length === 0) {
          supportedIntegrations = releaseJson.supported_integrations || []
        }
      }
    }
  }

  const manifest = {
    name: blueprintJson.name,
    description: blueprintJson.description,
  }

  if (category === 'controllers') {
    manifest.manufacturer = blueprintJson.manufacturer
    manifest.model = blueprintJson.model
    manifest.model_name = blueprintJson.model_name
  }

  manifest.librarians = blueprintJson.librarians
  manifest.maintainers = maintainers

  if (supportedIntegrations.length > 0) {
    manifest.supported_integrations = supportedIntegrations
  }

  if (category === 'controllers' && supportedHooks.length > 0) {
    manifest.supported_hooks = supportedHooks
  }

  if (category === 'hooks' && supportedControllers) {
    manifest.supported_controllers = supportedControllers
  }

  if (blueprintJson.tags && blueprintJson.tags.length > 0) {
    manifest.tags = blueprintJson.tags
  }

  if (
    blueprintJson.external_references &&
    blueprintJson.external_references.length > 0
  ) {
    manifest.external_references = blueprintJson.external_references
  }

  if (blueprintJson.status && blueprintJson.status !== 'active') {
    manifest.status = blueprintJson.status
  }

  return manifest
}

// ── Extract docs.mdx from existing version MDX ─────────────────────────────

function extractDocsMdx(blueprintDir, libraryId, releaseId) {
  const releaseDir = path.join(blueprintDir, libraryId, releaseId)
  const versions = subdirs(releaseDir).filter(isVersionDir)
  if (versions.length === 0) return null

  // Use the latest version's MDX as the template (they're all identical)
  const latestVersion = versions.sort().reverse()[0]
  const mdxPath = path.join(releaseDir, latestVersion, `${latestVersion}.mdx`)
  if (!fs.existsSync(mdxPath)) return null

  const content = fs.readFileSync(mdxPath, 'utf-8')

  // Strip frontmatter (everything between the first --- and second ---)
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3)
  if (fmEnd === -1) return content

  // Body starts after the closing ---
  const body = content.slice(fmEnd + 3)

  return body
}

// ── Main migration ──────────────────────────────────────────────────────────

function migrateBlueprint(blueprintDir, category, blueprintId) {
  console.log(`  ${category}/${blueprintId}`)

  // 1. Extract manifest
  const manifest = extractManifest(blueprintDir, category, blueprintId)

  // 2. Write manifest.yaml
  const manifestPath = path.join(blueprintDir, 'manifest.yaml')
  const yamlContent = YAML.stringify(manifest, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  })

  if (DRY_RUN) {
    console.log(`    Would write: manifest.yaml`)
  } else {
    fs.writeFileSync(manifestPath, yamlContent)
  }

  // 3. Extract and write docs.mdx for each library/release
  const libraryIds = subdirs(blueprintDir).filter(
    (d) => !d.startsWith('.') && d !== 'node_modules',
  )

  for (const libraryId of libraryIds) {
    const libraryDir = path.join(blueprintDir, libraryId)
    const releaseIds = subdirs(libraryDir)

    for (const releaseId of releaseIds) {
      const body = extractDocsMdx(blueprintDir, libraryId, releaseId)
      if (!body) continue

      const docsPath = path.join(libraryDir, releaseId, 'docs.mdx')

      if (DRY_RUN) {
        console.log(`    Would write: ${libraryId}/${releaseId}/docs.mdx`)
      } else {
        fs.writeFileSync(docsPath, body)
        console.log(`    Wrote: ${libraryId}/${releaseId}/docs.mdx`)
      }
    }
  }
}

function main() {
  if (DRY_RUN) {
    console.log('DRY RUN — no files will be written\n')
  }

  console.log('Migrating existing blueprints to manifest.yaml...\n')

  const categories = ['controllers', 'hooks', 'automations']
  let count = 0

  for (const category of categories) {
    const categoryDir = path.join(BLUEPRINTS_DIR, category)
    if (!fs.existsSync(categoryDir)) continue

    const blueprintIds = subdirs(categoryDir)
    for (const blueprintId of blueprintIds) {
      const blueprintDir = path.join(categoryDir, blueprintId)

      // Skip if manifest.yaml already exists
      if (fs.existsSync(path.join(blueprintDir, 'manifest.yaml'))) {
        console.log(
          `  ${category}/${blueprintId} — skipping (manifest.yaml already exists)`,
        )
        continue
      }

      // Skip if no blueprint.json exists
      if (!fs.existsSync(path.join(blueprintDir, 'blueprint.json'))) {
        console.log(
          `  ${category}/${blueprintId} — skipping (no blueprint.json)`,
        )
        continue
      }

      migrateBlueprint(blueprintDir, category, blueprintId)
      count++
    }
  }

  console.log(
    `\nDone! Migrated ${count} blueprint(s).${DRY_RUN ? ' (dry run)' : ''}`,
  )
}

main()
