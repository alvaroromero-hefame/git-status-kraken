import { ipcMain, shell } from 'electron'
import { cancelJob } from './jobs.js'
import { classifyError } from './errors.js'
import { getOctokit, createOctokit, resetOctokit } from './client.js'
import { saveToken, clearToken } from '../token.js'

export const DEFAULT_ORGS = ['HefameMicroservices', 'HefamePortalesB2B']

/** GitHub handlers resolve to { data } or { error: { kind, message } } so the UI gets a readable message. */
export function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { data: await fn(event, ...args) }
    } catch (err) {
      return { error: classifyError(err) }
    }
  })
}

export function requireOctokit() {
  const octokit = getOctokit()
  if (!octokit) throw Object.assign(new Error('No conectado'), { status: 401 })
  return octokit
}

export function registerAuthHandlers() {
  handle('auth:save', async (_e, token) => {
    token = String(token ?? '').trim()
    const { data } = await createOctokit(token).rest.users.getAuthenticated() // validate before storing
    saveToken(token)
    resetOctokit()
    return { login: data.login }
  })
  handle('auth:status', async () => {
    const octokit = getOctokit()
    if (!octokit) return null
    const { data } = await octokit.rest.users.getAuthenticated()
    return { login: data.login }
  })
  handle('auth:clear', async () => {
    clearToken()
    resetOctokit()
    return null
  })
  handle('gh:orgs', async () => {
    const orgs = await requireOctokit().paginate('GET /user/orgs', { per_page: 100 })
    return [...new Set([...DEFAULT_ORGS, ...orgs.map(o => o.login)])]
  })
  ipcMain.handle('gh:cancel', (_e, jobId) => cancelJob(jobId))
  ipcMain.handle('gh:open', (_e, url) => {
    if (typeof url === 'string' && url.startsWith('https://github.com/')) shell.openExternal(url)
  })
}
