import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chatModels, type ChatSettings } from '../shared/chat'

export function readChatSettings(): ChatSettings {
  try {
    const value = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'chat-settings.json'), 'utf8')
    )
    return {
      open: value.open === true,
      model: chatModels.includes(value.model) ? value.model : 'default'
    }
  } catch {
    return { open: false, model: 'default' }
  }
}

export function writeChatSettings(settings: ChatSettings): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(
    join(app.getPath('userData'), 'chat-settings.json'),
    JSON.stringify({ open: settings.open, model: settings.model })
  )
}
