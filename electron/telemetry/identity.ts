import * as fs from 'node:fs';
import { atomicWriteJson } from './queue';

interface InstallationIdentity {
  schemaVersion: 1;
  installationId: string;
}

export function loadOrCreateInstallationId(
  filePath: string,
  createId: () => string,
  now: () => Date = () => new Date(),
): string {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as Partial<InstallationIdentity>;
    if (parsed.schemaVersion === 1 && isValidId(parsed.installationId)) return parsed.installationId;
    throw new Error('Invalid telemetry installation identity');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      try { fs.renameSync(filePath, `${filePath}.corrupt-${now().getTime()}.json`); } catch { /* Best effort. */ }
    }
    const installationId = createId();
    atomicWriteJson(filePath, { schemaVersion: 1, installationId } satisfies InstallationIdentity);
    return installationId;
  }
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 256;
}
