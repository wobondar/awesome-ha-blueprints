#!/usr/bin/env node

/**
 * Build-time generator for blueprint metadata files.
 *
 * Reads manifest.yaml + changelog.json + directory structure and generates
 * all derived JSON/MDX files that Docusaurus and the React components expect.
 *
 * Source of truth: manifest.yaml (per blueprint) + changelog.json (per release)
 * Generated: blueprint.json, index.mdx, library.json, release.json, version.json, <version>.mdx
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import YAML from 'yaml'

const BLUEPRINTS_DIR = path.resolve(
  import.meta.dirname,
  '../docs/blueprints'
)

// ── Requirement ID mapping ──────────────────────────────────────────────────

const INTEGRATION_TO_REQUIREMENT_ID = {
  zigbee2mqtt: 'zigbee2mqtt',
  zha: 'zha',
  deconz: 'deconz',
}

// ── Standard hook descriptions ──────────────────────────────────────────────

const HOOK_DESCRIPTIONS = {
  light:
    'This Hook blueprint allows to build a controller-based automation to control a light. Supports brightness and color control both for white temperature and rgb lights.',
  media_player:
    'This Hook blueprint allows to build a controller-based automation to control a media player. Supports volume setting, play/pause and track selection.',
  cover:
    'This Hook blueprint allows to build a controller-based automation to control a cover. Supports opening, closing and tilting the cover.',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text)
}

/** List immediate subdirectories of a directory. */
function subdirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

/** Check if a version directory name matches YYYY.MM.DD pattern. */
function isVersionDir(name) {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(name)
}

/** Convert version string "2026.04.09" to ISO date "2026-04-09". */
function versionToDate(version) {
  return version.replace(/\./g, '-')
}

/** Sort version strings descending (newest first). */
function sortVersionsDesc(versions) {
  return [...versions].sort((a, b) => b.localeCompare(a))
}

// ── File generators ─────────────────────────────────────────────────────────

function generateBlueprintJson(manifest, category, blueprintId, blueprintDir) {
  const hasImage = fs.existsSync(
    path.join(blueprintDir, `${blueprintId}.png`)
  )
  const hasPdf = fs.existsSync(
    path.join(blueprintDir, `${blueprintId}.pdf`)
  )

  const result = {
    name: manifest.name,
    category,
    blueprint_id: blueprintId,
    description: manifest.description,
    librarians: manifest.librarians,
    images: hasImage ? [`${blueprintId}.png`] : [],
    status: manifest.status || 'active',
  }

  // Controller-specific fields
  if (category === 'controllers') {
    result.manufacturer = manifest.manufacturer
    result.model = manifest.model
    result.model_name = manifest.model_name
  }

  result.tags = manifest.tags || []
  result.external_references = manifest.external_references || []
  result.manual_files = hasPdf ? [`${blueprintId}.pdf`] : []

  return result
}

function generateIndexMdx(manifest, category, blueprintId) {
  const frontmatter = {
    blueprint_id: blueprintId,
    category,
    title: manifest.name,
    description: manifest.description,
  }

  if (category === 'controllers') {
    frontmatter.manufacturer = manifest.manufacturer
    frontmatter.model = manifest.model
    frontmatter.model_name = manifest.model_name
  }

  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  return `---
${fm}
---

import { BlueprintPage } from '/src/components/library_docs'

## Overview

<BlueprintPage category='${category}' id='${blueprintId}' render='overview' />

## Available Libraries

<BlueprintPage category='${category}' id='${blueprintId}' render='libraries' />
`
}

