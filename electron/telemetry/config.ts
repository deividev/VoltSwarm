export interface PlaytestTelemetryConfig {
  enabled: boolean;
  admittedBuildVersions: readonly string[];
  gameId: string;
  waveId: string;
  schemaVersion: number;
  consentVersion: number;
  disclosure: TelemetryDisclosure;
  resetEpoch: string | null;
  endpoint: string;
  clientToken: string;
  maxBatchSize: number;
  maxBodyBytes: number;
  maxQueueEvents: number;
  maxQuarantinedEvents: number;
  requestTimeoutMs: number;
}

export interface TelemetryDisclosure {
  title: string; message: string; detail: string; acceptLabel: string; declineLabel: string;
}

export interface PlaytestRuntime {
  packaged: boolean;
  benchmark: boolean;
  buildVersion: string;
}

/** Map 2 development is deliberately inert. A future wave is activated only
 * by changing this single audited object and deploying its matching gate. */
export const TELEMETRY_CONFIG: PlaytestTelemetryConfig = {
  enabled: false,
  admittedBuildVersions: [],
  gameId: 'voltswarm',
  waveId: 'map-2',
  schemaVersion: 1,
  consentVersion: 1,
  disclosure: {
    title: 'Playtest Telemetry',
    message: 'Help us balance this Voltswarm playtest?',
    detail: 'Voltswarm sends pseudonymous gameplay, session, and performance data for playtest balance. Feedback selections are optional. We do not send your Steam ID, email address, or free text. This choice stays valid until the disclosure changes. Exit sends no data and closes the game.',
    acceptLabel: 'Enable Telemetry',
    declineLabel: 'Exit Without Sending Data',
  },
  resetEpoch: null,
  endpoint: 'https://playtest-telemetry.voltswarm-playtests.workers.dev',
  clientToken: 'B0gQ79eMVQr8owNtDuSEVmPb7kC7uj9C3fmrANv_hCk',
  maxBatchSize: 100,
  maxBodyBytes: 128 * 1024,
  maxQueueEvents: 2_000,
  maxQuarantinedEvents: 100,
  requestTimeoutMs: 10_000,
};

export function isPlaytestEligible(
  config: PlaytestTelemetryConfig,
  runtime: PlaytestRuntime,
): boolean {
  return config.enabled && runtime.packaged && !runtime.benchmark &&
    config.admittedBuildVersions.includes(runtime.buildVersion);
}
