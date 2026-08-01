import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isPlaytestEligible } from './config';
import type { PlaytestRuntime, PlaytestTelemetryConfig } from './config';
import { loadOrCreateInstallationId } from './identity';
import { exponentialBackoffMs, TelemetryQueue } from './queue';
import type { TelemetryEventType, UploadResult } from './types';
import { validateRendererTelemetryEvent } from './validation';

type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

export interface TelemetryClientOptions {
  fetch?: FetchImplementation;
  createId?: () => string;
  now?: () => Date;
  requestTimeoutMs?: number;
  automaticScheduling?: boolean;
}

export class TelemetryClient {
  private readonly buildVersion: string;
  private readonly sessionId: string;
  private readonly installationId: string;
  private readonly queue: TelemetryQueue;
  private readonly fetchImpl: FetchImplementation;
  private readonly now: () => Date;
  private readonly requestTimeoutMs: number;
  private readonly automaticScheduling: boolean;
  private readonly activeRunIds = new Set<string>();
  private uploadTimer: NodeJS.Timeout | null = null;
  private uploading = false;
  private stopped = false;
  private backoffAttempt = 0;
  private batchSizeLimit: number;

  constructor(
    userDataPath: string,
    runtime: PlaytestRuntime,
    private readonly config: PlaytestTelemetryConfig,
    consentGranted: boolean,
    options: TelemetryClientOptions = {},
  ) {
    if (!isPlaytestEligible(config, runtime) || !consentGranted) {
      throw new Error('telemetry_not_authorized');
    }
    this.buildVersion = runtime.buildVersion;
    const createId = options.createId ?? randomUUID;
    this.sessionId = createId();
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.requestTimeoutMs = options.requestTimeoutMs ?? config.requestTimeoutMs;
    this.automaticScheduling = options.automaticScheduling ?? true;
    this.batchSizeLimit = config.maxBatchSize;
    this.installationId = loadOrCreateInstallationId(
      path.join(userDataPath, 'telemetry-installation.json'),
      createId,
    );
    this.queue = new TelemetryQueue(
      path.join(userDataPath, 'telemetry-queue.json'),
      config.maxQueueEvents,
      createId,
      this.now,
    );
  }

  start(): void {
    this.captureMainEvent('session_started', { launchMode: 'packaged' });
    this.scheduleUpload(250);
  }

  captureRendererEvent(value: unknown): boolean {
    if (this.stopped) return false;
    const event = validateRendererTelemetryEvent(value);
    if (!event) {
      console.warn(`Telemetry renderer event rejected by local validation (type=${rendererEventType(value)})`);
      return false;
    }
    this.enqueue(event.type, event.payload, event.runId);
    if (event.type === 'run_started') this.activeRunIds.add(event.runId);
    if (event.type === 'run_ended') this.activeRunIds.delete(event.runId);
    this.scheduleUpload(250);
    return true;
  }

  async flushPending(): Promise<void> {
    await this.uploadOnce();
  }

