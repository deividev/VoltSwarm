export const TELEMETRY_EVENT_TYPES = [
  'session_started',
  'session_ended',
  'run_started',
  'run_ended',
  'choice',
  'performance',
  'feedback',
  'upload_error',
] as const;

export type TelemetryEventType = (typeof TELEMETRY_EVENT_TYPES)[number];

export interface RendererTelemetryEvent {
  type: Exclude<TelemetryEventType, 'session_started' | 'session_ended' | 'upload_error'>;
  runId: string;
  payload: Record<string, unknown>;
}

export interface QueuedTelemetryEvent {
  eventId: string;
  type: TelemetryEventType;
  clientTimestamp: string;
  runId?: string;
  payload: Record<string, unknown>;
  buildVersion: string;
  sessionId: string;
}

export interface UploadFailureState {
  count: number;
  firstAt: string;
  lastAt: string;
  lastReason: string;
  reportable: boolean;
  droppedEvents: number;
  quarantinedEvents: number;
}

export interface QuarantinedTelemetryEvent {
  event: QueuedTelemetryEvent;
  reason: string;
  quarantinedAt: string;
}

export interface QueueState {
  schemaVersion: 1;
  events: QueuedTelemetryEvent[];
  quarantinedEvents?: QuarantinedTelemetryEvent[];
  uploadFailure?: UploadFailureState;
}

export interface TelemetryBatch {
  gameId: string;
  waveId: string;
  schemaVersion: number;
  buildVersion: string;
  installationId: string;
  sessionId: string;
  events: Array<Omit<QueuedTelemetryEvent, 'buildVersion' | 'sessionId'>>;
}

export interface UploadResult {
  eventId: string;
  status: 'accepted' | 'duplicate';
}