function generateLibraryJson(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseIds
) {
  const singular =
    category === 'controllers'
      ? 'controller'
      : category === 'hooks'
        ? 'hook'
        : 'automation'
  const capitalSingular = singular.charAt(0).toUpperCase() + singular.slice(1)

  // Controllers: "wobondar controller library"
  // Hooks/Automations: "EPMatt hook library for light"
  const title =
    category === 'controllers'
      ? `${libraryId} ${singular} library`
      : `${libraryId} ${singular} library for ${blueprintId}`

  const result = {
    library_id: libraryId,
    blueprint_id: blueprintId,
    title,
    description: `${capitalSingular} blueprint library for ${blueprintId} maintained by ${libraryId}.`,
    maintainers: manifest.maintainers,
    releases: releaseIds,
    category,
    status: manifest.status || 'active',
  }

  if (manifest.supported_integrations) {
    result.supported_integrations = manifest.supported_integrations
  }

  return result
}

function generateReleaseJson(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseId,
  versions
) {
  const sortedVersions = sortVersionsDesc(versions)
  const latestVersion = sortedVersions[0]

  const result = {
    release_id: releaseId,
    library_id: libraryId,
    blueprint_id: blueprintId,
    category,
    title: manifest.name,
    maintainers: manifest.maintainers,
    description: manifest.description,
    versions,
    latest_version: latestVersion,
    status: manifest.status || 'active',
  }

  if (category === 'controllers' && manifest.supported_hooks) {
    result.supported_hooks = manifest.supported_hooks
    result.supported_integrations = manifest.supported_integrations
  }

  if (category === 'hooks' && manifest.supported_controllers) {
    result.supported_controllers = manifest.supported_controllers
  }

  return result
}

function generateVersionJson(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseId,
  version
) {
  return {
    version,
    date: versionToDate(version),
    blueprint_id: blueprintId,
    library_id: libraryId,
    release_id: releaseId,
    category,
    title: manifest.name,
    description: manifest.description,
    maintainers: manifest.maintainers,
    blueprint_file: `${blueprintId}.yaml`,
    status: manifest.status || 'active',
  }
}

// ── Version MDX generation ──────────────────────────────────────────────────

function generateVersionMdxFrontmatter(manifest, category) {
  const lines = []
  lines.push(`title: ${manifest.name}`)
  lines.push(`description: ${manifest.description}`)

  if (category === 'controllers') {
    lines.push(`manufacturer: ${manifest.manufacturer}`)
    lines.push(`model: ${manifest.model}`)
    lines.push(`model_name: ${manifest.model_name}`)
    lines.push(
      `integrations: [${manifest.supported_integrations.join(', ')}]`
    )
  }

  return `---\n${lines.join('\n')}\n---`
}

function generateDefaultVersionMdxBody(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseId,
  hooksData
) {
  if (category === 'controllers') {
    return generateControllerVersionMdx(
      manifest,
      blueprintId,
      libraryId,
      releaseId,
      hooksData
    )
  }
  if (category === 'hooks') {
    return generateHookVersionMdx(manifest, blueprintId, libraryId, releaseId)
  }
  return generateAutomationVersionMdx(
    manifest,
    blueprintId,
    libraryId,
    releaseId
  )
}

