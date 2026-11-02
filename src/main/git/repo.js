import { runGit } from './run.js'
import { parseStatus, parseLog, parseRefs } from './parse.js'

const SHA_RE = /^[0-9a-f]{4,40}$/

export async function resolveRepoRoot(dir) {
  try {
    return (await runGit(dir, ['rev-parse', '--show-toplevel'])).trim()
  } catch {
    return null
  }
}

export async function getStatus(cwd) {
  return parseStatus(await runGit(cwd, ['status', '--porcelain=v2', '--branch', '-z']))
}

export async function getLog(cwd, limit = 500) {
  try {
    return parseLog(await runGit(cwd, ['log', '--all', '--topo-order', '-n', String(limit),
      '--format=%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e']))
  } catch (err) {
    // A freshly initialised repo has no HEAD yet; that is "no commits", not an error.
    if (/does not have any commits yet|bad default revision/i.test(err.message)) return []
    throw err
  }
}

export async function getRefs(cwd) {
  return parseRefs(await runGit(cwd, ['for-each-ref', '--format=%(refname)%1f%(objectname)%1f%(*objectname)',
    'refs/heads', 'refs/remotes', 'refs/tags']))
}

export async function getCommitDetail(cwd, sha) {
  if (!SHA_RE.test(sha)) throw new Error('SHA inválido')
  const head = await runGit(cwd, ['show', '-s', '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%B', sha, '--'])
  const [fullSha, author, email, date, message] = head.split('\x1f')
  const names = await runGit(cwd, ['show', '--name-status', '--format=', sha, '--'])
  const files = names.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t')
    // Renames/copies are "R100\told\tnew": show the new path.
    return { status: parts[0][0], path: parts[parts.length - 1] }
  })
  return { sha: fullSha, author, email, date, message: message.trim(), files }
}
