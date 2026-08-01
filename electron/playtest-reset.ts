import * as fs from 'node:fs';
import * as path from 'node:path';
import { isPlaytestEligible, TELEMETRY_CONFIG } from './telemetry/config';
import type { PlaytestRuntime, PlaytestTelemetryConfig } from './telemetry/config';

interface ResetMarker {
  epoch: string;
  status: 'pending' | 'complete';
  buildVersion: string;
}

export function isPlaytestResetRequired(
  userDataPath: string,
  runtime: PlaytestRuntime,
  config: PlaytestTelemetryConfig = TELEMETRY_CONFIG,
): boolean {
  if (!isPlaytestEligible(config, runtime) || config.resetEpoch === null) return false;
  const marker = readMarker(path.join(userDataPath, 'playtest-reset.json'));
  if (marker?.status === 'pending') return true;
  return !(marker?.epoch === config.resetEpoch && marker.status === 'complete');
}

export function preparePlaytestReset(
  userDataPath: string,
  runtime: PlaytestRuntime,
  config: PlaytestTelemetryConfig = TELEMETRY_CONFIG,
): string | null {
  if (!isPlaytestEligible(config, runtime) || config.resetEpoch === null) return null;
  const markerPath = path.join(userDataPath, 'playtest-reset.json');
  const marker = readMarker(markerPath);
  // Eligible future waves coalesce an interrupted older reset into their own
  // epoch. Disabled/ineligible builds return above without even reading it.
  if (marker?.status === 'pending') {
    if (config.resetEpoch !== marker.epoch) {
      writeMarker(markerPath, { epoch: config.resetEpoch, status: 'pending', buildVersion: runtime.buildVersion });
    }
    clearProgressFiles(userDataPath);
    return config.resetEpoch;
  }
  if (marker?.epoch === config.resetEpoch && marker.status === 'complete') return null;

  // Pending is durable before deletion. A crash leaves a retryable transaction,
  // never a marker that claims completion over partially-cleared progress.
  writeMarker(markerPath, { epoch: config.resetEpoch, status: 'pending', buildVersion: runtime.buildVersion });
  clearProgressFiles(userDataPath);
  return config.resetEpoch;
}

function clearProgressFiles(userDataPath: string): void {
  fs.rmSync(path.join(userDataPath, 'profile.json'), { force: true });
  fs.rmSync(path.join(userDataPath, 'run-history.json'), { force: true });
}

export function completePlaytestReset(userDataPath: string, epoch: string): boolean {
  const markerPath = path.join(userDataPath, 'playtest-reset.json');
  const marker = readMarker(markerPath);
  if (!marker || marker.epoch !== epoch) return false;
  if (marker.status === 'complete') return true;
  writeMarker(markerPath, { ...marker, status: 'complete' });
  return true;
}

function readMarker(filePath: string): ResetMarker | null {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Playtest reset marker is unreadable: ${(error as Error).message}`);
  }
  try {
    const value = JSON.parse(source.replace(/^\uFEFF/, '')) as Partial<ResetMarker>;
    if (typeof value.epoch === 'string' &&
        (value.status === 'pending' || value.status === 'complete') &&
        typeof value.buildVersion === 'string') return value as ResetMarker;
  } catch { /* reported uniformly below */ }
  throw new Error('Playtest reset marker is corrupt');
}

function writeMarker(filePath: string, marker: ResetMarker): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const descriptor = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(marker, null, 2), 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, filePath);
}
