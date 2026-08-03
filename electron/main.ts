import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { TelemetryClient } from './telemetry/client';
import { hasTelemetryConsent, persistTelemetryConsent } from './telemetry/consent';
import { isPlaytestEligible, TELEMETRY_CONFIG } from './telemetry/config';
import { completePlaytestReset, isPlaytestResetRequired, preparePlaytestReset } from './playtest-reset';

let mainWindow: BrowserWindow | null = null;
let telemetryClient: TelemetryClient | null = null;
let telemetryShutdownRecorded = false;
let pendingPlaytestResetEpoch: string | null = null;
const APP_TITLE = 'Voltswarm';
const benchmarkMode = app.isPackaged && process.argv.includes('--audio-benchmark');

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

/** Cross-run player profile (unlocks and sockets), kept in its own file so a
 *  corrupt or reset settings file never costs the player their progression. */
function profileFile(): string {
  return path.join(app.getPath('userData'), 'profile.json');
}

/** Per-run records. A plain JSON file rather than localStorage so balance
 *  passes can read real play data with ordinary tooling. */
function runHistoryFile(): string {
  return path.join(app.getPath('userData'), 'run-history.json');
}

function initialWindowSettings(): { fullscreen: boolean; width: number; height: number } {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as {
      displayMode?: string;
      resolution?: string;
    };
    const match = /^(\d+)x(\d+)$/.exec(settings.resolution ?? '');
    return {
      // Preserve an explicit player choice. Missing/legacy values use the
      // first-launch default instead of silently forcing windowed mode.
      fullscreen: settings.displayMode !== 'windowed',
      width: match ? Number(match[1]) : 1280,
      height: match ? Number(match[2]) : 720,
    };
  } catch {
    return { fullscreen: true, width: 1280, height: 720 };
  }
}

/** Applies the window mode + resolution to the native window. */
function applyWindowMode(mode: string, width: number, height: number): void {
  if (!mainWindow) return;
  const safeWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 1280;
  const safeHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 720;
  if (mode === 'fullscreen') {
    mainWindow.setFullScreen(true);
    return;
  }

  const resizeWindow = (): void => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setResizable(true);
    // Resolution means gameplay viewport, not outer OS frame. setSize() sizes
    // the whole window, so the canvas ends up smaller by the titlebar/borders.
    mainWindow.setContentSize(safeWidth, safeHeight);
    mainWindow.center();
  };

  if (mainWindow.isFullScreen()) {
    mainWindow.once('leave-full-screen', resizeWindow);
    mainWindow.setFullScreen(false);
  } else {
    resizeWindow();
  }
  // 'borderless' vs 'windowed' frame can only be chosen at creation time in
  // Electron; it is applied on next launch from the persisted setting.
}

