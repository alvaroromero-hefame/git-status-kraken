import { test, expect } from 'vitest'
import { searchBranches } from '../src/main/github/branches.js'

// Minimal fake of octokit.graphql, dispatching on the query text.
function fakeOctokit({ orgs, refs, compare }) {
  return {
    graphql: async (query, vars) => {
      if (query.includes('organization(login')) {
        const o = orgs[vars.org]
        if (o instanceof Error) throw o
        return { organization: { repositories: { pageInfo: { hasNextPage: false }, nodes: o.map(name => ({ name, pushedAt: '2026-11-01T00:00:00Z' })) } } }
      }
      if (query.includes('compare(')) return compare(vars)
      return refs(vars) // refs listing
    }
  }
}

const page = (names, next) => ({
  repository: {
    defaultBranchRef: { name: 'master' },
    refs: { pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null }, nodes: names.map(name => ({ name, target: { committedDate: '2026-10-01T00:00:00Z' } })) }
  },
  rateLimit: { remaining: 4000 }
})

test('an org that fails (SSO) is listed in failures and the other org still returns rows', async () => {
  const sso = Object.assign(new Error('SAML'), { errors: [{ type: 'FORBIDDEN', message: 'Resource protected by organization SAML enforcement.' }] })
  const octokit = fakeOctokit({
    orgs: { Blocked: sso, Ok: ['r1'] },
    refs: vars => (vars.q === 'snapshot' ? page([]) : page(['feature/TEC-1'])),
    compare: () => ({ repository: { b0: { name: 'feature/TEC-1', d: { behindBy: 0 } } }, rateLimit: { remaining: 3999 } })
  })
  const res = await searchBranches(octokit, { orgs: ['Blocked', 'Ok'], text: 'TEC' }, undefined, () => {})
  expect(res.rows.map(r => r.branch)).toEqual(['feature/TEC-1'])
  expect(res.failures).toEqual([{ repo: 'Blocked', message: expect.stringContaining('SSO') }])
})

test('snapshot branches beyond the first page are compared too', async () => {
  const first = Array.from({ length: 100 }, (_, i) => `v1.${i}.0/snapshot/rc1`)
  const octokit = fakeOctokit({
    orgs: { Ok: ['r1'] },
    refs: vars => {
      if (vars.q !== 'snapshot') return page(['feature/TEC-1'])
      return vars.cursor ? page(['v9.0.0/snapshot/rc1']) : page(first, 'c1')
    },
    compare: vars => {
      const node = { name: 'feature/TEC-1', d: { behindBy: 3 } }
      Object.entries(vars).forEach(([k, v]) => { if (/^s\d+$/.test(k)) node[k] = { behindBy: v === 'v9.0.0/snapshot/rc1' ? 0 : 5 } })
      return { repository: { b0: node }, rateLimit: { remaining: 3000 } }
    }
  })
  const res = await searchBranches(octokit, { orgs: ['Ok'], text: 'TEC' }, undefined, () => {})
  expect(res.rows[0].snapshot).toEqual({ status: 'merged', mergedInto: ['v9.0.0/snapshot/rc1'] })
  expect(res.rows[0].release).toBe('not-merged')
})

test('a compare that fails is "unknown", not "missing"', async () => {
  const octokit = fakeOctokit({
    orgs: { Ok: ['r1'] },
    refs: vars => (vars.q === 'snapshot' ? page(['v1.0.0/snapshot/rc1']) : page(['feature/TEC-1'])),
    compare: () => { throw Object.assign(new Error('partial'), { data: { repository: { b0: { name: 'feature/TEC-1', d: null, s0: null } } } }) }
  })
  const res = await searchBranches(octokit, { orgs: ['Ok'], text: 'TEC' }, undefined, () => {})
  expect(res.rows[0].snapshot.status).toBe('unknown')
  expect(res.rows[0].release).toBe('unknown')
})
