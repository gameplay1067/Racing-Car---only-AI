const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWindow;
const DEFAULT_SIZE = { width: 1600, height: 900 };
const logDir = () => path.join(app.getPath('userData'), 'logs');
function writeLog(level, payload) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(path.join(logDir(), 'ultimate-racing.log'), `${new Date().toISOString()} [${level}] ${JSON.stringify(payload)}\n`);
  } catch (error) { console.error('Could not write game log:', error); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...DEFAULT_SIZE,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#050914',
    autoHideMenuBar: true,
    title: 'ULTIMATE RACING',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '..', 'out', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('console-message', (_event, details) => {
    if (details.level >= 2) writeLog('renderer-console', { level: details.level, message: details.message, line: details.lineNumber });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => writeLog('render-process-gone', details));
  mainWindow.on('unresponsive', () => writeLog('window-unresponsive', {}));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('ur:set-resolution', (_event, { width, height }) => {
  if (!mainWindow) return false;
  if (!width || !height) {
    mainWindow.setSize(DEFAULT_SIZE.width, DEFAULT_SIZE.height);
    mainWindow.center();
    return true;
  }
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const area = display.workAreaSize;
  const w = Math.max(1024, Math.min(Number(width) || DEFAULT_SIZE.width, area.width));
  const h = Math.max(640, Math.min(Number(height) || DEFAULT_SIZE.height, area.height));
  mainWindow.setSize(w, h);
  mainWindow.center();
  return true;
});

ipcMain.handle('ur:set-fullscreen', (_event, enabled) => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(Boolean(enabled));
  return mainWindow.isFullScreen();
});

ipcMain.handle('ur:is-fullscreen', () => Boolean(mainWindow?.isFullScreen()));
ipcMain.on('ur:log', (_event, { level = 'info', payload = {} }) => writeLog(level, payload));

app.whenReady().then(() => {
  writeLog('startup', { version: app.getVersion(), platform: process.platform });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => writeLog('shutdown', {}));
process.on('uncaughtException', error => writeLog('uncaughtException', { message: error.stack || error.message }));
process.on('unhandledRejection', error => writeLog('unhandledRejection', { message: String(error?.stack || error) }));
