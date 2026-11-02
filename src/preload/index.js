import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  repo: {
    choose: () => ipcRenderer.invoke('repo:choose'),
    load: () => ipcRenderer.invoke('repo:load'),
    detail: sha => ipcRenderer.invoke('repo:detail', sha)
  },
  auth: {
    save: token => ipcRenderer.invoke('auth:save', token),
    status: () => ipcRenderer.invoke('auth:status'),
    clear: () => ipcRenderer.invoke('auth:clear')
  },
  gh: {
    orgs: () => ipcRenderer.invoke('gh:orgs')
  }
})
