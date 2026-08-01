/// <reference types="vite/client" />

/** Injected at build time by vite.config.ts from package.json's version field. */
declare const __APP_VERSION__: string;
/** Human-facing version: number first, release label second. */
declare const __APP_DISPLAY_VERSION__: string;

interface Window {
  electronAPI?: {
    loadSettings(): string | null;
    saveSettings(data: string): void;
    loadProfile(): string | null;
    saveProfile(data: string): void;
    loadRunHistory(): string | null;
    saveRunHistory(data: string): void;
    applyPendingPlaytestReset(): boolean;
    setWindowMode(mode: string, width: number, height: number): void;
    quit(): void;
    telemetry: {
      isEnabled(): boolean;
      emit(event: {
        type: 'run_started' | 'run_ended' | 'choice' | 'performance' | 'feedback';
        runId: string;
        payload: Record<string, unknown>;
      }): void;
      submitFeedback(event: {
        type: 'feedback';
        runId: string;
        payload: Record<string, unknown>;
      }): Promise<boolean>;
    };
    steam: {
      isAvailable(): boolean;
      unlockAchievement(name: string): void;
    };
  };
}
