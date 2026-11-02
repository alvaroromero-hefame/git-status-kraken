import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const tokenFile = () => path.join(app.getPath('userData'), 'token.bin')

export function saveToken(token) {
  // Never fall back to plain text: without OS encryption the token is not stored.
  if (!safeStorage.isEncryptionAvailable()) throw new Error('El cifrado del sistema no está disponible; no se guarda el token.')
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token))
}

export function loadToken() {
  try {
    return safeStorage.decryptString(fs.readFileSync(tokenFile()))
  } catch {
    return null
  }
}

export function clearToken() {
  fs.rmSync(tokenFile(), { force: true })
}