function createWindow(): void {
  // Production hardening: no default Electron menu (its Reload accelerator
  // would silently wipe a run) and no devtools in packaged builds.
  Menu.setApplicationMenu(null);
  const initial = initialWindowSettings();

  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: initial.width,
    height: initial.height,
    fullscreen: initial.fullscreen,
    useContentSize: true,
    backgroundColor: '#0b0d12',
    // Hidden windows are throttled to ~1 FPS on this Windows compositor even
    // with backgroundThrottling disabled; the explicit benchmark flag is the
    // one exception because it must measure real rendered frames.
    show: benchmarkMode,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
      backgroundThrottling: !benchmarkMode,
    },
  });

  if (!benchmarkMode) mainWindow.once('ready-to-show', () => mainWindow?.show());

  // A paid app must never die silently: offer a relaunch on renderer crash.
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    recordTelemetryShutdown('renderer_crash');
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
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
      query: benchmarkMode ? { audioBenchmark: '1' } : {},
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  const runtime = {
    packaged: app.isPackaged,
    benchmark: benchmarkMode,
    buildVersion: app.getVersion(),
  };
  if (isPlaytestEligible(TELEMETRY_CONFIG, runtime)) {
    const userDataPath = app.getPath('userData');
    let consented: boolean;
    try {
      consented = hasTelemetryConsent(userDataPath, TELEMETRY_CONFIG);
    } catch (error) {
      dialog.showErrorBox('Playtest Telemetry Could Not Start', `Consent state could not be read safely. No data was sent.\n\n${(error as Error).message}`);
      app.quit();
      return;
    }
    if (!consented) {
      const disclosure = TELEMETRY_CONFIG.disclosure;
      const consent = dialog.showMessageBoxSync({
        type: 'info',
        title: disclosure.title,
        message: disclosure.message,
        detail: disclosure.detail,
        buttons: [disclosure.acceptLabel, disclosure.declineLabel],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (consent !== 0) {
        app.quit();
        return;
      }
      try {
        persistTelemetryConsent(userDataPath, TELEMETRY_CONFIG);
        consented = true;
      } catch (error) {
        dialog.showErrorBox('Playtest Telemetry Could Not Start', `Consent could not be saved safely. No data was sent.\n\n${(error as Error).message}`);
        app.quit();
        return;
      }
    }

    let resetRequired: boolean;
    try {
      resetRequired = isPlaytestResetRequired(userDataPath, runtime, TELEMETRY_CONFIG);
    } catch (error) {
      dialog.showErrorBox('Playtest Setup Could Not Start', `Reset state could not be read safely. Please restart and try again.\n\n${(error as Error).message}`);
      app.quit();
      return;
    }
    if (resetRequired) {
      const reset = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Playtest Progress Reset',
        message: 'Start this playtest wave with clean progression?',
        detail: 'This reset permanently removes this installation\'s existing Voltswarm progression and run history. Telemetry consent is separate and does not authorize this reset.',
        buttons: ['Reset Progress & Continue', 'Exit Without Reset'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (reset !== 0) {
        app.quit();
        return;
      }
      try {
        pendingPlaytestResetEpoch = preparePlaytestReset(userDataPath, runtime, TELEMETRY_CONFIG);
      } catch (error) {
        dialog.showErrorBox('Playtest Setup Could Not Start', `Progress could not be reset safely. Please restart and try again.\n\n${(error as Error).message}`);
        app.quit();
        return;
      }
    }
    try {
      telemetryClient = new TelemetryClient(userDataPath, runtime, TELEMETRY_CONFIG, consented);
      telemetryClient.start();
    } catch (error) {
      dialog.showErrorBox('Playtest Telemetry Could Not Start', `No data was sent. Please restart and try again.\n\n${(error as Error).message}`);
      app.quit();
      return;
    }
  }

  ipcMain.on('playtest-reset:pending', (event) => {
    event.returnValue = pendingPlaytestResetEpoch;
  });
  ipcMain.on('playtest-reset:complete', (event, epoch: string) => {
    if (!pendingPlaytestResetEpoch || epoch !== pendingPlaytestResetEpoch) {
      event.returnValue = false;
      return;
    }
    try {
      event.returnValue = completePlaytestReset(app.getPath('userData'), epoch);
      if (event.returnValue) pendingPlaytestResetEpoch = null;
    } catch (error) {
      console.warn('Playtest reset could not be completed:', (error as Error).message);
      event.returnValue = false;
    }
  });

  ipcMain.on('telemetry:is-enabled', (event) => {
    event.returnValue = telemetryClient !== null;
  });

  ipcMain.on('telemetry:event', (_event, data: unknown) => {
    try {
      telemetryClient?.captureRendererEvent(data);
    } catch (error) {
      console.warn('Telemetry event could not be queued:', (error as Error).message);
    }
  });
  ipcMain.handle('telemetry:feedback', (_event, data: unknown) => {
    try {
      return telemetryClient?.captureRendererEvent(data) ?? false;
    } catch (error) {
      console.warn('Telemetry feedback could not be queued:', (error as Error).message);
      return false;
    }
  });

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

  ipcMain.on('profile:load', (event) => {
    try {
      event.returnValue = fs.readFileSync(profileFile(), 'utf8');
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('profile:save', (event, data: string) => {
    try {
      fs.writeFileSync(profileFile(), data, 'utf8');
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.on('run-history:load', (event) => {
    try {
      event.returnValue = fs.readFileSync(runHistoryFile(), 'utf8');
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('run-history:save', (event, data: string) => {
    try {
      fs.writeFileSync(runHistoryFile(), data, 'utf8');
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

app.on('before-quit', () => recordTelemetryShutdown('application_closed'));

function recordTelemetryShutdown(reason: string): void {
  if (telemetryShutdownRecorded) return;
  telemetryShutdownRecorded = true;
  try {
    telemetryClient?.stop(reason);
  } catch (error) {
    console.warn('Telemetry shutdown could not be recorded:', (error as Error).message);
  }
}
