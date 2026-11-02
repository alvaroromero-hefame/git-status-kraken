# GitStatusKraken Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A portable Windows desktop app (Electron + React) with a GitKraken-style UI. It does three things:
- shows `git status` and a branch graph for a local repo;
- lists a user's commits across the GitHub orgs in a date range;
- finds branches by text and tells whether they are merged into `snapshot` and `master`.

**Architecture:** The Electron main process owns everything privileged: the encrypted PAT, `git` via `execFile`, and GitHub GraphQL via `@octokit/rest`'s `octokit.graphql`. The preload exposes a small `window.api`. The React renderer only renders. Pure logic lives in side-effect-free modules so vitest can test it without Electron: the parsers, lane assignment, dedupe, merge status, error classification and the concurrency pool.

**Tech Stack:** Electron, electron-vite, React 18, @vitejs/plugin-react, @octokit/rest, vitest, electron-builder (portable target). Plain JavaScript (JSX), no TypeScript, no UI library.

**Spec:** `docs/superpowers/specs/2026-11-02-gitstatuskraken-design.md`

## Global Constraints

- Read-only: never run a git command that writes (no commit, push, merge, checkout, fetch). Never call GitHub mutations.
- The token never leaves the main process. Store it with `safeStorage.encryptString` in `app.getPath('userData')/token.bin`. If `safeStorage.isEncryptionAvailable()` is false, refuse to save it.
- `BrowserWindow`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Run git with `execFile('git', args, { cwd })`, never through a shell. Validate every SHA that comes from the renderer against `/^[0-9a-f]{4,40}$/`.
- Default orgs: `HefameMicroservices` and `HefamePortalesB2B`, both checked by default. Remember the last selection in renderer `localStorage`, wrapped in try/catch.
- "Merged into X": X is exactly `snapshot`, or exactly `master`. The branch is merged if it has 0 commits not contained in X. If X does not exist in the repo, show `—`.
- GitHub concurrency: 5 repos in parallel.
- The graph shows the 500 most recent commits (`--all --topo-order`).
- Default date range: the last 30 days.
- Before a GitHub search, if the estimated number of requests is > 1000, ask the user to confirm.
- Dark theme by default. Layout: left icon sidebar; repo view with three columns (branches | graph | commit detail) and a WIP block above the graph.
- UI text in Spanish; code, identifiers and commits in English.

## Review Focus

