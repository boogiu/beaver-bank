import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { DbStatus } from '../shared/ipc'

// renderer에서 window.api로 쓰는 main 프로세스 기능
const api = {
  getDbStatus: (): Promise<DbStatus> => ipcRenderer.invoke('db:status')
}

export type Api = typeof api

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
