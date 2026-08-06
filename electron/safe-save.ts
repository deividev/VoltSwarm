import * as fs from 'node:fs';

/** Crash-safe persistence for the player's saves.
 *
 *  Split out of main.ts so it can be tested directly: these two functions are
 *  the only thing standing between a power cut and a wiped profile, and that is
 *  not something to verify by hand. */

/** Writes to a temp file, flushes it to disk, then renames it over the target.
 *  Rename is atomic on NTFS and POSIX alike, so an interrupted save leaves the
 *  PREVIOUS file intact instead of a truncated one.
 *
 *  This matters more than it looks: the profile is written at the end of every
 *  run and on every contract settlement, and the loaders treat an unparseable
 *  save as "no save" and fall back to defaults. Without the rename, one power
 *  cut mid-write costs the player every unlock, socket and lifetime stat they
 *  ever earned, with no error shown anywhere. */
export function writeFileAtomic(target: string, data: string): void {
  const temp = `${target}.tmp`;
  const handle = fs.openSync(temp, 'w');
  try {
    fs.writeFileSync(handle, data, 'utf8');
    // Flush before renaming. Without fsync the rename can land while the bytes
    // are still only in the OS cache — which survives a process crash but not a
    // power cut, the exact case this guard exists for.
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temp, target);
}

/** Reads a save, quarantining it instead of returning garbage when it does not
 *  parse. A file corrupted by an older build would otherwise be read as "no
 *  save" and then OVERWRITTEN by the next autosave, destroying whatever was
 *  still recoverable. Moving it aside preserves it for manual recovery and lets
 *  the game start clean.
 *
 *  Returns null both when there is no save at all (ordinary first launch) and
 *  when one was quarantined — the caller's behaviour is identical either way. */
export function readSaveOrQuarantine(file: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      // Quarantine is best-effort. Never block startup over it.
    }
    return null;
  }
}
