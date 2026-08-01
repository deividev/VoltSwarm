import * as fs from 'node:fs';
import * as path from 'node:path';
import { TELEMETRY_EVENT_TYPES } from './types';
import type {
  QueueState,
  QuarantinedTelemetryEvent,
  QueuedTelemetryEvent,
  TelemetryBatch,
  TelemetryEventType,
  UploadFailureState,
  UploadResult,
} from './types';

const EMPTY_STATE = (): QueueState => ({ schemaVersion: 1, events: [], quarantinedEvents: [] });
const EVENT_TYPES = new Set<string>(TELEMETRY_EVENT_TYPES);

export interface BatchScope {
  gameId: string;
  waveId: string;
  schemaVersion: number;
  installationId: string;
}

export interface EnqueueInput {
  type: TelemetryEventType;
  payload: Record<string, unknown>;
  buildVersion: string;
  sessionId: string;
  runId?: string;
}

export function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const descriptor = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* Best-effort temp cleanup. */ }
    throw error;
  }
}

export function exponentialBackoffMs(
  attempt: number,
  random = Math.random,
  baseMs = 2_000,
  maxMs = 300_000,
): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.min(maxMs, Math.round(exponential * (0.75 + random() * 0.5)));
}

export class TelemetryQueue {
  private state: QueueState;

  constructor(
    private readonly filePath: string,
    private readonly maxEvents: number,
    private readonly createId: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.state = this.load();
  }

  enqueue(input: EnqueueInput): QueuedTelemetryEvent {
    const event: QueuedTelemetryEvent = {
      eventId: this.createId(),
      type: input.type,
      clientTimestamp: this.now().toISOString(),
      ...(input.runId ? { runId: input.runId } : {}),
      payload: input.payload,
      buildVersion: input.buildVersion,
      sessionId: input.sessionId,
    };
    this.state.events.push(event);
    const overflow = Math.max(0, this.state.events.length - this.maxEvents);
    if (overflow > 0) {
      this.state.events.splice(0, overflow);
      this.mergeFailure('queue_overflow', true, overflow, 0);
    }
    this.persist();
    return event;
  }

  selectBatch(scope: BatchScope, maxCount: number, maxBytes: number): TelemetryBatch | null {
    const first = this.state.events[0];
    if (!first) return null;
    const selected: QueuedTelemetryEvent[] = [];
    for (const event of this.state.events) {
      if (event.sessionId !== first.sessionId || event.buildVersion !== first.buildVersion) break;
      if (selected.length >= maxCount) break;
      const next = [...selected, event];
      const batch = buildBatch(scope, first, next);
      if (Buffer.byteLength(JSON.stringify(batch), 'utf8') > maxBytes) break;
      selected.push(event);
    }
    return selected.length > 0 ? buildBatch(scope, first, selected) : null;
  }

  acknowledge(results: readonly UploadResult[]): number {
    const acknowledged = new Set(
      results
        .filter((result) => result.status === 'accepted' || result.status === 'duplicate')
        .map((result) => result.eventId),
    );
    if (acknowledged.size === 0) return 0;
    const before = this.state.events.length;
    this.state.events = this.state.events.filter((event) => !acknowledged.has(event.eventId));
    const removed = before - this.state.events.length;
    if (removed > 0) this.persist();
    return removed;
  }

  quarantine(eventId: string, reason: string, maxQuarantinedEvents: number): QueuedTelemetryEvent | null {
    const index = this.state.events.findIndex((event) => event.eventId === eventId);
    if (index < 0) return null;
    const [event] = this.state.events.splice(index, 1);
    if (!event) return null;
    const quarantined = this.state.quarantinedEvents ?? [];
    quarantined.push({
      event,
      reason,
      quarantinedAt: this.now().toISOString(),
    });
    this.state.quarantinedEvents = quarantined;
    const overflow = Math.max(0, quarantined.length - maxQuarantinedEvents);
    if (overflow > 0) {
      quarantined.splice(0, overflow);
      this.mergeFailure('quarantine_overflow', true, overflow, 0);
    }
    this.persist();
    return event;
  }

  recordUploadFailure(reason: string, reportable: boolean): void {
    this.mergeFailure(reason, reportable, 0, 0);
    this.persist();
  }

  recordQuarantine(reason: string, reportable: boolean): void {
    this.mergeFailure(reason, reportable, 0, 1);
    this.persist();
  }

  consumeUploadFailureAfterRecovery(): UploadFailureState | null {
    const failure = this.state.uploadFailure;
    if (!failure) return null;
    delete this.state.uploadFailure;
    this.persist();
    return failure.reportable ? { ...failure } : null;
  }

