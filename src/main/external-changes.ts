import { ipcMain, type BrowserWindow } from 'electron'
import { getDataVersion } from './db'

// data_version은 연결마다 다르므로 앱이 보유한 연결의 값만 비교한다.
export function watchExternalChanges(): {
  attach: (window: BrowserWindow) => void
  stop: () => void
} {
  let version = getDataVersion()
  let generation = 0
  const windows = new Set<BrowserWindow>()
  const check = (): void => {
    const next = getDataVersion()
    if (next === null) {
      version = null
      return
    }
    if (version !== null && version !== next) {
      generation++
      for (const window of windows) {
        if (!window.isDestroyed() && window.isVisible() && !window.isMinimized())
          window.webContents.send('data:changed', generation)
      }
    }
    version = next
  }
  ipcMain.handle('data:generation', () => {
    check()
    return generation
  })
  const timer = setInterval(check, 500)
  timer.unref()
  return {
    attach(window) {
      windows.add(window)
      const resume = (): void => {
        check()
        if (!window.isDestroyed()) window.webContents.send('data:changed', generation)
      }
      window.on('show', resume)
      window.on('restore', resume)
      window.on('focus', resume)
      window.webContents.on('did-finish-load', resume)
      window.once('closed', () => windows.delete(window))
    },
    stop() {
      clearInterval(timer)
      ipcMain.removeHandler('data:generation')
      windows.clear()
    }
  }
}
