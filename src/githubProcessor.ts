import * as github from '@actions/github'

export const GhUrlPatterns = {
  username: /https?:\/\/github\.com\/([a-zA-Z0-9-]+)(?!\/)(?:\s|$)/g,
  repo: /https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_.]+)(\.git)?(?:\/[^)\s]*)?/g,
  sponsors: /https?:\/\/github\.com\/sponsors\/([a-zA-Z0-9-]+)/g,
  // Updated all pattern to capture the full structure
  all: /https?:\/\/github\.com(?:\/[^)\s${}\n]*)?/g
}

export function isTemplateLiteral(str: string): boolean {
  return /\${[^}]*}/.test(str)
}

export function getUrlType(
  url: string
): 'username' | 'repo' | 'sponsors' | null {
  if (url.includes('/sponsors/')) return 'sponsors'
  const parts = url.split('/').filter(Boolean)
  if (parts.length >= 4) return 'repo'
  if (parts.length === 3 && !url.endsWith('/')) return 'username'
  return null
}

export function processGhUrls(
  content: string,
  types: Array<'username' | 'repo' | 'sponsors' | 'all'>,
  ignore: string[],
  context: typeof github.context
): string {
  let updatedContent = content
  const { owner, repo } = context.repo

  // Process each URL type based on configuration
  for (const type of types) {
    const pattern = GhUrlPatterns[type]

    updatedContent = updatedContent.replace(pattern, match => {
      // Skip if URL is in ignore list or contains template literals
      if (
        ignore.some(ignoreUrl => match.includes(ignoreUrl)) ||
        isTemplateLiteral(match)
      ) {
        return match
      }

      // For 'all' type, determine the actual URL type first
      if (type === 'all') {
        const urlType = getUrlType(match)
        if (!urlType) return match // Skip if we can't determine the type

        switch (urlType) {
          case 'sponsors':
            const sponsorMatch = match.match(/sponsors\/([a-zA-Z0-9-]+)/)
            if (sponsorMatch && sponsorMatch[1] !== owner) {
              return match.replace(sponsorMatch[1], owner)
            }
            break

          case 'repo':
            const repoMatch = match.match(
              /github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_.]+)(\.git)?/
            )
            if (
              repoMatch &&
              (repoMatch[1] !== owner || repoMatch[2] !== repo)
            ) {
              // Preserve the .git extension if it exists
              const extension = repoMatch[3] || ''
              const subpath = match.slice(
                match.indexOf(repoMatch[2]) +
                  repoMatch[2].length +
                  extension.length
              )
              return `https://github.com/${owner}/${repo}${extension}${subpath}`
            }
            break

          case 'username':
            const usernameMatch = match.match(
              /github\.com\/([a-zA-Z0-9-]+)(?!\/)/
            )
            if (usernameMatch && usernameMatch[1] !== owner) {
              return match.replace(usernameMatch[1], owner)
            }
            break
        }
      } else {
        // Original type-specific processing
        switch (type) {
          case 'username':
            const usernameMatch = match.match(/github\.com\/([a-zA-Z0-9-]+)/)
            if (usernameMatch && usernameMatch[1] !== owner) {
              return match.replace(usernameMatch[1], owner)
            }
            break

          case 'repo':
            const repoMatch = match.match(
              /github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9-_.]+)(\.git)?/
            )
            if (
              repoMatch &&
              (repoMatch[1] !== owner || repoMatch[2] !== repo)
            ) {
              // Preserve the .git extension if it exists
              const extension = repoMatch[3] || ''
              const subpath = match.slice(
                match.indexOf(repoMatch[2]) +
                  repoMatch[2].length +
                  extension.length
              )
              return `https://github.com/${owner}/${repo}${extension}${subpath}`
            }
            break

          case 'sponsors':
            const sponsorMatch = match.match(/sponsors\/([a-zA-Z0-9-]+)/)
            if (sponsorMatch && sponsorMatch[1] !== owner) {
              return match.replace(sponsorMatch[1], owner)
            }
            break
        }
      }

      return match
    })
  }

  return updatedContent
}