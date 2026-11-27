import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const extractBetween = (startMarker, endMarker) => {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return html.slice(start, end);
};

// Startup ordering regression: the Ghost Mode state must exist before the first setter call.
const modeDecl = html.indexOf('let aiVehicleMode=');
const firstModeCall = html.indexOf('setAIVehicleMode(aiVehicleMode,false);');
assert(modeDecl >= 0 && firstModeCall > modeDecl, 'AI mode variable is used before initialization');

// Execute the production Ghost Mode material and preference functions against minimal Three.js-like meshes.
const visualsSource = extractBetween('function setAIGhostVisuals(enabled){', '\nfunction setAIVehicleMode(value,save=true){');
const modeSource = extractBetween('function setAIVehicleMode(value,save=true){', '\nsetAIVehicleMode(aiVehicleMode,false);');
class Material {
  constructor(opacity = 1) { this.opacity = opacity; this.transparent = false; this.depthWrite = true; this.needsUpdate = false; }
  clone() { return new Material(this.opacity); }
}
const meshA = { isMesh: true, userData: {}, material: new Material(1), renderOrder: 0 };
const meshB = { isMesh: true, userData: {}, material: [new Material(.9), new Material(1)], renderOrder: 0 };
const aiCars = [
  { root: { traverse(fn) { fn(meshA); } } },
  { root: { traverse(fn) { fn(meshB); } } }
];
const storage = new Map([['ur_ai_vehicle_mode', 'normal']]);
const select = { value: 'normal' };
const hint = { textContent: '' };
const visualCalls = [];
const context = {
  WeakMap, Number, Array, Math,
  aiCars,
  aiGhostMaterialCache: new WeakMap(),
  aiVehicleMode: 'normal', aiGhostMode: false,
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
  $: id => id === 'aiVehicleModeSelect' ? select : id === 'aiVehicleModeHint' ? hint : null,
};
vm.runInNewContext(`${visualsSource}\n${modeSource}\nthis.setAIGhostVisuals=setAIGhostVisuals;this.setAIVehicleMode=setAIVehicleMode;`, context);
const originalA = meshA.material;
const originalB = meshB.material;
context.setAIVehicleMode('ghost', true);
assert(context.aiGhostMode === true && context.aiVehicleMode === 'ghost', 'Ghost Mode state did not enable');
assert(storage.get('ur_ai_vehicle_mode') === 'ghost', 'Ghost Mode choice was not persisted');
assert(select.value === 'ghost' && /Ghost Mode/.test(hint.textContent) && /도로 경계/.test(hint.textContent), 'Ghost Mode UI feedback was not updated');
assert(meshA.material !== originalA && meshA.material.transparent && meshA.material.opacity <= .43 && meshA.material.depthWrite === false, 'Single-material AI ghost appearance was not applied');
assert(Array.isArray(meshB.material) && meshB.material.every(m => m.transparent && m.opacity <= .43), 'Multi-material AI ghost appearance was not applied');
context.setAIVehicleMode('normal', true);
assert(context.aiGhostMode === false && storage.get('ur_ai_vehicle_mode') === 'normal', 'Normal Mode state was not restored/persisted');
assert(meshA.material === originalA && meshB.material === originalB, 'Original AI materials were not restored');
assert(meshA.renderOrder === 0 && meshB.renderOrder === 0, 'AI render order was not restored');

// Production HUD formatter must display measured current speed, never the max-speed field.
const speedSource = extractBetween('function speedKmhText(value){', '\n// Change biomes');
const hud = { speedNum: { textContent: '' }, topSpeed: { textContent: '' } };
const speedContext = { Number, Math, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), speed: 0, $: id => hud[id] };
vm.runInNewContext(`${speedSource}\nthis.speedKmhText=speedKmhText;this.updateSpeedDisplay=updateSpeedDisplay;`, speedContext);
assert(speedContext.speedKmhText(0) === '000', 'Stopped vehicle did not show 000');
assert(speedContext.speedKmhText(Number.NaN) === '000', 'Invalid speed did not safely show 000');
assert(speedContext.speedKmhText(100) === '360', 'Current speed conversion from m/s to km/h is incorrect');
speedContext.updateSpeedDisplay();
assert(hud.speedNum.textContent === '000' && hud.topSpeed.textContent === '000', 'HUD did not refresh current speed while stopped');
speedContext.speed = 100; speedContext.updateSpeedDisplay();
assert(hud.speedNum.textContent === '360' && hud.topSpeed.textContent === '360', 'HUD does not follow current physical speed');

