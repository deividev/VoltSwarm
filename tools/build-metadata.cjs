const FULL_GAME_STEAM_APP_ID = 4979220;
const FULL_GAME_STEAM_URL = 'https://store.steampowered.com/app/4979220/Voltswarm/';
const DEMO_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-demo\.(0|[1-9]\d*)$/;

function validateDemoBuildMetadata(pkg) {
  const metadata = pkg?.voltswarmBuild;
  const problems = [];
  if (!DEMO_VERSION_PATTERN.test(pkg?.version ?? '')) {
    problems.push('package version must be a SemVer demo prerelease (for example, 0.11.0-demo.1)');
  }
  if (metadata?.flavor !== 'demo') problems.push('build flavor must be demo');
  if (!Array.isArray(metadata?.allowedMaps) ||
      metadata.allowedMaps.length !== 1 || metadata.allowedMaps[0] !== 'scrapyard') {
    problems.push('demo map allowlist must contain only scrapyard');
  }
  if (metadata?.userDataDirectory !== 'Voltswarm Demo') {
    problems.push('demo userData directory must be Voltswarm Demo');
  }
  if (metadata?.fullGameSteamAppId !== FULL_GAME_STEAM_APP_ID) {
    problems.push(`full-game Steam App ID must be ${FULL_GAME_STEAM_APP_ID}`);
  }
  if (metadata?.fullGameSteamUrl !== FULL_GAME_STEAM_URL) {
    problems.push(`full-game Steam URL must be ${FULL_GAME_STEAM_URL}`);
  }
  return problems;
}

function isCanonicalFullGameSteamTarget(appId, url) {
  if (appId !== FULL_GAME_STEAM_APP_ID || url !== FULL_GAME_STEAM_URL) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'store.steampowered.com' &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.pathname === `/app/${FULL_GAME_STEAM_APP_ID}/Voltswarm/`;
  } catch {
    return false;
  }
}

module.exports = {
  FULL_GAME_STEAM_APP_ID,
  FULL_GAME_STEAM_URL,
  isCanonicalFullGameSteamTarget,
  validateDemoBuildMetadata,
};