1. Repo with no commits yet (fresh `git init`). Status shows; the graph shows "Sin commits"; no crash. → test in Task 2.
2. Detached HEAD. The header shows `HEAD detached at <sha>` instead of a branch name. → test in Task 2.
3. Paths with spaces and accents (`carpeta ñ/a b.txt`) in status. They show unquoted and intact; parse with `-z`. → test in Task 2.
4. Repo without a `snapshot` branch, or without `master`. Show `—`, not an error, and the other repos still show. → test in Task 8.
5. Token not SSO-authorized, expired, or rate-limited mid-search. Show a clear Spanish message, keep the repos that succeeded, list the ones that failed. → tests in Task 5 (classification) and Task 6 (failures don't abort the pool).

---

### Task 1: Scaffold, git init, dark app shell

**Files:**
- Create: `package.json`, `electron.vite.config.mjs`, `.gitignore` (`node_modules`, `out`, `dist`)
- Create: `src/main/index.js`, `src/preload/index.js`
- Create: `src/renderer/index.html`, `src/renderer/src/main.jsx`, `src/renderer/src/App.jsx`, `src/renderer/src/styles.css`
- Create: `src/renderer/src/components/Sidebar.jsx`
- Test: `tests/smoke.test.js`

**Interfaces:**
- Produces: `App` renders `<Sidebar active onChange />` plus one view per key. The keys are `'repo' | 'commits' | 'branches' | 'settings'`, with placeholder views for now.
- Produces: CSS variables on `:root` that every later view uses: `--bg`, `--panel`, `--panel-2`, `--border`, `--text`, `--muted`, `--accent`, `--ok`, `--bad`. Also `--lane-0` through `--lane-7`, the graph lane palette.

- [ ] **Step 1:** Run `git init`. Then `npm init -y`. Install dev dependencies: `electron electron-vite vite @vitejs/plugin-react vitest electron-builder`. Install dependencies: `react@18 react-dom@18 @octokit/rest`.
- [ ] **Step 2:** Add scripts:
  - `"dev": "electron-vite dev"`
  - `"build": "electron-vite build"`
  - `"test": "vitest run"`
  - `"dist": "electron-vite build && electron-builder --win portable"`
  - `"main": "out/main/index.js"`
- [ ] **Step 3:** Write `tests/smoke.test.js` with `expect(1 + 1).toBe(2)`. Run `npm test`. Expected: 1 passed.
- [ ] **Step 4:** Implement the main window: 1400×900, `backgroundColor: '#1b1d23'`, title `GitStatusKraken`, security flags from Global Constraints. Implement the renderer shell: sidebar with 4 icon buttons (inline SVG plus `title`/`aria-label` in Spanish: "Repo local", "Mis commits", "Buscar ramas", "Ajustes") and the dark CSS variables.
- [ ] **Step 5:** Run `npm run dev`. Expected: a dark window opens and clicking each sidebar icon swaps the placeholder view.
- [ ] **Step 6:** Commit with the message `chore: scaffold electron-vite react app with dark shell`.

### Task 2: Local git backend (status, log, refs, show)

**Files:**
- Create: `src/main/git/run.js`, `src/main/git/parse.js`, `src/main/git/repo.js`
- Test: `tests/git-parse.test.js`, `tests/git-repo.test.js`

**Interfaces:**
- Produces from `parse.js` (pure):
  - `parseStatus(rawZ: string) -> { head: string, detached: boolean, upstream: string|null, ahead: number, behind: number, staged: string[], modified: string[], untracked: string[], conflicts: string[] }`
  - `parseLog(raw: string) -> Commit[]`, where `Commit = { sha, parents: string[], author, date /*ISO*/, refs: string[], subject }`
  - `parseRefs(raw: string) -> { local: Ref[], remote: Ref[], tags: Ref[] }`, where `Ref = { name, sha }`
- Produces from `repo.js` (uses `run.js`):
  - `getStatus(cwd)`
  - `getLog(cwd, limit = 500) -> Commit[]`, which returns `[]` when the repo has no commits
  - `getRefs(cwd)`
  - `getCommitDetail(cwd, sha) -> { sha, author, email, date, message, files: {status, path}[] }`
  - `resolveRepoRoot(dir) -> string|null`
- `run.js`: `runGit(cwd, args) -> Promise<string>`. It uses `execFile` with `maxBuffer: 50 * 1024 * 1024` and rejects with git's stderr.

Commands:
- status: `git status --porcelain=v2 --branch -z`
- log: `git log --all --topo-order -n <limit> --format=%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e`
- refs: `git for-each-ref --format=%(refname)%x1f%(objectname) refs/heads refs/remotes refs/tags`
- detail: `git show -s --format=%H%x1f%an%x1f%ae%x1f%aI%x1f%B <sha>`, then `git show --name-status --format= <sha>`

- [ ] **Step 1: Write failing parser tests**

```js
test('parseStatus: branch, ab, staged/modified/untracked/conflict, paths with spaces and ñ', () => {
  const raw = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 a a carpeta ñ/a b.txt',
    '1 .M N... 100644 100644 100644 a a src/x.js',
    '2 R. N... 100644 100644 100644 a a R100 new.txt', 'old.txt',
    'u UU N... 1 1 1 1 a a a conf.txt',
    '? nuevo fichero.md', ''].join('\0')
  expect(parseStatus(raw)).toEqual({ head: 'main', detached: false, upstream: 'origin/main', ahead: 2, behind: 1,
    staged: ['carpeta ñ/a b.txt', 'new.txt'], modified: ['src/x.js'], untracked: ['nuevo fichero.md'], conflicts: ['conf.txt'] })
})
test('parseStatus: detached HEAD', () => {
  const s = parseStatus(['# branch.oid 1234567890abcdef', '# branch.head (detached)', ''].join('\0'))
  expect(s.detached).toBe(true); expect(s.head).toBe('1234567')
})
test('parseLog: parents, refs split, root commit has no parents', () => {
  const raw = 'b\x1fa\x1fAna\x1f2026-11-01T10:00:00+01:00\x1fHEAD -> main, origin/main, tag: v1\x1fsecond\x1e\n' +
              'a\x1f\x1fAna\x1f2026-10-31T10:00:00+01:00\x1f\x1ffirst\x1e\n'
  const [b, a] = parseLog(raw)
  expect(b.parents).toEqual(['a']); expect(b.refs).toEqual(['HEAD -> main', 'origin/main', 'tag: v1'])
  expect(a.parents).toEqual([]); expect(a.refs).toEqual([])
})
test('parseRefs groups heads, remotes (minus */HEAD), tags', () => {
  const raw = 'refs/heads/main\x1f1\nrefs/remotes/origin/HEAD\x1f1\nrefs/remotes/origin/dev\x1f2\nrefs/tags/v1\x1f3\n'
  expect(parseRefs(raw)).toEqual({ local: [{ name: 'main', sha: '1' }], remote: [{ name: 'origin/dev', sha: '2' }], tags: [{ name: 'v1', sha: '3' }] })
})
```

- [ ] **Step 2:** Run `npx vitest run tests/git-parse.test.js`. Expected: FAIL because the module is not found.
- [ ] **Step 3:** Implement `parse.js`. In `-z` porcelain v2:
  - a type `2` entry is followed by its original path as the next NUL field, which must be skipped;
  - `X != '.'` means staged and `Y != '.'` means modified; an entry with both goes in both lists;
  - the path is everything after the fixed number of space-separated fields: 8 for type `1`, 9 for type `2`, 10 for `u`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Write the integration test** `tests/git-repo.test.js`. It creates a temp dir with `fs.mkdtempSync` and runs `git init`. Assert:
  - `getLog` returns `[]` and `getStatus(dir).untracked` is `[]`;
  - after writing `a.txt`, `getStatus(dir).untracked` equals `['a.txt']`;
  - after `git -c user.name=t -c user.email=t@t commit` of that file, `getLog(dir)` has length 1 and `getCommitDetail(dir, sha).files` equals `[{status:'A', path:'a.txt'}]`;
  - `resolveRepoRoot(os.tmpdir())` returns `null`;
  - `getCommitDetail(dir, '--output=x')` rejects with `'SHA inválido'`.
- [ ] **Step 6:** Implement `run.js` and `repo.js`. `getLog` catches git's "does not have any commits yet" error and returns `[]`.
- [ ] **Step 7:** Run `npm test`. Expected: all pass.
- [ ] **Step 8:** Commit with the message `feat: local git status/log/refs/show backend`.

### Task 3: Graph lane assignment

**Files:**
- Create: `src/renderer/src/graph/lanes.js`
- Test: `tests/lanes.test.js`

**Interfaces:**
- Consumes: `Commit[]` from Task 2, in topo order, newest first.
- Produces: `assignLanes(commits) -> { rows: { sha, lane }[], edges: { fromRow, fromLane, travelLane, toRow /*null = parent outside window*/, toLane /*null when toRow null*/ }[], laneCount }`

Algorithm, which the tests don't fully determine:

```
active = []                    // active[i] = sha that lane i is waiting for, or null
pending = Map sha -> [edgeIdx] // edges whose parent hasn't been placed yet
for row, c in commits:
  lane = active.indexOf(c.sha); if lane == -1: lane = first null in active, else active.length
  for every other i with active[i] == c.sha: active[i] = null      // branches converging here
  resolve every edge in pending[c.sha]: toRow = row, toLane = lane
  active[lane] = null
  for k, p in c.parents:
    travel = k == 0 ? lane : (active.indexOf(p) != -1 ? active.indexOf(p) : first null in active, else active.length)
    active[travel] = p
    edges.push({ fromRow: row, fromLane: lane, travelLane: travel, toRow: null, toLane: null }); add to pending[p]
  rows.push({ sha: c.sha, lane })
laneCount = 1 + max lane/travelLane seen
```

- [ ] **Step 1: Write failing tests**

```js
const C = (sha, ...parents) => ({ sha, parents })
test('linear history stays in lane 0', () => {
  const r = assignLanes([C('c', 'b'), C('b', 'a'), C('a')])
  expect(r.rows.map(x => x.lane)).toEqual([0, 0, 0]); expect(r.laneCount).toBe(1)
})
test('merge commit opens lane 1 for second parent and it closes back into lane 0', () => {
  const r = assignLanes([C('m', 'a', 'b'), C('b', 'a'), C('a')])
  expect(r.rows.map(x => x.lane)).toEqual([0, 1, 0])
  expect(r.edges).toEqual([
    { fromRow: 0, fromLane: 0, travelLane: 0, toRow: 2, toLane: 0 },
    { fromRow: 0, fromLane: 0, travelLane: 1, toRow: 1, toLane: 1 },
    { fromRow: 1, fromLane: 1, travelLane: 1, toRow: 2, toLane: 0 }])
})
test('two branch tips sharing a parent get separate lanes', () => {
  expect(assignLanes([C('x', 'a'), C('y', 'a'), C('a')]).rows.map(r => r.lane)).toEqual([0, 1, 0])
})
test('parent outside window leaves toRow null', () => {
  expect(assignLanes([C('b', 'zzz')]).edges[0].toRow).toBeNull()
})
```

- [ ] **Step 2:** Run `npx vitest run tests/lanes.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `assignLanes` following the algorithm above.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: graph lane assignment`.

### Task 4: Repo view (GitKraken-style)

**Files:**
- Modify: `src/main/index.js` (IPC handlers), `src/preload/index.js`
- Create: `src/renderer/src/views/RepoView.jsx`, `src/renderer/src/components/BranchPanel.jsx`, `src/renderer/src/components/GraphView.jsx`, `src/renderer/src/components/CommitDetail.jsx`, `src/renderer/src/components/WipHeader.jsx`

**Interfaces:**
- Consumes: from Task 2, `getStatus`, `getLog`, `getRefs`, `getCommitDetail` and `resolveRepoRoot`. From Task 3, `assignLanes`.
- Produces from `window.api`:
  - `repo.choose() -> Promise<string|null>`. The main process opens the dialog, resolves the root, remembers it as `currentRepo` and returns the path, or `null` if the user cancels or it is not a repo.
  - `repo.load() -> Promise<{ status, log, refs }>`, which acts on `currentRepo`.
  - `repo.detail(sha) -> Promise<CommitDetail>`.
- The renderer never sends a filesystem path.

- [ ] **Step 1:** Add IPC handlers with `ipcMain.handle('repo:choose' | 'repo:load' | 'repo:detail')`. Expose them in the preload with `contextBridge.exposeInMainWorld('api', …)`.
- [ ] **Step 2:** Build `RepoView`. Top bar: "Abrir repositorio", the repo name and a "Refrescar" button. Below it, three columns:
  - `BranchPanel`: collapsible "Local", "Remoto" and "Tags". Clicking a ref scrolls the graph to its commit and selects it.
  - `WipHeader` plus `GraphView`.
  - `CommitDetail`.

  If `resolveRepoRoot` failed, show "No es un repositorio git".
- [ ] **Step 3:** Build `GraphView`:
  - 28px rows. Left part is an SVG column of width `laneCount * 16 + 16`.
  - Each commit is a circle with r=5, filled with `var(--lane-{lane % 8})`.
  - Each edge is a path: from (fromLane, fromRow) a curve to (travelLane, fromRow+1), then vertical down to (travelLane, toRow-1), then a curve into (toLane, toRow). When `toRow` is null, draw the line to the bottom of the list.
  - Right of the SVG: ref pills (remote refs dimmed, tags with a tag icon), the subject, the author and a relative date via `Intl.RelativeTimeFormat('es')`.
  - The selected row is highlighted. ↑ and ↓ move the selection.
  - With an empty log, show "Sin commits".
- [ ] **Step 4:** Build `WipHeader`. It shows the branch (or `HEAD detached at <sha>`), `↑ahead ↓behind` against the upstream, and counts plus expandable lists for staged, modified, untracked and conflicts.
- [ ] **Step 5:** Build `CommitDetail`. It shows SHA (with a copy button), author and email, date, full message and the file list with A/M/D/R badges.
- [ ] **Step 6:** Run `npm run dev` and open this project folder. Expected:
  - the WIP block lists the uncommitted files;
  - the graph shows the commits from Tasks 1–3;
  - clicking a commit fills the detail panel;
  - opening `C:\` shows "No es un repositorio git".
- [ ] **Step 7:** Commit with the message `feat: local repo view with branch graph`.

### Task 5: Token, Settings, GitHub client, error classification

**Files:**
- Create: `src/main/token.js`, `src/main/github/client.js`, `src/main/github/errors.js`, `src/renderer/src/views/SettingsView.jsx`
- Modify: `src/main/index.js`, `src/preload/index.js`
- Test: `tests/errors.test.js`

**Interfaces:**
- Produces from `token.js`: `saveToken(t)`, `loadToken() -> string|null`, `clearToken()`.
- Produces from `client.js`: `getOctokit() -> Octokit|null`, cached until the token changes.
- Produces from `errors.js` (pure): `classifyError(err) -> { kind: 'auth'|'sso'|'ratelimit'|'notfound'|'other', message: string /*Spanish*/, resetAt?: string }`.
- Produces from `window.api`:
  - `auth.save(token) -> Promise<{ login }>`, which validates with `GET /user` before saving and throws a classified error otherwise;
  - `auth.status() -> Promise<{ login }|null>`;
  - `auth.clear()`;
  - `gh.orgs() -> Promise<string[]>`, from `GET /user/orgs`, merged with the two default orgs.

- [ ] **Step 1: Write failing tests**

```js
test('401 -> auth', () => expect(classifyError({ status: 401 }).kind).toBe('auth'))
test('403 with x-github-sso header -> sso', () =>
  expect(classifyError({ status: 403, response: { headers: { 'x-github-sso': 'required; url=https://x' } } }).kind).toBe('sso'))
test('403 with ratelimit-remaining 0 -> ratelimit with resetAt ISO', () => {
  const e = classifyError({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1793620800' } } })
  expect(e.kind).toBe('ratelimit'); expect(e.resetAt).toBe(new Date(1793620800 * 1000).toISOString())
})
test('GraphQL RATE_LIMITED error -> ratelimit', () =>
  expect(classifyError({ errors: [{ type: 'RATE_LIMITED' }] }).kind).toBe('ratelimit'))
test('GraphQL NOT_FOUND -> notfound', () => expect(classifyError({ errors: [{ type: 'NOT_FOUND' }] }).kind).toBe('notfound'))
```

- [ ] **Step 2:** Run `npx vitest run tests/errors.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `errors.js`. Messages:
  - auth: `"Token inválido o caducado. Revísalo en Ajustes."`
  - sso: `"Autoriza el token para la organización: GitHub → Settings → Tokens → Configure SSO."`
  - ratelimit: `"Límite de la API de GitHub alcanzado. Se reinicia a las HH:MM."`
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Implement `token.js`, `client.js`, the IPC handlers and `SettingsView`:
  - a password input, a "Conectar" button, "Conectado como @login", and "Desconectar";
  - help text with the scopes: classic PAT → `repo`, `read:org`. Fine-grained → Contents: read and Metadata: read on the repos, Members: read on the org.
- [ ] **Step 6: Verify GraphQL against the real orgs.** Paste the PAT in Ajustes. Then add a temporary `gh:probe` handler and call it from DevTools. It runs `{ organization(login:"HefameMicroservices"){ repositories(first:1){ totalCount nodes{ name refs(refPrefix:"refs/heads/", first:5){ nodes{ name } } } } } rateLimit{ remaining } }`.
  - Expected: `totalCount` is 119 and branch names appear.
  - Remove the probe once it passes.
  - If it returns `null` or an SSO error, stop and report it to Álvaro before continuing.
- [ ] **Step 7:** Commit with the message `feat: PAT storage, settings view, GitHub error classification`.

### Task 6: Shared GitHub search plumbing (repos, pool, progress, cancel)

**Files:**
- Create: `src/main/github/pool.js`, `src/main/github/repos.js`, `src/main/github/jobs.js`
- Create: `src/renderer/src/components/OrgPicker.jsx`, `src/renderer/src/components/ResultsTable.jsx`, `src/renderer/src/components/JobProgress.jsx`
- Test: `tests/pool.test.js`

**Interfaces:**
- Produces from `pool.js`: `mapLimit(items, limit, fn, signal) -> Promise<{ results: any[], failures: { item, error }[] }>`. A rejecting `fn` goes into `failures` and does not abort the pool. When `signal` is aborted, no new items start.
- Produces from `repos.js`:
  - `listOrgRepos(octokit, org, pushedSince?: string) -> Promise<{ org, name, pushedAt }[]>`. It uses GraphQL `organization.repositories(first:100, orderBy:{field:PUSHED_AT, direction:DESC}, isArchived:false)`, paginated, and stops early once `pushedAt < pushedSince`.
  - `estimateRequests(repoCount) -> number`, which is `repoCount * 2`.
- Produces from `jobs.js`: `runJob(webContents, jobId, fn(signal, progress))`. Progress is sent on the `job:progress` channel as `{ jobId, done, total }`. Also exported: `cancelJob(jobId)`.
- Renderer components:
  - `OrgPicker` has checkboxes, a "+ añadir" text input, and stores `orgs` in localStorage.
  - `ResultsTable({ columns, rows, emptyText })` has a sticky header, sort on header click, and a quick-filter input.
  - `JobProgress` shows "repo X/Y", a bar and "Cancelar".

- [ ] **Step 1: Write failing tests**

```js
test('mapLimit never exceeds limit and keeps order', async () => {
  let running = 0, peak = 0
  const { results } = await mapLimit([1,2,3,4,5,6,7], 3, async n => { running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 5)); running--; return n * 2 })
  expect(peak).toBe(3); expect(results).toEqual([2,4,6,8,10,12,14])
})
test('failures are collected, others still resolve', async () => {
  const { results, failures } = await mapLimit([1,2,3], 2, async n => { if (n === 2) throw new Error('x'); return n })
  expect(results.filter(r => r !== undefined)).toEqual([1,3]); expect(failures.map(f => f.item)).toEqual([2])
})
test('abort stops starting new items', async () => {
  const ac = new AbortController(); const seen = []
  await mapLimit([1,2,3,4], 1, async n => { seen.push(n); if (n === 2) ac.abort() }, ac.signal)
  expect(seen).toEqual([1,2])
})
```

- [ ] **Step 2:** Run `npx vitest run tests/pool.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `pool.js`, `repos.js`, `jobs.js` and the three components.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with the message `feat: github search plumbing (pool, repos, jobs, shared UI)`.

### Task 7: "Mis commits" search

**Files:**
- Create: `src/main/github/commits.js`, `src/renderer/src/views/CommitsView.jsx`
- Modify: `src/main/index.js`, `src/preload/index.js`
- Test: `tests/commits.test.js`

**Interfaces:**
- Consumes from Task 6: `listOrgRepos(octokit, org, since)`, `mapLimit`, `runJob`.
- Produces:
  - `dedupeCommits(rows: { org, repo, branch, sha, date, message, url }[]) -> { org, repo, branches: string[], sha, date, message, url }[]`, pure, sorted by date desc;
  - `searchCommits(octokit, { orgs, login, since, until }, signal, progress) -> { rows, failures, rateLimitRemaining }`;
  - `window.api.gh.searchCommits(params) -> { jobId, promise }` and `window.api.gh.cancel(jobId)`.

Per-repo GraphQL query, paginated on `refs`. Resolve `$authorId` once with `user(login){ id }`.

```graphql
query($owner:String!,$name:String!,$cursor:String,$since:GitTimestamp!,$until:GitTimestamp!,$authorId:ID!){
  repository(owner:$owner,name:$name){ refs(refPrefix:"refs/heads/",first:50,after:$cursor){
    pageInfo{hasNextPage endCursor}
    nodes{ name target{ ... on Commit{ committedDate
      history(first:100,since:$since,until:$until,author:{id:$authorId}){ nodes{ oid messageHeadline committedDate url } } } } } } }
  rateLimit{ remaining resetAt } }
```

Skip any branch whose `committedDate < since`; it is already in the response, so this costs nothing extra.

- [ ] **Step 1: Write failing test**

```js
test('dedupeCommits merges same sha across branches and sorts newest first', () => {
  const base = { org: 'o', repo: 'r', message: 'm', url: 'u' }
  const out = dedupeCommits([
    { ...base, branch: 'snapshot', sha: 'a', date: '2026-10-01T00:00:00Z' },
    { ...base, branch: 'feature/x', sha: 'a', date: '2026-10-01T00:00:00Z' },
    { ...base, branch: 'master', sha: 'b', date: '2026-10-05T00:00:00Z' }])
  expect(out.map(c => c.sha)).toEqual(['b', 'a']); expect(out[1].branches).toEqual(['feature/x', 'snapshot'])
})
```

- [ ] **Step 2:** Run `npx vitest run tests/commits.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `commits.js`. Before running, if `estimateRequests(totalRepos) > 1000`, return `{ needsConfirm: true, estimate }` so the view asks.
- [ ] **Step 4:** Build `CommitsView`:
  - inputs: `OrgPicker`, user (default = `auth.status().login`), Desde/Hasta (default last 30 days), and "Buscar";
  - results go in a `ResultsTable` with columns Org, Repo, Rama(s), Fecha, Mensaje and SHA (opens the URL via `shell.openExternal`);
  - the footer shows "Cuota restante: N" and any failed repos with their classified message;
  - empty text: "No hay commits de @login en ese rango".
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Manual check in `npm run dev`: search your own login over the last 30 days in both orgs. Expected:
  - the results match what you see on GitHub for one repo you know;
  - "Cancelar" stops the progress.
- [ ] **Step 7:** Commit with the message `feat: search user commits across orgs and branches`.

### Task 8: "Buscar ramas" with merge status

**Files:**
- Create: `src/main/github/branches.js`, `src/renderer/src/views/BranchesView.jsx`
- Modify: `src/main/index.js`, `src/preload/index.js`
- Test: `tests/branches.test.js`

**Interfaces:**
- Consumes from Task 6: `listOrgRepos(octokit, org)` (no date filter), `mapLimit`, `runJob`.
- Produces:
  - `mergeStatus(comparison: { behindBy: number } | null) -> 'merged' | 'not-merged' | 'missing'`, pure. A `null` comparison means the base doesn't exist.
  - `searchBranches(octokit, { orgs, text }, signal, progress) -> { rows: { org, repo, branch, lastCommit, snapshot, master }[], failures, rateLimitRemaining }`
  - `window.api.gh.searchBranches(params) -> { jobId, promise }`

Two GraphQL queries per repo:

1. Query 1 lists the matching branches and checks that the bases exist:
   ```graphql
   repository(owner,name){
     refs(refPrefix:"refs/heads/", query:$text, first:100){
       nodes{ name target{ ... on Commit{ committedDate } } } }
     snapshot: ref(qualifiedName:"refs/heads/snapshot"){ name }
     master: ref(qualifiedName:"refs/heads/master"){ name } }
   ```
   Note: `query` matches a substring of the name.
2. Query 2 runs only if there are matches, and only for the bases that exist. It uses aliases per match: `b0: ref(qualifiedName:"refs/heads/<branch>"){ s: compare(headRef:"snapshot"){ behindBy } m: compare(headRef:"master"){ behindBy } }`.
   - The comparison is "base = branch, head = snapshot", so `behindBy` = commits in the branch that are not in snapshot. Merged ⇔ `behindBy == 0`.
   - Pass branch names as variables, not string-interpolated, so quotes or special characters in a branch name can't break the query.

Filter case-insensitively on the client as well. If `text` has fewer than 2 characters, don't search; show "Escribe al menos 2 caracteres".

- [ ] **Step 1: Write failing tests**

```js
test('behindBy 0 -> merged', () => expect(mergeStatus({ behindBy: 0 })).toBe('merged'))
test('behindBy > 0 -> not-merged', () => expect(mergeStatus({ behindBy: 3 })).toBe('not-merged'))
test('missing base -> missing', () => expect(mergeStatus(null)).toBe('missing'))
```

- [ ] **Step 2:** Run `npx vitest run tests/branches.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `branches.js`. `snapshot` and `master` are literal branch names (Global Constraints).
- [ ] **Step 4:** Build `BranchesView`:
  - inputs: `OrgPicker`, the text and "Buscar";
  - `ResultsTable` columns: Org, Repo, Rama, Último commit, Snapshot, Master;
  - status icons: ✅ merged / ❌ not-merged / — missing, each with an `aria-label` ("Mergeada", "No mergeada", "No existe");
  - quota and failures as in Task 7.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Manual check. Search for a ticket id you know was merged to snapshot but not to master. Expected: ✅ for Snapshot and ❌ for Master, which matches `git branch -r --merged origin/snapshot` in that repo.
- [ ] **Step 7:** Commit with the message `feat: search branches by text with snapshot/master merge status`.

### Task 9: Portable .exe

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1:** Write the config:
  - `appId: es.hefame.gitstatuskraken`
  - `productName: GitStatusKraken`
  - `directories.output: dist`
  - `files: [out/**]`
  - `win.target: portable`
- [ ] **Step 2:** Run `npm run dist`. Expected: `dist/GitStatusKraken <version>.exe` exists.
- [ ] **Step 3:** Run the `.exe` on a clean start. Expected:
  - Ajustes asks for the token;
  - after pasting it, the three tabs work;
  - after closing and reopening, it is still connected.
- [ ] **Step 4:** Add a `README.md` (Spanish) with how to run in dev, build the `.exe`, the PAT scopes, and the known limit (commits made from an email not linked to the GitHub account don't appear).
- [ ] **Step 5:** Commit with the message `build: portable windows exe and readme`.