// Ensure the mode gates only racer-to-racer contact; road/guardrail calculations run before the gate.
const aiStart = html.indexOf('function updateAICars(dt){');
const aiEnd = html.indexOf('\nfunction ', aiStart + 12);
const aiSource = html.slice(aiStart, aiEnd > aiStart ? aiEnd : undefined);
assert(aiSource.includes('const physical=aiGhostMode?[]:[player,'), 'Ghost Mode does not clear racer-to-racer traffic contacts');
const contactGate = aiSource.indexOf('if(!aiGhostMode){');
assert(contactGate > 0 && aiSource.indexOf('resolveRoadEdgeContact(') < contactGate, 'Ghost Mode incorrectly disables AI road-edge handling');
assert(aiSource.includes('sweptPlanarContact(') && aiSource.indexOf('sweptPlanarContact(') > contactGate, 'Normal Mode racer collision detection missing');
assert(aiSource.includes("if(difficulty==='easy'&&!aiGhostMode)"), 'Easy-mode player-yield behavior missing');
const rewardStart = html.indexOf('function gpRunReward(position,runId,finished=true){');
const rewardEnd = html.indexOf('\nfunction advanceCareerWithoutWin(', rewardStart);
const gpRewardSource = html.slice(rewardStart, rewardEnd);
const taStart = html.indexOf('function timeAttackReward(runId){');
const taEnd = html.indexOf('\nconst GP_POSITION_POINTS', taStart);
const taRewardSource = html.slice(taStart, taEnd);
assert(rewardStart >= 0 && rewardEnd > rewardStart && !/aiGhostMode|aiVehicleMode/.test(gpRewardSource), 'Ghost Mode must not alter Grand Prix payouts');
assert(taStart >= 0 && taEnd > taStart && !/aiGhostMode|aiVehicleMode/.test(taRewardSource), 'Ghost Mode must not alter Time Attack payouts');

// Drift response stays between the earlier loose and heavy versions.
const driftChecks = {
  steeringYawTarget: html.includes('drifting?1.50:1'),
  steeringYawDamping: html.includes('drifting?.31:.24'),
  travelSlip: html.includes('steer*.22'),
  playerBodyYawApplied: html.includes('car.rotation.y=bodyYaw') && html.includes('playerBodyYaw(vehicleYaw,driftAngle)'),
  driftBodyTargetUsesHandling: html.includes('function driftBodyAngleTarget(') && html.includes('driftBodyAngleTarget(steer,drifting,perf.driftHandling/BASE_PERFORMANCE.driftHandling,driftQuality)'),
  noProximityBrake: !html.includes('tireScrub*dt')
};
assert(Object.values(driftChecks).every(Boolean), 'Drift midpoint regression checks failed');

console.log(JSON.stringify({
  status: 'PASS',
  checks: {
    ghostModeStateDeclaredBeforeUse: true,
    ghostModePersisted: true,
    ghostMaterialsBecomeTransparent: true,
    ghostMaterialsRestoreExactly: true,
    ghostModeDisablesRacerContactsOnly: true,
    environmentAndRoadEdgeHandlingRemainActive: true,
    ghostAndNormalRewardsIdentical: true,
    easyAiYieldsToPlayer: true,
    stoppedSpeedDisplaysZero: true,
    currentSpeedUsesMpsToKmhConversion: true,
    driftFeelMidpoint: driftChecks
  }
}, null, 2));
