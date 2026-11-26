const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ultimateDesktop', {
  platform: process.platform,
  version: process.env.npm_package_version || '1.2.0',
  setResolution: (width, height) => ipcRenderer.invoke('ur:set-resolution', { width, height }),
  setFullscreen: (enabled) => ipcRenderer.invoke('ur:set-fullscreen', Boolean(enabled)),
  isFullscreen: () => ipcRenderer.invoke('ur:is-fullscreen'),
  log: (level, payload) => ipcRenderer.send('ur:log', { level, payload }),
});

window.addEventListener('error', (event) => {
  ipcRenderer.send('ur:log', { level: 'error', payload: { message: event.message, source: event.filename, line: event.lineno } });
});
window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.send('ur:log', { level: 'error', payload: { message: String(event.reason?.stack || event.reason) } });
});
