const { ipcMain, app } = require('electron')
const fs = require('fs').promises
const path = require('path')

const SETTINGS_FILE = 'app-settings.json'

function getSettingsPath() {
  const userData = app.getPath('userData')
  return path.join(userData, SETTINGS_FILE)
}

async function readSettings() {
  try {
    const filePath = getSettingsPath()
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

async function writeSettings(settings) {
  const filePath = getSettingsPath()
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2), 'utf-8')
}

function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    const raw = await readSettings()
    if (!raw?.ai?.apiKey) return raw
    const masked = JSON.parse(JSON.stringify(raw))
    if (masked.ai.apiKey && masked.ai.apiKey.length > 4) {
      masked.ai.apiKey = '***'
    }
    return masked
  })

  ipcMain.handle('settings:set', async (_, settings) => {
    if (!settings || typeof settings !== 'object') return undefined
    const existing = await readSettings()
    if (settings.ai?.apiKey === '***' && existing?.ai?.apiKey) {
      settings = JSON.parse(JSON.stringify(settings))
      settings.ai.apiKey = existing.ai.apiKey
    }
    await writeSettings(settings)
    return undefined
  })
}

module.exports = { registerSettingsHandlers, readSettings }