  get length(): number {
    return this.state.events.length;
  }

  snapshot(): QueueState {
    return structuredClone(this.state);
  }

  private mergeFailure(
    reason: string,
    reportable: boolean,
    droppedEvents: number,
    quarantinedEvents: number,
  ): void {
    const timestamp = this.now().toISOString();
    const current = this.state.uploadFailure;
    this.state.uploadFailure = current
      ? {
          count: current.count + 1,
          firstAt: current.firstAt,
          lastAt: timestamp,
          lastReason: reason,
          reportable: current.reportable || reportable,
          droppedEvents: current.droppedEvents + droppedEvents,
          quarantinedEvents: (current.quarantinedEvents ?? 0) + quarantinedEvents,
        }
      : {
          count: 1,
          firstAt: timestamp,
          lastAt: timestamp,
          lastReason: reason,
          reportable,
          droppedEvents,
          quarantinedEvents,
        };
  }

  private load(): QueueState {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8').replace(/^\uFEFF/, '');
      const parsed = JSON.parse(raw) as unknown;
      if (!isQueueState(parsed)) throw new Error('Invalid telemetry queue shape');
      parsed.quarantinedEvents ??= [];
      if (parsed.uploadFailure) parsed.uploadFailure.quarantinedEvents ??= 0;
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_STATE();
      this.preserveCorruptFile();
      return EMPTY_STATE();
    }
  }

  private preserveCorruptFile(): void {
    try {
      const backup = `${this.filePath}.corrupt-${this.now().getTime()}.json`;
      fs.renameSync(this.filePath, backup);
    } catch {
      // If preservation fails, continue with an in-memory empty queue. The next
      // successful enqueue will still fail loudly rather than deleting evidence.
    }
  }

  private persist(): void {
    atomicWriteJson(this.filePath, this.state);
  }
}

function buildBatch(
  scope: BatchScope,
  first: QueuedTelemetryEvent,
  events: readonly QueuedTelemetryEvent[],
): TelemetryBatch {
  return {
    ...scope,
    buildVersion: first.buildVersion,
    sessionId: first.sessionId,
    events: events.map((event) => ({
      eventId: event.eventId,
      type: event.type,
      clientTimestamp: event.clientTimestamp,
      ...(event.runId ? { runId: event.runId } : {}),
      payload: event.payload,
    })),
  };
}

function isQueueState(value: unknown): value is QueueState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<QueueState>;
  return (
    state.schemaVersion === 1 &&
    Array.isArray(state.events) &&
    state.events.every(isQueuedEvent) &&
    (state.quarantinedEvents === undefined ||
      (Array.isArray(state.quarantinedEvents) && state.quarantinedEvents.every(isQuarantinedEvent))) &&
    (state.uploadFailure === undefined || isUploadFailure(state.uploadFailure))
  );
}

function isQuarantinedEvent(value: unknown): value is QuarantinedTelemetryEvent {
  if (!value || typeof value !== 'object') return false;
  const quarantined = value as Partial<QuarantinedTelemetryEvent>;
  return (
    isQueuedEvent(quarantined.event) &&
    typeof quarantined.reason === 'string' &&
    typeof quarantined.quarantinedAt === 'string'
  );
}

function isQueuedEvent(value: unknown): value is QueuedTelemetryEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<QueuedTelemetryEvent>;
  return (
    typeof event.eventId === 'string' &&
    typeof event.type === 'string' &&
    EVENT_TYPES.has(event.type) &&
    typeof event.clientTimestamp === 'string' &&
    typeof event.buildVersion === 'string' &&
    typeof event.sessionId === 'string' &&
    !!event.payload &&
    typeof event.payload === 'object' &&
    !Array.isArray(event.payload)
  );
}

function isUploadFailure(value: unknown): value is UploadFailureState {
  if (!value || typeof value !== 'object') return false;
  const failure = value as Partial<UploadFailureState>;
  return (
    Number.isInteger(failure.count) &&
    (failure.count ?? 0) > 0 &&
    typeof failure.firstAt === 'string' &&
    typeof failure.lastAt === 'string' &&
    typeof failure.lastReason === 'string' &&
    typeof failure.reportable === 'boolean' &&
    Number.isInteger(failure.droppedEvents) &&
    (failure.droppedEvents ?? -1) >= 0 &&
    (failure.quarantinedEvents === undefined ||
      (Number.isInteger(failure.quarantinedEvents) && (failure.quarantinedEvents ?? -1) >= 0))
  );
}
