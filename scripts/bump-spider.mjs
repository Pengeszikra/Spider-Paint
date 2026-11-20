// Automatic calendar-based Spider Paint build number, same encoding as 3Draft:
// 26.11.20.002 => '26.11.20002'. Keep engine version independent.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../spider-version.js', import.meta.url));
const source = readFileSync(file, 'utf8');
const match = source.match(/export const spiderVersion = '(\d+)\.(\d+)\.(\d+)';/);
if (!match) throw Error('Missing Spider Paint version constant');
const current = match.slice(1).map(Number);
const now = new Date();
const year = now.getUTCFullYear() % 100, month = now.getUTCMonth() + 1, day = now.getUTCDate();
const today = year === current[0] && month === current[1] && Math.floor(current[2] / 1000) === day;
const build = today ? current[2] % 1000 + 1 : 1;
if (build > 999) throw Error('Daily build number exhausted');
const version = `${year}.${month}.${day * 1000 + build}`;
if (!process.argv.includes('--dry')) writeFileSync(file,source.replace(match[0],`export const spiderVersion = '${version}';`));
console.log(`${current.join('.')} -> ${version} (${String(year).padStart(2,'0')}.${String(month).padStart(2,'0')}.${String(day).padStart(2,'0')}.${String(build).padStart(3,'0')})`);
