import { listOrgRepos, estimateRequests, REQUEST_WARNING_THRESHOLD } from './repos.js'
import { mapLimit } from './pool.js'
import { classifyError } from './errors.js'

const CONCURRENCY = 5

const BRANCH_COMMITS_QUERY = `query($owner: String!, $name: String!, $cursor: String, $since: GitTimestamp!, $until: GitTimestamp!, $authorId: ID!) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        target {
          ... on Commit {
            committedDate
            history(first: 100, since: $since, until: $until, author: { id: $authorId }) {
              nodes { oid messageHeadline committedDate url }
            }
          }
        }
      }
    }
  }
  rateLimit { remaining resetAt }
}`

/** One row per (repo, sha), listing every branch that contains it, newest first. */
export function dedupeCommits(rows) {
  const byKey = new Map()
  for (const r of rows) {
    const key = `${r.org}/${r.repo}@${r.sha}`
    const existing = byKey.get(key)
    if (existing) existing.branches.push(r.branch)
    else byKey.set(key, { org: r.org, repo: r.repo, branches: [r.branch], sha: r.sha, date: r.date, message: r.message, url: r.url })
  }
  const out = [...byKey.values()]
  for (const c of out) c.branches.sort()
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

async function repoCommits(octokit, repo, vars, state) {
  const rows = []
  let cursor = null
  do {
    const res = await octokit.graphql(BRANCH_COMMITS_QUERY, { owner: repo.org, name: repo.name, cursor, ...vars })
    state.rateLimitRemaining = res.rateLimit.remaining
    const refs = res.repository.refs
    for (const ref of refs.nodes) {
      const tip = ref.target
      // Branches whose last commit is older than the range cannot contain commits in it.
      if (!tip?.history || tip.committedDate < vars.since) continue
      // shortcut: only the first 100 matching commits per branch; paginate history if someone needs more.
      for (const c of tip.history.nodes) {
        rows.push({ org: repo.org, repo: repo.name, branch: ref.name, sha: c.oid, date: c.committedDate, message: c.messageHeadline, url: c.url })
      }
    }
    cursor = refs.pageInfo.hasNextPage ? refs.pageInfo.endCursor : null
  } while (cursor && !vars.signal?.aborted)
  return rows
}

/**
 * Commits by `login` in [since, until] across every branch of every repo of `orgs`.
 * Returns { needsConfirm, estimate } instead when the search looks too expensive and `confirmed` is not set.
 */
export async function searchCommits(octokit, { orgs, login, since, until, confirmed }, signal, progress) {
  const { user } = await octokit.graphql('query($login: String!) { user(login: $login) { id } }', { login })
  if (!user) throw new Error(`No existe el usuario de GitHub "${login}"`)

  const repos = (await Promise.all(orgs.map(org => listOrgRepos(octokit, org, since)))).flat()
  const estimate = estimateRequests(repos.length)
  if (estimate > REQUEST_WARNING_THRESHOLD && !confirmed) return { needsConfirm: true, estimate }

  const state = { rateLimitRemaining: null }
  let done = 0
  progress(0, repos.length)
  const { results, failures } = await mapLimit(repos, CONCURRENCY, async repo => {
    try {
      return await repoCommits(octokit, repo, { since, until, authorId: user.id, signal }, state)
    } finally {
      progress(++done, repos.length)
    }
  }, signal)

  return {
    rows: dedupeCommits(results.filter(Boolean).flat()),
    failures: failures.map(f => ({ repo: `${f.item.org}/${f.item.name}`, message: classifyError(f.error).message })),
    rateLimitRemaining: state.rateLimitRemaining,
    cancelled: Boolean(signal?.aborted)
  }
}
