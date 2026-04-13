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

const BLUEPRINTS_DIR = path.resolve(import.meta.dirname, '../docs/blueprints')
const TEMPLATES_DIR = path.resolve(import.meta.dirname, 'templates')

// ── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = {
  index: fs.readFileSync(path.join(TEMPLATES_DIR, 'index.mdx.tmpl'), 'utf-8'),
  controllerNoHooks: fs.readFileSync(
    path.join(TEMPLATES_DIR, 'controller-no-hooks.mdx.tmpl'),
    'utf-8',
  ),
  controllerWithHooks: fs.readFileSync(
    path.join(TEMPLATES_DIR, 'controller-with-hooks.mdx.tmpl'),
    'utf-8',
  ),
  hook: fs.readFileSync(path.join(TEMPLATES_DIR, 'hook.mdx.tmpl'), 'utf-8'),
  automation: fs.readFileSync(
    path.join(TEMPLATES_DIR, 'automation.mdx.tmpl'),
    'utf-8',
  ),
}

/** Replace all {{key}} placeholders in a template string. */
function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    key in vars ? vars[key] : match,
  )
}

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

/** Get release-specific config, falling back to manifest-level defaults. */
function getReleaseConfig(manifest, releaseId) {
  const releaseOverride = manifest.releases?.[releaseId] || {}
  return {
    supported_hooks:
      releaseOverride.supported_hooks || manifest.supported_hooks || [],
    supported_integrations:
      releaseOverride.supported_integrations ||
      manifest.supported_integrations ||
      [],
    supported_controllers:
      releaseOverride.supported_controllers ||
      manifest.supported_controllers ||
      null,
  }
}

// ── File generators ─────────────────────────────────────────────────────────

function generateBlueprintJson(manifest, category, blueprintId, blueprintDir) {
  const hasImage = fs.existsSync(path.join(blueprintDir, `${blueprintId}.png`))
  const hasPdf = fs.existsSync(path.join(blueprintDir, `${blueprintId}.pdf`))

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

function buildFrontmatter(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

function generateIndexMdx(manifest, category, blueprintId) {
  const fields = {
    blueprint_id: blueprintId,
    category,
    title: manifest.name,
    description: manifest.description,
  }

  if (category === 'controllers') {
    fields.manufacturer = manifest.manufacturer
    fields.model = manifest.model
    fields.model_name = manifest.model_name
  }

  return renderTemplate(TEMPLATES.index, {
    frontmatter: buildFrontmatter(fields),
    category,
    id: blueprintId,
  })
}

function generateLibraryJson(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseIds,
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
  versions,
  releaseConfig,
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

  if (category === 'controllers' && releaseConfig.supported_hooks) {
    result.supported_hooks = releaseConfig.supported_hooks
    result.supported_integrations = releaseConfig.supported_integrations
  }

  if (category === 'hooks' && releaseConfig.supported_controllers) {
    result.supported_controllers = releaseConfig.supported_controllers
  }

  return result
}

function generateVersionJson(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseId,
  version,
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

function buildVersionFrontmatter(manifest, category) {
  const fields = {
    title: manifest.name,
    description: manifest.description,
  }

  if (category === 'controllers') {
    fields.manufacturer = manifest.manufacturer
    fields.model = manifest.model
    fields.model_name = manifest.model_name
    fields.integrations = `[${manifest.supported_integrations.join(', ')}]`
  }

  return buildFrontmatter(fields)
}

function buildRequirements(integrations) {
  return integrations
    .map((integ) => {
      const reqId = INTEGRATION_TO_REQUIREMENT_ID[integ.toLowerCase()]
      return reqId ? `<Requirement id='${reqId}'/>` : null
    })
    .filter(Boolean)
    .join('\n')
}

function buildHooksSections(hooksData, id, library, release) {
  if (!hooksData) return ''
  return hooksData.hooks
    .map((h) => {
      const desc = HOOK_DESCRIPTIONS[h.hook] || ''
      return `### ${h.label}

${desc}

<SupportedHooks category='controllers' id='${id}' library='${library}' release='${release}' hook='${h.hook}'/>`
    })
    .join('\n\n')
}

function generateDefaultVersionMdx(
  manifest,
  category,
  blueprintId,
  libraryId,
  releaseId,
  hooksData,
  releaseConfig,
) {
  const hooks = releaseConfig.supported_hooks
  const hasHooks = hooks && hooks.length > 0 && hooks[0] !== 'none'

  const vars = {
    frontmatter: buildVersionFrontmatter(manifest, category),
    id: blueprintId,
    library: libraryId,
    release: releaseId,
    description: manifest.description,
    model_name: manifest.model_name || '',
    integrations_csv: (manifest.supported_integrations || []).join(', '),
    multi_integration_note:
      hasHooks && (manifest.supported_integrations || []).length > 1
        ? ' Just specify the integration used to connect the remote to Home Assistant when setting up the automation, and the blueprint will take care of all the rest.'
        : '',
    requirements: buildRequirements(manifest.supported_integrations || []),
    hooks_sections: buildHooksSections(
      hooksData,
      blueprintId,
      libraryId,
      releaseId,
    ),
  }

  if (category === 'controllers') {
    const template = hasHooks
      ? TEMPLATES.controllerWithHooks
      : TEMPLATES.controllerNoHooks
    return renderTemplate(template, vars)
  }

  if (category === 'hooks') {
    return renderTemplate(TEMPLATES.hook, vars)
  }

  return renderTemplate(TEMPLATES.automation, vars)
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
    blueprintDir,
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
      releaseIds,
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

      // Resolve per-release config (with fallback to manifest defaults)
      const releaseConfig = getReleaseConfig(manifest, releaseId)

      // Generate release.json
      const releaseJson = generateReleaseJson(
        manifest,
        category,
        blueprintId,
        libraryId,
        releaseId,
        versions,
        releaseConfig,
      )
      writeJson(path.join(releaseDir, 'release.json'), releaseJson)

      // Check for docs.mdx override
      const docsOverridePath = path.join(releaseDir, 'docs.mdx')
      const hasDocsOverride = fs.existsSync(docsOverridePath)

      // Build version MDX content (shared across all versions of this release)
      let versionMdxContent
      if (hasDocsOverride) {
        const docsBody = fs.readFileSync(docsOverridePath, 'utf-8')
        const frontmatter = buildVersionFrontmatter(manifest, category)
        versionMdxContent = `---\n${frontmatter}\n---\n${docsBody}`
      } else {
        versionMdxContent = generateDefaultVersionMdx(
          manifest,
          category,
          blueprintId,
          libraryId,
          releaseId,
          hooksData,
          releaseConfig,
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
          version,
        )
        writeJson(path.join(versionDir, 'version.json'), versionJson)

        // Generate <version>.mdx
        writeText(path.join(versionDir, `${version}.mdx`), versionMdxContent)
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
