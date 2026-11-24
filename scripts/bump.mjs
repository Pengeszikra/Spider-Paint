// Date-based npm SemVer, matching 3Draft: YY.M.DNNN
// display example: 26.11.20001 -> 26.11.20.001
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncVersion } from './version-files.mjs';

export const displayVersion = (version) => {
  const [yy, mm, packed] = version.split('.').map(Number);
  const pad = (n, width) => String(n).padStart(width, '0');
  return `${pad(yy, 2)}.${pad(mm, 2)}.${pad(Math.floor(packed / 1000), 2)}.${pad(packed % 1000, 3)}`;
};

export const nextVersion = (current, date = new Date()) => {
  const yy = date.getFullYear() % 100;
  const mm = date.getMonth() + 1;
  const day = date.getDate();
  const parts = String(current).split('.').map(Number);
  const sameDay = parts.length === 3 && parts[0] === yy && parts[1] === mm && Math.floor(parts[2] / 1000) === day;
  const nextBuild = sameDay ? (parts[2] % 1000) + 1 : 1;
  if (nextBuild > 999) throw new Error('more than 999 builds in one day');
  const candidate = `${yy}.${mm}.${day * 1000 + nextBuild}`;
  const validPrior = parts.length === 3 && parts.every(Number.isInteger);
  if (validPrior && (yy < parts[0] || (yy === parts[0] && mm < parts[1]) || (yy === parts[0] && mm === parts[1] && day < Math.floor(parts[2] / 1000)))) {
    throw new Error('date would move version backwards');
  }
  return candidate;
};

const run = () => {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
  const version = nextVersion(pkg.version);
  console.log(`${pkg.version} -> ${version} (${displayVersion(version)})`);
  if (process.argv.includes('--dry')) return;
  pkg.version = version;
  writeFileSync(pkgUrl, JSON.stringify(pkg, null, 2) + '\n');
  const synced = syncVersion(fileURLToPath(new URL('..', import.meta.url)), pkg.name, version);
  if (synced.length) console.log('  also in ' + synced.join(', '));
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
