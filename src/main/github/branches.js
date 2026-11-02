import { listReposForOrgs, estimateRequests, REQUEST_WARNING_THRESHOLD } from './repos.js'
import { mapLimit } from './pool.js'
import { classifyError } from './errors.js'

const CONCURRENCY = 5
const MAX_COMPARES_PER_QUERY = 100

// "Merged into X" = the branch has no commits that X lacks. GraphQL compare is
// base = branch, head = X, so behindBy counts commits in the branch missing from X.
export function mergeStatus(comparison) {
  if (!comparison) return 'missing'
  return comparison.behindBy === 0 ? 'merged' : 'not-merged'
}

/** Snapshot rule (decided with Álvaro): merged if contained in ANY branch whose name contains "snapshot". */
// A null comparison means the compare itself failed: that is "unknown", never "merged" or "missing".
export function summarizeSnapshots(comparisons) {
  if (!comparisons.length) return { status: 'missing', mergedInto: [] }
  const mergedInto = comparisons.filter(c => c.comparison?.behindBy === 0).map(c => c.name)
  if (mergedInto.length) return { status: 'merged', mergedInto }
  const anyUnknown = comparisons.some(c => !c.comparison)
  return { status: anyUnknown ? 'unknown' : 'not-merged', mergedInto: [] }
}

function releaseStatus(defaultBranch, isDefault, comparison) {
  if (!defaultBranch) return 'missing'
  if (isDefault) return 'merged'
  return comparison ? mergeStatus(comparison) : 'unknown'
}

export const isSnapshotBranch = name => /snapshot/i.test(name)

/** How many matching branches fit in one compare query, given one compare per snapshot branch plus the default branch. */
export const chunkSize = snapshotCount => Math.max(1, Math.floor(MAX_COMPARES_PER_QUERY / (snapshotCount + 1)))

const REFS_QUERY = `query($owner: String!, $name: String!, $q: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    refs(refPrefix: "refs/heads/", query: $q, first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { name target { ... on Commit { committedDate } } }
    }
  }
  rateLimit { remaining }
}`

/** All branches whose name matches q (GitHub substring match), following every page. */
async function listRefs(octokit, repo, q, state) {
  const refs = []
  let defaultBranch = null
  let cursor = null
  do {
    const res = await octokit.graphql(REFS_QUERY, { owner: repo.org, name: repo.name, q, cursor })
    state.rateLimitRemaining = res.rateLimit.remaining
    defaultBranch = res.repository.defaultBranchRef?.name ?? null
    refs.push(...res.repository.refs.nodes)
    const info = res.repository.refs.pageInfo
    cursor = info.hasNextPage ? info.endCursor : null
  } while (cursor)
  return { refs, defaultBranch }
}

// Builds one query comparing each branch in `branches` against the default branch and every snapshot branch.
// All names travel as variables so quotes or odd characters in branch names cannot break the query.
function buildCompareQuery(branches, defaultBranch, snaps) {
  const vars = {}
  const varDefs = ['$owner: String!', '$name: String!']
  const addVar = (key, value) => {
    vars[key] = value
    varDefs.push(`$${key}: String!`)
    return `$${key}`
  }
  const dVar = defaultBranch ? addVar('d', defaultBranch) : null
  const sVars = snaps.map((s, j) => addVar(`s${j}`, s))
  const fields = branches.map((b, i) => {
    const bVar = addVar(`b${i}`, `refs/heads/${b}`)
    const compares = []
    if (dVar && b !== defaultBranch) compares.push(`d: compare(headRef: ${dVar}) { behindBy }`)
    snaps.forEach((s, j) => { if (s !== b) compares.push(`s${j}: compare(headRef: ${sVars[j]}) { behindBy }`) })
    return `b${i}: ref(qualifiedName: ${bVar}) { name ${compares.join(' ')} }`
  })
  return { query: `query(${varDefs.join(', ')}) { repository(owner: $owner, name: $name) { ${fields.join(' ')} } rateLimit { remaining } }`, vars }
}

async function graphqlPartial(octokit, query, vars) {
  try {
    return await octokit.graphql(query, vars)
  } catch (err) {
    // A compare that fails (e.g. unrelated histories) comes back as a partial error; keep the rest of the data.
    if (err.data) return err.data
    throw err
  }
}

async function repoBranches(octokit, repo, text, state) {
  const needle = text.toLowerCase()
  const { refs, defaultBranch } = await listRefs(octokit, repo, text, state)
  const matches = refs.filter(n => n.name.toLowerCase().includes(needle))
  if (!matches.length) return [] // most repos stop here: one query each

  const snaps = (await listRefs(octokit, repo, 'snapshot', state)).refs.map(n => n.name).filter(isSnapshotBranch)
  const rows = []
  const size = chunkSize(snaps.length)
  for (let i = 0; i < matches.length; i += size) {
    const chunk = matches.slice(i, i + size)
    const { query, vars } = buildCompareQuery(chunk.map(m => m.name), defaultBranch, snaps)
    const data = await graphqlPartial(octokit, query, { owner: repo.org, name: repo.name, ...vars })
    if (data.rateLimit) state.rateLimitRemaining = data.rateLimit.remaining
    chunk.forEach((m, k) => {
      const node = data.repository?.[`b${k}`]
      const isDefault = m.name === defaultBranch
      rows.push({
        org: repo.org,
        repo: repo.name,
        branch: m.name,
        lastCommit: m.target?.committedDate ?? null,
        defaultBranch,
        release: releaseStatus(defaultBranch, isDefault, node?.d),
        snapshot: summarizeSnapshots(snaps.filter(s => s !== m.name).map(s => ({ name: s, comparison: node?.[`s${snaps.indexOf(s)}`] ?? null })))
      })
    })
  }
  return rows
}

export async function searchBranches(octokit, { orgs, text, confirmed }, signal, progress) {
  text = String(text ?? '').trim()
  if (text.length < 2) throw new Error('Escribe al menos 2 caracteres')

  const { repos, orgFailures } = await listReposForOrgs(octokit, orgs)
  const estimate = estimateRequests(repos.length)
  if (estimate > REQUEST_WARNING_THRESHOLD && !confirmed) return { needsConfirm: true, estimate }

  const state = { rateLimitRemaining: null }
  let done = 0
  progress(0, repos.length)
  const { results, failures } = await mapLimit(repos, CONCURRENCY, async repo => {
    try {
      return await repoBranches(octokit, repo, text, state)
    } finally {
      progress(++done, repos.length)
    }
  }, signal)

  return {
    rows: results.filter(Boolean).flat(),
    failures: [...orgFailures, ...failures.map(f => ({ repo: `${f.item.org}/${f.item.name}`, message: classifyError(f.error).message }))],
    rateLimitRemaining: state.rateLimitRemaining,
    cancelled: Boolean(signal?.aborted)
  }
}
