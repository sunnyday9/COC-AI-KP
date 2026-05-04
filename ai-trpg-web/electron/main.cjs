const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerAllHandlers } = require('./ipc/index.cjs');

// Disable GPU acceleration in environments without proper GPU support (e.g. WSL)
app.disableHardwareAcceleration();

// E2E support (only when E2E_FORCE_PROD=1 to avoid accidental override):
// - E2E_USER_DATA_DIR: isolate Electron userData for repeatable tests (must be absolute path)
// - E2E_FORCE_PROD=1: force loading dist (no dev server needed)
if (process.env.E2E_FORCE_PROD === '1' && process.env.E2E_USER_DATA_DIR) {
  const p = process.env.E2E_USER_DATA_DIR
  if (path.isAbsolute(p)) {
    try {
      app.setPath('userData', p)
    } catch (_e) {
      // ignore if Electron disallows at this stage
    }
  }
}

const isDev = (process.env.NODE_ENV === 'development' || !app.isPackaged) && process.env.E2E_FORCE_PROD !== '1';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerAllHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
