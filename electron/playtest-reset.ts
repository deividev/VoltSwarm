import * as fs from 'node:fs';
import * as path from 'node:path';

/** Changing `epoch` is the only switch needed for a future playtest reset.
 * Exact build allowlisting prevents a later production build from inheriting it. */
export const PLAYTEST_RESET_CONFIG = {
  enabled: true,
  epoch: 'wave-1-rc-2026-08',
  buildVersions: ['0.10.2-beta'],
} as const;

interface ResetMarker {
  epoch: string;
  status: 'pending' | 'complete';
  buildVersion: string;
}

export function isPlaytestResetRequired(
  userDataPath: string,
  packaged: boolean,
  buildVersion: string,
  config: { enabled: boolean; epoch: string; buildVersions: readonly string[] } = PLAYTEST_RESET_CONFIG,
): boolean {
  if (!packaged) return false;
  const marker = readMarker(path.join(userDataPath, 'playtest-reset.json'));
  if (marker?.status === 'pending') return true;
  return config.enabled && config.buildVersions.includes(buildVersion) &&
    !(marker?.epoch === config.epoch && marker.status === 'complete');
}

export function preparePlaytestReset(
  userDataPath: string,
  packaged: boolean,
  buildVersion: string,
  config: { enabled: boolean; epoch: string; buildVersions: readonly string[] } = PLAYTEST_RESET_CONFIG,
): string | null {
  if (!packaged) return null;
  const markerPath = path.join(userDataPath, 'playtest-reset.json');
  const marker = readMarker(markerPath);
  // A pending transaction belongs to the installation, not the current build.
  // Resume it before allowlist checks so an upgrade cannot load partial state.
  if (marker?.status === 'pending') {
    const currentBuildStartsEpoch = config.enabled && config.buildVersions.includes(buildVersion);
    const epoch = currentBuildStartsEpoch ? config.epoch : marker.epoch;
    if (epoch !== marker.epoch) {
      writeMarker(markerPath, { epoch, status: 'pending', buildVersion });
    }
    clearProgressFiles(userDataPath);
    return epoch;
  }
  if (!config.enabled || !config.buildVersions.includes(buildVersion)) return null;
  if (marker?.epoch === config.epoch && marker.status === 'complete') return null;

  // Pending is durable before deletion. A crash leaves a retryable transaction,
  // never a marker that claims completion over partially-cleared progress.
  writeMarker(markerPath, { epoch: config.epoch, status: 'pending', buildVersion });
  clearProgressFiles(userDataPath);
  return config.epoch;
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
