// Turns Octokit REST/GraphQL errors into a kind plus a Spanish message for the UI.

const MESSAGES = {
  auth: 'Token inválido o caducado. Revísalo en Ajustes.',
  sso: 'Autoriza el token para la organización: GitHub → Settings → Tokens → Configure SSO.',
  notfound: 'No encontrado (o el token no tiene acceso).'
}

function rateLimitMessage(resetAt) {
  if (!resetAt) return 'Límite de la API de GitHub alcanzado. Espera unos minutos.'
  const hhmm = new Date(resetAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return `Límite de la API de GitHub alcanzado. Se reinicia a las ${hhmm}.`
}

export function classifyError(err) {
  const headers = err?.response?.headers ?? err?.headers ?? {}
  const gqlErrors = err?.errors ?? []
  const reset = headers['x-ratelimit-reset']
  const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : undefined

  if (err?.status === 401) return { kind: 'auth', message: MESSAGES.auth }
  if (headers['x-github-sso'] || gqlErrors.some(e => /SAML/i.test(e.message ?? ''))) {
    return { kind: 'sso', message: MESSAGES.sso }
  }
  if ((err?.status === 403 || err?.status === 429) && headers['x-ratelimit-remaining'] === '0' ||
      gqlErrors.some(e => e.type === 'RATE_LIMITED')) {
    return { kind: 'ratelimit', message: rateLimitMessage(resetAt), resetAt }
  }
  if (err?.status === 404 || gqlErrors.some(e => e.type === 'NOT_FOUND')) return { kind: 'notfound', message: MESSAGES.notfound }
  return { kind: 'other', message: err?.message ?? String(err) }
}
