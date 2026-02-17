const { ipcMain, app } = require('electron')
const fs = require('fs').promises
const path = require('path')

const SAVES_DIR = 'saves'

function getSavesPath() {
  const userData = app.getPath('userData')
  return path.join(userData, SAVES_DIR)
}

async function ensureSavesDir() {
  const dir = getSavesPath()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function registerSaveHandlers() {
  ipcMain.handle('save:list', async () => {
    const dir = await ensureSavesDir()
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name.replace('.json', ''))
    return files
  })

  ipcMain.handle('save:read', async (_, saveId) => {
    const dir = getSavesPath()
    const filePath = path.join(dir, `${saveId}.json`)
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  })

  ipcMain.handle('save:write', async (_, saveId, data) => {
    const dir = await ensureSavesDir()
    const filePath = path.join(dir, `${saveId}.json`)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return undefined
  })
}

module.exports = { registerSaveHandlers }