function generateControllerVersionMdx(
  manifest,
  id,
  library,
  release,
  hooksData
) {
  const hasHooks =
    manifest.supported_hooks &&
    manifest.supported_hooks.length > 0 &&
    manifest.supported_hooks[0] !== 'none'

  const integrationsCsv = manifest.supported_integrations.join(', ')

  // Determine imports
  const imports = ['BlueprintImportCard', 'Inputs', 'Requirement', 'Changelog']
  if (hasHooks) imports.push('SupportedHooks')

  // Determine ecosystem tip
  const ecosystemName = hasHooks
    ? 'Controllers-Hooks Ecosystem'
    : `Controllers ${library} Ecosystem`
  const ecosystemLink = hasHooks
    ? ` You can read more about this topic [here](/docs/controllers-hooks-ecosystem).`
    : ''

  // Build requirements
  const requirements = manifest.supported_integrations
    .map((integ) => {
      const reqId = INTEGRATION_TO_REQUIREMENT_ID[integ.toLowerCase()]
      return reqId ? `<Requirement id='${reqId}'/>` : null
    })
    .filter(Boolean)
    .join('\n')

  // Build description
  let description = `This blueprint provides universal support for running any custom action when a button is pressed on the provided ${manifest.model_name}. Supports controllers integrated with ${integrationsCsv}.`

  if (hasHooks && manifest.supported_integrations.length > 1) {
    description +=
      ' Just specify the integration used to connect the remote to Home Assistant when setting up the automation, and the blueprint will take care of all the rest.'
  }

  // Build hooks tip
  let hooksTip = ''
  if (hasHooks) {
    hooksTip = `
:::tip
Automations created with this blueprint can be connected with one or more [Hooks](/docs/blueprints/hooks) supported by this controller.
Hooks allow to easily create controller-based automations for interacting with media players, lights, covers and more. See the list of [Hooks available for this controller](#available-hooks) for additional details.
:::`
  } else {
    hooksTip = `
:::tip
Automations created with this blueprint is not connected to any [Hooks](/docs/blueprints/hooks).
:::`
  }

  // Build Available Hooks section
  let hooksSection = ''
  if (hasHooks && hooksData) {
    const hookEntries = hooksData.hooks
      .map((h) => {
        const desc = HOOK_DESCRIPTIONS[h.hook] || ''
        return `### ${h.label}

${desc}

<SupportedHooks category='controllers' id='${id}' library='${library}' release='${release}' hook='${h.hook}'/>`
      })
      .join('\n\n')

    hooksSection = `## Available Hooks

${hookEntries}`
  } else {
    hooksSection = `## Available Hooks

There are no available hooks for this device.`
  }

  return `
import {
  ${imports.join(',\n  ')},
} from '/src/components/library_docs'

<BlueprintImportCard
  category='controllers'
  id='${id}'
  library='${library}'
  release='${release}'
/>

<br />

:::tip
This blueprint is part of the **${ecosystemName}**.${ecosystemLink}
:::

## Description

${description}
${hooksTip}

## Requirements

${requirements}

## Inputs

<Inputs
  category='controllers'
  id='${id}'
  library='${library}'
  release='${release}'
/>

${hooksSection}

## Changelog

<Changelog
  category='controllers'
  id='${id}'
  library='${library}'
  release='${release}'
/>
`
}

function generateHookVersionMdx(manifest, id, library, release) {
  return `
import {
  BlueprintImportCard,
  Inputs,
  Requirement,
  Changelog,
  SupportedControllers,
} from '/src/components/library_docs'

<BlueprintImportCard
  category='hooks'
  id='${id}'
  library='${library}'
  release='${release}'
/>

<br />

:::tip
This blueprint is part of the **Controllers-Hooks Ecosystem**. You can read more about this topic [here](/docs/controllers-hooks-ecosystem).
:::

## Description

${manifest.description}
:::info
An automation created with this blueprint must be linked to a [Controller](/docs/blueprints/controllers) automation. Controllers are blueprints which allow to easily integrate a wide range of controllers and use them to run a set of actions when interacting with them. They expose an abstract interface used by Hooks to create controller-based automations.

See the list of [Controllers supported by this Hook](#supported-controllers) for additional details.
:::

## Requirements

<Requirement id='controller' required/>

## Inputs

<Inputs category='hooks' id='${id}' library='${library}' release='${release}' />

## Supported Controllers

<SupportedControllers
  category='hooks'
  id='${id}'
  library='${library}'
  release='${release}'
/>

## Changelog

<Changelog category='hooks' id='${id}' library='${library}' release='${release}' />
`
}

function generateAutomationVersionMdx(manifest, id, library, release) {
  return `
import {
  BlueprintImportCard,
  Inputs,
  Requirement,
  Changelog,
} from '/src/components/library_docs'

<BlueprintImportCard
  category='automations'
  id='${id}'
  library='${library}'
  release='${release}'
/>

<br />

## Description

${manifest.description}

## Requirements

## Inputs

<Inputs category='automations' id='${id}' library='${library}' release='${release}' />

## Changelog

<Changelog category='automations' id='${id}' library='${library}' release='${release}' />
`
}

