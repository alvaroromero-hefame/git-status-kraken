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
    orgs: () => ipcRenderer.invoke('gh:orgs'),
    searchCommits: (jobId, params) => ipcRenderer.invoke('gh:searchCommits', jobId, params),
    searchBranches: (jobId, params) => ipcRenderer.invoke('gh:searchBranches', jobId, params),
    cancel: jobId => ipcRenderer.invoke('gh:cancel', jobId),
    openExternal: url => ipcRenderer.invoke('gh:open', url),
    onProgress: cb => {
      const listener = (_e, p) => cb(p)
      ipcRenderer.on('job:progress', listener)
      return () => ipcRenderer.removeListener('job:progress', listener)
    }
  }
})
