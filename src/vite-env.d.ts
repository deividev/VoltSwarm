/// <reference types="vite/client" />

/** Injected at build time by vite.config.ts from package.json's version field. */
declare const __APP_VERSION__: string;

interface Window {
  electronAPI?: {
    loadSettings(): string | null;
    saveSettings(data: string): void;
    loadProfile(): string | null;
    saveProfile(data: string): void;
    loadRunHistory(): string | null;
    saveRunHistory(data: string): void;
    setWindowMode(mode: string, width: number, height: number): void;
    quit(): void;
    steam: {
      isAvailable(): boolean;
      unlockAchievement(name: string): void;
    };
  };
}