// ── Main generator ──────────────────────────────────────────────────────────

function processBlueprint(manifestPath) {
  const manifest = readYaml(manifestPath)
  const blueprintDir = path.dirname(manifestPath)
  const blueprintId = path.basename(blueprintDir)
  const category = path.basename(path.dirname(blueprintDir))

  console.log(`  ${category}/${blueprintId}`)

  // 1. Generate blueprint.json
  const blueprintJson = generateBlueprintJson(
    manifest,
    category,
    blueprintId,
    blueprintDir
  )
  writeJson(path.join(blueprintDir, 'blueprint.json'), blueprintJson)

  // 2. Generate index.mdx
  const indexMdx = generateIndexMdx(manifest, category, blueprintId)
  writeText(path.join(blueprintDir, 'index.mdx'), indexMdx)

  // 3. Walk library/release/version structure
  for (const libraryId of subdirs(blueprintDir)) {
    const libraryDir = path.join(blueprintDir, libraryId)
    const releaseIds = subdirs(libraryDir)

    // Generate library.json
    const libraryJson = generateLibraryJson(
      manifest,
      category,
      blueprintId,
      libraryId,
      releaseIds
    )
    writeJson(path.join(libraryDir, 'library.json'), libraryJson)

    for (const releaseId of releaseIds) {
      const releaseDir = path.join(libraryDir, releaseId)

      // Discover version directories
      const versions = subdirs(releaseDir).filter(isVersionDir)
      if (versions.length === 0) continue

      // Read hooks.json if it exists (controllers only)
      let hooksData = null
      const hooksPath = path.join(releaseDir, 'hooks.json')
      if (fs.existsSync(hooksPath)) {
        hooksData = readJson(hooksPath)
      }

      // Generate release.json
      const releaseJson = generateReleaseJson(
        manifest,
        category,
        blueprintId,
        libraryId,
        releaseId,
        versions
      )
      writeJson(path.join(releaseDir, 'release.json'), releaseJson)

      // Check for docs.mdx override
      const docsOverridePath = path.join(releaseDir, 'docs.mdx')
      const hasDocsOverride = fs.existsSync(docsOverridePath)
      let docsOverrideBody = null
      if (hasDocsOverride) {
        docsOverrideBody = fs.readFileSync(docsOverridePath, 'utf-8')
      }

      // Generate frontmatter (shared across all versions)
      const frontmatter = generateVersionMdxFrontmatter(manifest, category)

      // Generate default body (shared across all versions)
      let defaultBody = null
      if (!hasDocsOverride) {
        defaultBody = generateDefaultVersionMdxBody(
          manifest,
          category,
          blueprintId,
          libraryId,
          releaseId,
          hooksData
        )
      }

      for (const version of versions) {
        const versionDir = path.join(releaseDir, version)

        // Generate version.json
        const versionJson = generateVersionJson(
          manifest,
          category,
          blueprintId,
          libraryId,
          releaseId,
          version
        )
        writeJson(path.join(versionDir, 'version.json'), versionJson)

        // Generate <version>.mdx
        const body = docsOverrideBody || defaultBody
        const versionMdx = `${frontmatter}\n${body}`
        writeText(path.join(versionDir, `${version}.mdx`), versionMdx)
      }
    }
  }
}

function main() {
  console.log('Generating blueprint files from manifests...\n')

  const manifests = globSync('**/manifest.yaml', { cwd: BLUEPRINTS_DIR })

  if (manifests.length === 0) {
    console.log('No manifest.yaml files found. Nothing to generate.')
    return
  }

  console.log(`Found ${manifests.length} manifest(s):\n`)

  for (const rel of manifests) {
    processBlueprint(path.join(BLUEPRINTS_DIR, rel))
  }

  console.log(`\nDone! Generated files for ${manifests.length} blueprint(s).`)
}

main()
