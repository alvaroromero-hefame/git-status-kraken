import { Octokit } from '@octokit/rest'
import { loadToken } from '../token.js'

let cached = null // { token, octokit }

export function createOctokit(token) {
  return new Octokit({ auth: token, userAgent: 'GitStatusKraken' })
}

/** Octokit for the stored token, or null when not connected. */
export function getOctokit() {
  const token = loadToken()
  if (!token) return null
  if (cached?.token !== token) cached = { token, octokit: createOctokit(token) }
  return cached.octokit
}

export function resetOctokit() {
  cached = null
}
