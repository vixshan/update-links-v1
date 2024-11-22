// config.ts
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { Config } from '@src/types'

export const defaultConfigMsg =
  'chore: update repository links and keywords[skip ci]'

export function parseConfig(configPath: string): Config {
  try {
    const finalPath = configPath || '.github/updatelinks.yml'
    core.info(`Looking for config at: ${finalPath}`)

    const absolutePath = path.resolve(process.cwd(), finalPath)
    core.info(`Resolved absolute path: ${absolutePath}`)

    if (!fs.existsSync(absolutePath)) {
      core.warning(`Configuration file not found at ${absolutePath}`)
      throw new Error(`Configuration file not found at ${absolutePath}`)
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf8')
    core.debug(`Config file content: ${fileContent}`)

    const config = yaml.load(fileContent) as Partial<Config>
    core.debug(`Parsed config: ${JSON.stringify(config, null, 2)}`)

    return validateAndNormalizeConfig(config)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error parsing configuration: ${error.message}`)
    }
    throw new Error('Unknown error parsing configuration')
  }
}

function validateFilePattern(pattern: string): boolean {
  // If it's a URL, validate it separately
  if (pattern.startsWith('http')) {
    try {
      new URL(pattern)
      return true
    } catch {
      return false
    }
  }

  return (
    /^[a-zA-Z0-9_-]+$/.test(pattern) || // filename
    /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(pattern) || // filename.ext
    /^\*\.[a-zA-Z0-9.]+$/.test(pattern) || // *.ext (including multiple dots)
    /^[a-zA-Z0-9/_-]+$/.test(pattern) // directory paths
  )
}

function validateAndNormalizeConfig(config: Partial<Config>): Config {
  if (!config) {
    throw new Error('Configuration is empty or invalid')
  }
  if (!config.githubUrls?.types?.length && !config.links?.length) {
    throw new Error(
      'At least one of githubUrls.types or links must be configured'
    )
  }

  // Validate GitHub URL types
  if (config.githubUrls?.types) {
    const validTypes = ['username', 'repo', 'sponsors', 'all']
    const invalidTypes = config.githubUrls.types.filter(
      type => !validTypes.includes(type)
    )
    if (invalidTypes.length > 0) {
      throw new Error(
        `Invalid GitHub URL types: ${invalidTypes.join(
          ', '
        )}. Valid types are: ${validTypes.join(', ')}`
      )
    }
  }

  // Set defaults for optional fields
  const paths = config.paths || ['.']
  const files = config.files || ['*.*']
  const ignore = config.ignore || ['node_modules', '.git']

  // Validate patterns
  if (files.length && !files.every(validateFilePattern)) {
    throw new Error('Invalid file type pattern detected')
  }

  // Stricter validation for ignore patterns
  if (ignore.length) {
    const invalidPatterns = ignore.filter(
      pattern => !validateFilePattern(pattern)
    )
    if (invalidPatterns.length > 0) {
      throw new Error(`Invalid ignore patterns: ${invalidPatterns.join(', ')}`)
    }

    // Validate GitHub URLs in ignore list are complete URLs
    const githubUrls = ignore.filter(pattern =>
      pattern.startsWith('https://github.com/')
    )
    const invalidGithubUrls = githubUrls.filter(
      url =>
        !/^https:\/\/github\.com\/[a-zA-Z0-9-]+(?:\/[a-zA-Z0-9-_.]+)?(?:\.git)?$/.test(
          url
        )
    )
    if (invalidGithubUrls.length > 0) {
      throw new Error(
        `Invalid GitHub URLs in ignore list: ${invalidGithubUrls.join(', ')}`
      )
    }
  }

  const normalized: Config = {
    paths,
    files,
    links: (config.links || []).map(link => {
      if (!link.old || !link.new) {
        throw new Error('Each link must have both old and new properties')
      }
      return {
        old: link.old,
        new: processTemplate(link.new)
      }
    }),
    ignore,
    githubUrls: config.githubUrls || { types: [] },
    createPr: typeof config.createPr === 'boolean' ? config.createPr : false,
    commitMsg: config.commitMsg || defaultConfigMsg
  }

  return normalized
}

function processTemplate(value: string): string {
  if (typeof value !== 'string') return value

  // Replace GitHub-specific variables
  if (value.includes('${{ github.repository }}')) {
    return `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}`
  }

  // Replace secrets
  return value.replace(/\${{[\s]*secrets\.([\w]+)[\s]*}}/g, (_, key) => {
    const envValue = process.env[key]
    return envValue || ''
  })
}