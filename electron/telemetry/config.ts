export const TELEMETRY_CONFIG = {
  endpoint: 'https://playtest-telemetry.voltswarm-playtests.workers.dev',
  clientToken: 'B0gQ79eMVQr8owNtDuSEVmPb7kC7uj9C3fmrANv_hCk',
  gameId: 'voltswarm',
  waveId: 'wave-1',
  schemaVersion: 1,
  maxBatchSize: 100,
  maxBodyBytes: 128 * 1024,
  maxQueueEvents: 2_000,
  maxQuarantinedEvents: 100,
  requestTimeoutMs: 10_000,
} as const;
