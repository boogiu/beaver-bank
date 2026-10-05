import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { Api } from '../shared/ipc'

// renderer에서 window.api로 쓰는 main 프로세스 기능
const api: Api = {
  getDbStatus: () => ipcRenderer.invoke('db:status'),
  listPurposes: () => ipcRenderer.invoke('purpose:list'),
  addPurpose: (input) => ipcRenderer.invoke('purpose:add', input),
  updatePurpose: (id, input) => ipcRenderer.invoke('purpose:update', id, input),
  deletePurpose: (id) => ipcRenderer.invoke('purpose:delete', id),
  reorderPurposes: (ids) => ipcRenderer.invoke('purpose:reorder', ids),
  listAccounts: (includeInactive) => ipcRenderer.invoke('account:list', includeInactive),
  addAccount: (input) => ipcRenderer.invoke('account:add', input),
  updateAccount: (id, input) => ipcRenderer.invoke('account:update', id, input),
  closeAccount: (id) => ipcRenderer.invoke('account:close', id),
  restoreAccount: (id) => ipcRenderer.invoke('account:restore', id),
  listCards: (includeInactive) => ipcRenderer.invoke('card:list', includeInactive),
  addCard: (input) => ipcRenderer.invoke('card:add', input),
  updateCard: (id, input) => ipcRenderer.invoke('card:update', id, input),
  closeCard: (id) => ipcRenderer.invoke('card:close', id),
  restoreCard: (id) => ipcRenderer.invoke('card:restore', id)
}

// contextIsolation이 켜져 있으면 contextBridge로 노출하고, 아니면 window에 직접 붙인다.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
