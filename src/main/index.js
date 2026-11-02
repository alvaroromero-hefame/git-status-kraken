import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { registerAuthHandlers } from './github/ipc.js'
import { resolveRepoRoot, getStatus, getLog, getRefs, getCommitDetail } from './git/repo.js'

let win
// The repo path lives only in main: the renderer never sends filesystem paths.
let currentRepo = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#1b1d23',
    title: 'GitStatusKraken',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  // Links never open inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerRepoHandlers() {
  ipcMain.handle('repo:choose', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Abrir repositorio' })
    if (res.canceled || !res.filePaths[0]) return null
    const root = await resolveRepoRoot(res.filePaths[0])
    if (!root) return { error: 'No es un repositorio git' }
    currentRepo = root
    return { path: root }
  })
  ipcMain.handle('repo:load', async () => {
    if (!currentRepo) throw new Error('No hay repositorio abierto')
    const [status, log, refs] = await Promise.all([getStatus(currentRepo), getLog(currentRepo), getRefs(currentRepo)])
    return { status, log, refs }
  })
  ipcMain.handle('repo:detail', (_e, sha) => {
    if (!currentRepo) throw new Error('No hay repositorio abierto')
    return getCommitDetail(currentRepo, String(sha))
  })
}

app.whenReady().then(() => {
  registerRepoHandlers()
  registerAuthHandlers()
  createWindow()
})
app.on('window-all-closed', () => app.quit())
