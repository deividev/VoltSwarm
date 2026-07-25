import { contextBridge, ipcRenderer } from 'electron';

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
  setWindowMode: (mode: string, width: number, height: number): void => {
    ipcRenderer.send('window:set-mode', mode, width, height);
  },
  quit: (): void => {
    ipcRenderer.send('app:quit');
  },
  steam: {
    isAvailable: (): boolean => ipcRenderer.sendSync('steam:available') as boolean,
    unlockAchievement: (name: string): void => {
      ipcRenderer.sendSync('steam:unlock', name);
    },
  },
});
