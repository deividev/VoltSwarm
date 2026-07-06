import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';

let mainWindow: BrowserWindow | null = null;
const APP_TITLE = 'Voltswarm';

// Steam SDK client, or null when Steam is disabled. `steamworks.js` is optional:
// it is required lazily so the app builds and runs without the dependency.
let steamClient: { achievement: { activate(name: string): boolean } } | null = null;

function initSteam(): void {
  const appId = process.env['STEAM_APP_ID'];
  if (!appId) return; // Steam stays disabled until an App ID is configured.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const steamworks = require('steamworks.js');
    steamClient = steamworks.init(Number(appId));
    if (typeof steamworks.electronEnableSteamOverlay === 'function') {
      steamworks.electronEnableSteamOverlay();
    }
  } catch (error) {
    console.warn('Steam disabled:', (error as Error).message);
    steamClient = null;
  }
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** Applies the window mode + resolution to the native window. */
function applyWindowMode(mode: string, width: number, height: number): void {
  if (!mainWindow) return;
  if (mode === 'fullscreen') {
    mainWindow.setFullScreen(true);
    return;
  }
  mainWindow.setFullScreen(false);
  mainWindow.setResizable(true);
  if (width > 0 && height > 0) {
    mainWindow.setSize(width, height);
    mainWindow.center();
  }
  // 'borderless' vs 'windowed' frame can only be chosen at creation time in
  // Electron; it is applied on next launch from the persisted setting.
}

function createWindow(): void {
  // Production hardening: no default Electron menu (its Reload accelerator
  // would silently wipe a run) and no devtools in packaged builds.
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1280,
    height: 720,
    backgroundColor: '#0b0d12',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // A paid app must never die silently: offer a relaunch on renderer crash.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: APP_TITLE,
      message: 'The game crashed unexpectedly.',
      buttons: ['Restart', 'Close'],
      defaultId: 0,
    });
    if (choice === 0) {
      app.relaunch();
    }
    app.exit(choice === 0 ? 0 : 1);
  });

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  ipcMain.on('settings:load', (event) => {
    try {
      event.returnValue = fs.readFileSync(settingsFile(), 'utf8');
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('settings:save', (event, data: string) => {
    try {
      fs.writeFileSync(settingsFile(), data, 'utf8');
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.on('window:set-mode', (_event, mode: string, width: number, height: number) => {
    applyWindowMode(mode, width, height);
  });

  ipcMain.on('app:quit', () => app.quit());

  ipcMain.on('steam:available', (event) => {
    event.returnValue = steamClient !== null;
  });

  ipcMain.on('steam:unlock', (event, name: string) => {
    try {
      steamClient?.achievement.activate(name);
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  initSteam();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
