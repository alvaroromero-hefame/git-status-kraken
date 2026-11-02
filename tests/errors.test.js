import { test, expect } from 'vitest'
import { classifyError } from '../src/main/github/errors.js'

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

test('GraphQL SAML error message -> sso', () =>
  expect(classifyError({ errors: [{ type: 'FORBIDDEN', message: 'Resource protected by organization SAML enforcement.' }] }).kind).toBe('sso'))

test('unknown error -> other, keeps the original message', () => {
  const e = classifyError(new Error('boom'))
  expect(e).toEqual({ kind: 'other', message: 'boom' })
})
