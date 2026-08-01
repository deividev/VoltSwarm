import { contextBridge, ipcRenderer } from 'electron';

const LEGACY_PROGRESS_KEYS = [
  'voltswarm:profile',
  'voltswarm:run-history:v1',
  'voltswarm:run-history:migrated',
] as const;

/**
 * Exposes a minimal, safe API to the renderer. Settings I/O is synchronous
 * (ipcRenderer.sendSync) so it satisfies the renderer's sync SettingsPersistence
 * interface; window control and quit are fire-and-forget.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  loadSettings: (): string | null => ipcRenderer.sendSync('settings:load') as string | null,
  saveSettings: (data: string): void => {
    ipcRenderer.sendSync('settings:save', data);
  },
  loadProfile: (): string | null => ipcRenderer.sendSync('profile:load') as string | null,
  saveProfile: (data: string): void => {
    ipcRenderer.sendSync('profile:save', data);
  },
  loadRunHistory: (): string | null => ipcRenderer.sendSync('run-history:load') as string | null,
  saveRunHistory: (data: string): void => {
    ipcRenderer.sendSync('run-history:save', data);
  },
  applyPendingPlaytestReset: (): boolean => {
    const epoch = ipcRenderer.sendSync('playtest-reset:pending') as string | null;
    if (!epoch) return true;
    for (const key of LEGACY_PROGRESS_KEYS) window.localStorage.removeItem(key);
    return ipcRenderer.sendSync('playtest-reset:complete', epoch) as boolean;
  },
  setWindowMode: (mode: string, width: number, height: number): void => {
    ipcRenderer.send('window:set-mode', mode, width, height);
  },
  quit: (): void => {
    ipcRenderer.send('app:quit');
  },
  telemetry: {
    isEnabled: (): boolean => ipcRenderer.sendSync('telemetry:is-enabled') as boolean,
    emit: (event: unknown): void => {
      ipcRenderer.send('telemetry:event', event);
    },
    submitFeedback: (event: unknown): Promise<boolean> =>
      ipcRenderer.invoke('telemetry:feedback', event) as Promise<boolean>,
  },
  steam: {
    isAvailable: (): boolean => ipcRenderer.sendSync('steam:available') as boolean,
    unlockAchievement: (name: string): void => {
      ipcRenderer.sendSync('steam:unlock', name);
    },
  },
});
