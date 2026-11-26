import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'public', 'game', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const ids = [...html.matchAll(/\bid=["']([^"']+)/g)].map(x => x[1]);
const counts = new Map();
for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
const duplicates = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
const refs = new Set([
  ...[...html.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(x => x[1]),
  ...[...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x => x[1]),
]);
const missing = [...refs].filter(id => !counts.has(id));
const scripts = [...html.matchAll(/<script(?:\s+type="module")?[^>]*>([\s\S]*?)<\/script>/gi)].map(x => x[1]).filter(x => x.trim());
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ur-qa-'));
let syntaxFailures = [];
for (let i = 0; i < scripts.length; i++) {
  const file = path.join(temp, `script-${i}.${i === 2 ? 'mjs' : 'js'}`);
  fs.writeFileSync(file, scripts[i]);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) syntaxFailures.push({ index: i, stderr: result.stderr });
}
const checks = {
  uniqueDomIds: duplicates.length === 0,
  staticDomReferencesResolve: missing.length === 0,
  inlineScriptSyntax: syntaxFailures.length === 0,
  twentyTracks: (html.match(/\['(?:NEON METROPOLIS|COASTAL HIGHWAY|DESERT CANYON|ALPINE SNOW|TROPICAL JUNGLE|VOLCANO CIRCUIT|INTERNATIONAL AIRPORT|HARBOR DISTRICT|MOUNTAIN FOREST|INDUSTRIAL NIGHT|SKYWAY CITY|COUNTRYSIDE RUN|RAINY DOWNTOWN|GLACIER TUNNEL|SEASIDE CLIFFS|ANCIENT RUINS|DESERT NIGHT|TROPICAL RESORT|HIGHLAND DAM|MIDNIGHT EXPRESSWAY)'/g) || []).length === 20,
  tenCars: (html.match(/\['UR-X\d\d /g) || []).length === 10,
  sixRemappableControls: (html.match(/data-bind-action=/g) || []).length === 6,
  resolutionSetting: html.includes('id="settingResolution"'),
  fullscreenSetting: html.includes('id="settingFullscreen"'),
  achievements: html.includes('id="achievementList"'),
  proceduralMusic: html.includes('window.__UR_BGM__'),
  errorLogExport: html.includes('id="exportErrorLog"'),
};
console.log(JSON.stringify({ checks, duplicates, missing, syntaxFailures }, null, 2));
if (Object.values(checks).some(v => !v) || duplicates.length || missing.length || syntaxFailures.length) process.exit(1);
