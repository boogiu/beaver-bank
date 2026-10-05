import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeDatabase, getDbStatus, openDatabase } from './db'
import * as service from './db/service'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'BeaverBank',
    backgroundColor: '#1E1E1E',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 개발 중에는 Vite 개발 서버(HMR), 배포본에서는 빌드된 HTML을 연다.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('db:status', () => service.attempt(getDbStatus))
  ipcMain.handle('purpose:list', () => service.attempt(service.listPurposes))
  ipcMain.handle('purpose:add', (_, input) => service.attempt(() => service.addPurpose(input)))
  ipcMain.handle('purpose:update', (_, id, input) =>
    service.attempt(() => service.updatePurpose(id, input))
  )
  ipcMain.handle('purpose:delete', (_, id) => service.attempt(() => service.deletePurpose(id)))
  ipcMain.handle('purpose:reorder', (_, ids) => service.attempt(() => service.reorderPurposes(ids)))
  ipcMain.handle('account:list', (_, includeInactive) =>
    service.attempt(() => service.listAccounts(includeInactive))
  )
  ipcMain.handle('account:add', (_, input) => service.attempt(() => service.addAccount(input)))
  ipcMain.handle('account:update', (_, id, input) =>
    service.attempt(() => service.updateAccount(id, input))
  )
  ipcMain.handle('account:close', (_, id) =>
    service.attempt(() => service.setAccountActive(id, false))
  )
  ipcMain.handle('account:restore', (_, id) =>
    service.attempt(() => service.setAccountActive(id, true))
  )
  ipcMain.handle('card:list', (_, includeInactive) =>
    service.attempt(() => service.listCards(includeInactive))
  )
  ipcMain.handle('card:add', (_, input) => service.attempt(() => service.addCard(input)))
  ipcMain.handle('card:update', (_, id, input) =>
    service.attempt(() => service.updateCard(id, input))
  )
  ipcMain.handle('card:close', (_, id) => service.attempt(() => service.setCardActive(id, false)))
  ipcMain.handle('card:restore', (_, id) => service.attempt(() => service.setCardActive(id, true)))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.boogiu.beaverbank')

  // 개발 중 F12로 DevTools 열기, 배포본에서는 새로고침 단축키 무시
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  try {
    openDatabase()
  } catch (error) {
    dialog.showErrorBox('BeaverBank', `데이터베이스를 열지 못했습니다.\n\n${String(error)}`)
    app.quit()
    return
  }

  registerIpc()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDatabase()
})
