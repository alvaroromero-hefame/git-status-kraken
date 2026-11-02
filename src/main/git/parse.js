// Pure parsers for git plumbing output. No I/O here, so they are unit-tested directly.

// Number of space-separated fields before the path, per porcelain v2 entry type.
const FIELDS_BEFORE_PATH = { 1: 8, 2: 9, u: 10 }

function pathAfterFields(line, count) {
  let idx = 0
  for (let i = 0; i < count; i++) idx = line.indexOf(' ', idx) + 1
  return line.slice(idx)
}

/** Parses `git status --porcelain=v2 --branch -z`. */
export function parseStatus(rawZ) {
  const s = { head: '', detached: false, upstream: null, ahead: 0, behind: 0, staged: [], modified: [], untracked: [], conflicts: [] }
  let oid = ''
  const entries = rawZ.split('\0')
  for (let i = 0; i < entries.length; i++) {
    const line = entries[i]
    if (!line) continue
    if (line.startsWith('# branch.oid ')) oid = line.slice(13)
    else if (line.startsWith('# branch.head ')) s.head = line.slice(14)
    else if (line.startsWith('# branch.upstream ')) s.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const [a, b] = line.slice(12).split(' ')
      s.ahead = Number(a); s.behind = -Number(b)
    } else if (line.startsWith('? ')) s.untracked.push(line.slice(2))
    else if (line.startsWith('u ')) s.conflicts.push(pathAfterFields(line, FIELDS_BEFORE_PATH.u))
    else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const type = line[0]
      const path = pathAfterFields(line, FIELDS_BEFORE_PATH[type])
      if (type === '2') i++ // the original path of a rename/copy is the next NUL field
      if (line[2] !== '.') s.staged.push(path)
      if (line[3] !== '.') s.modified.push(path)
    }
  }
  if (s.head === '(detached)') {
    s.detached = true
    s.head = oid.slice(0, 7)
  }
  return s
}

/** Parses `git log --format=%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e`. */
export function parseLog(raw) {
  return raw.split('\x1e')
    .map(r => r.replace(/^\s+/, ''))
    .filter(Boolean)
    .map(r => {
      const [sha, parents, author, date, refs, subject] = r.split('\x1f')
      return {
        sha,
        parents: parents ? parents.split(' ') : [],
        author,
        date,
        refs: refs ? refs.split(', ') : [],
        subject
      }
    })
}

/** Parses `git for-each-ref --format=%(refname)%1f%(objectname)%1f%(*objectname)`. */
export function parseRefs(raw) {
  const out = { local: [], remote: [], tags: [] }
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [ref, objectSha, peeledSha] = line.split('\x1f')
    const sha = peeledSha || objectSha // annotated tags point to a tag object; use its commit
    if (ref.startsWith('refs/heads/')) out.local.push({ name: ref.slice(11), sha })
    else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) out.remote.push({ name: ref.slice(13), sha })
    else if (ref.startsWith('refs/tags/')) out.tags.push({ name: ref.slice(10), sha })
  }
  return out
}
