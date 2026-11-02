import { classifyError } from './errors.js'

const REPOS_QUERY = `query($org: String!, $cursor: String) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor, isArchived: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes { name pushedAt }
    }
  }
}`

/** Non-archived repos of an org, most recently pushed first. Stops early at repos older than pushedSince. */
export async function listOrgRepos(octokit, org, pushedSince) {
  const repos = []
  let cursor = null
  do {
    const { organization } = await octokit.graphql(REPOS_QUERY, { org, cursor })
    const page = organization.repositories
    for (const r of page.nodes) {
      if (pushedSince && r.pushedAt && r.pushedAt < pushedSince) return repos
      repos.push({ org, name: r.name, pushedAt: r.pushedAt })
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
  } while (cursor)
  return repos
}

// Each search costs roughly one GraphQL query per repo plus pagination/compare follow-ups.
export const estimateRequests = repoCount => repoCount * 2

export const REQUEST_WARNING_THRESHOLD = 1000

/** Repos of several orgs. An org that fails (SSO, typo, no access) goes to orgFailures instead of failing the search. */
export async function listReposForOrgs(octokit, orgs, pushedSince) {
  const settled = await Promise.allSettled(orgs.map(org => listOrgRepos(octokit, org, pushedSince)))
  const repos = []
  const orgFailures = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') repos.push(...s.value)
    else orgFailures.push({ repo: orgs[i], message: classifyError(s.reason).message })
  })
  return { repos, orgFailures }
}
