import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWriteJson } from './queue';
import type { PlaytestTelemetryConfig } from './config';

interface ConsentProof {
  schemaVersion: 1;
  disclosureDigest: string;
  grantedAt: string;
}

function consentFile(userDataPath: string): string {
  return path.join(userDataPath, 'telemetry-consent.json');
}

export function hasTelemetryConsent(userDataPath: string, config: PlaytestTelemetryConfig): boolean {
  let source: string;
  try {
    source = fs.readFileSync(consentFile(userDataPath), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new Error(`Telemetry consent proof is unreadable: ${(error as Error).message}`);
  }
  try {
    const proof = JSON.parse(source.replace(/^\uFEFF/, '')) as Partial<ConsentProof>;
    if (proof.schemaVersion !== 1 || typeof proof.disclosureDigest !== 'string' ||
        typeof proof.grantedAt !== 'string' || !Number.isFinite(Date.parse(proof.grantedAt))) {
      throw new Error('invalid shape');
    }
    return proof.disclosureDigest === disclosureDigest(config);
  } catch {
    throw new Error('Telemetry consent proof is corrupt');
  }
}

export function persistTelemetryConsent(
  userDataPath: string,
  config: PlaytestTelemetryConfig,
  now: Date = new Date(),
): void {
  atomicWriteJson(consentFile(userDataPath), {
    schemaVersion: 1,
    disclosureDigest: disclosureDigest(config),
    grantedAt: now.toISOString(),
  } satisfies ConsentProof);
}

function disclosureDigest(config: PlaytestTelemetryConfig): string {
  const disclosure = config.disclosure;
  return createHash('sha256').update(JSON.stringify([config.consentVersion, disclosure.title,
    disclosure.message, disclosure.detail, disclosure.acceptLabel, disclosure.declineLabel])).digest('hex');
}