  stop(reason: string): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    this.uploadTimer = null;
    for (const runId of this.activeRunIds) {
      this.captureMainEvent('run_ended', { outcome: 'abandoned', reason }, runId);
    }
    this.activeRunIds.clear();
    this.captureMainEvent('session_ended', { reason });
  }

  private captureMainEvent(
    type: Extract<TelemetryEventType, 'session_started' | 'session_ended' | 'run_ended'>,
    payload: Record<string, unknown>,
    runId?: string,
  ): void {
    this.enqueue(type, payload, runId);
  }

  private enqueue(type: TelemetryEventType, payload: Record<string, unknown>, runId?: string): void {
    this.queue.enqueue({
      type,
      payload,
      gameId: this.config.gameId,
      waveId: this.config.waveId,
      schemaVersion: this.config.schemaVersion,
      buildVersion: this.buildVersion,
      sessionId: this.sessionId,
      ...(runId ? { runId } : {}),
    });
  }

  private scheduleUpload(delayMs: number): void {
    if (!this.automaticScheduling || this.stopped || this.uploading || this.uploadTimer) return;
    this.uploadTimer = setTimeout(() => {
      this.uploadTimer = null;
      void this.uploadOnce();
    }, delayMs);
  }

  private async uploadOnce(): Promise<void> {
    if (this.uploading || this.stopped) return;
    const batch = this.queue.selectBatch(
      {
        gameId: this.config.gameId,
        waveId: this.config.waveId,
        schemaVersion: this.config.schemaVersion,
        installationId: this.installationId,
      },
      this.batchSizeLimit,
      this.config.maxBodyBytes,
    );
    if (!batch) return;
    this.uploading = true;
    let nextDelay: number | null = null;
    try {
      const response = await this.fetchWithDeadline(batch);
      const hasReportableEvent = batch.events.some((event) => event.type !== 'upload_error');
      if (response.status === 413) {
        if (batch.events.length > 1) {
          this.batchSizeLimit = Math.max(1, Math.floor(batch.events.length / 2));
          this.queue.recordUploadFailure('http_413_batch_reduced', hasReportableEvent);
        } else {
          const event = batch.events[0];
          if (event && this.queue.quarantine(
            event.eventId,
            'http_413_singleton',
            this.config.maxQuarantinedEvents,
          )) {
            this.queue.recordQuarantine('http_413_singleton', hasReportableEvent);
          } else {
            throw new Error('http_413_quarantine_failed');
          }
          this.batchSizeLimit = this.config.maxBatchSize;
        }
        nextDelay = this.queue.length > 0 ? 0 : null;
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        throw new Error(`http_${response.status}`);
      }
      const body = response.body as { results?: UploadResult[] };
      const batchIds = new Set(batch.events.map((event) => event.eventId));
      const results = Array.isArray(body.results)
        ? body.results.filter((result): result is UploadResult => isUploadResult(result) && batchIds.has(result.eventId))
        : [];
      const removed = this.queue.acknowledge(results);
      if (removed !== batch.events.length) throw new Error('partial_ack');
      this.backoffAttempt = 0;
      this.batchSizeLimit = this.config.maxBatchSize;
      const recovered = this.queue.consumeUploadFailureAfterRecovery();
      if (recovered) {
        this.enqueue('upload_error', {
          failureCount: recovered.count,
          firstFailureAt: recovered.firstAt,
          lastFailureAt: recovered.lastAt,
          lastReason: recovered.lastReason,
          droppedEvents: recovered.droppedEvents,
          quarantinedEvents: recovered.quarantinedEvents,
          recoveredAt: this.now().toISOString(),
        });
      }
      if (this.queue.length > 0) nextDelay = 0;
    } catch (error) {
      const hasReportableEvent = batch.events.some((event) => event.type !== 'upload_error');
      this.queue.recordUploadFailure(normalizeReason(error), hasReportableEvent);
      nextDelay = exponentialBackoffMs(this.backoffAttempt++);
    } finally {
      this.uploading = false;
      if (nextDelay !== null && this.queue.length > 0 && !this.stopped) {
        this.scheduleUpload(nextDelay);
      }
    }
  }

  private async fetchWithDeadline(batch: unknown): Promise<{ status: number; body?: unknown }> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.endpoint}/v1/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-token': this.config.clientToken,
        },
        body: JSON.stringify(batch),
        signal: controller.signal,
      });
      if (response.status !== 200 && response.status !== 202) return { status: response.status };
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        throw new Error('invalid_response_content_type');
      }
      const declaredBytes = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredBytes) && declaredBytes > 64 * 1024) throw new Error('response_too_large');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > 64 * 1024) throw new Error('response_too_large');
      return { status: response.status, body: JSON.parse(text) as unknown };
    } catch (error) {
      if (timedOut) throw new Error('request_timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isUploadResult(value: unknown): value is UploadResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<UploadResult>;
  return (
    typeof result.eventId === 'string' &&
    (result.status === 'accepted' || result.status === 'duplicate')
  );
}

function normalizeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 128) || 'unknown_error';
}

function rendererEventType(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown';
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && /^[A-Za-z_]+$/.test(type) ? type.slice(0, 32) : 'unknown';
}
