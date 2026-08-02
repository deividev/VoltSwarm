const HUMAN_LABELS = new Map([
  ['alpha', 'Alpha'],
  ['beta', 'Beta'],
  ['preview', 'Preview'],
  ['playtest', 'Playtest'],
  ['demo', 'Demo'],
]);

function formatDisplayVersion(machineVersion) {
  const match = /^(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(machineVersion);
  if (!match) return machineVersion;
  const label = match[2]?.split('.')[0]?.toLowerCase();
  const humanLabel = label ? HUMAN_LABELS.get(label) : undefined;
  if (!humanLabel) return `${match[1]}${match[2] ? ` ${match[2]}` : ''}`;
  const suffix = label === 'demo' ? match[2]?.split('.').slice(1).join(' ') : undefined;
  return `${match[1]} ${humanLabel}${suffix ? ` ${suffix}` : ''}`;
}

module.exports = { formatDisplayVersion };
