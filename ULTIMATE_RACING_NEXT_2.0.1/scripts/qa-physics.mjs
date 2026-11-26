import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const extract = (name, nextName) => {
  const start = html.indexOf(`function ${name}(`);
  const end = nextName ? html.indexOf(`\nfunction ${nextName}(`, start) : -1;
  assert(start >= 0 && end > start, `Could not isolate production function ${name}`);
  return html.slice(start, end).trim();
};
const resolveStart = html.indexOf('function resolveRacerCollision(');
const resolveEnd = html.indexOf('\nlet selectedCarIndex', resolveStart);
assert(resolveStart >= 0 && resolveEnd > resolveStart, 'Could not isolate production collision resolver');
const source = [
  extract('cornerTractionState', 'racerCollisionMass'),
  extract('racerCollisionMass', 'resolveRacerCollision'),
  html.slice(resolveStart, resolveEnd),
  extract('sweptPlanarContact', 'cornerTractionState'),
  extract('resolveRoadEdgeContact', 'sweptLongitudinalContact')
].join('\n');
const context = { Math, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) };
vm.runInNewContext(`${source}\nthis.cornerTractionState=cornerTractionState;this.racerCollisionMass=racerCollisionMass;this.resolveRacerCollision=resolveRacerCollision;this.sweptPlanarContact=sweptPlanarContact;this.resolveRoadEdgeContact=resolveRoadEdgeContact;`, context);

// High-corner load must no longer impose the old 0.72 (~277 km/h) speed ceiling.
const cornerAt77 = context.cornerTractionState(77, .70, 1, false);
const cornerAt106 = context.cornerTractionState(106, .70, 1, false);
assert(cornerAt77.tireScrub === 0, 'At the former ~277 km/h lock, the new continuous traction model should not apply a discontinuous hard cap');
assert(cornerAt106.longitudinalGrip >= .97 - 1e-9, 'No-contact cornering reduced available drive force by more than the 3% target');
let speed = 0;
const dt = 1 / 120;
for (let i = 0; i < 120 * 18; i++) {
  const state = context.cornerTractionState(speed, .70, 1, false);
  speed = Math.max(0, Math.min(100, speed + 33.5 * state.longitudinalGrip * dt) - state.tireScrub * dt);
}
assert(speed > 95, `A vehicle should accelerate beyond 277 km/h in a corner without a fixed 0.72 cap; simulated ${speed.toFixed(2)} m/s (${(speed*3.6).toFixed(1)} km/h)`);

// Production two-axis swept test catches diagonal/high-speed crossings.
const swept = context.sweptPlanarContact;
assert(swept(-10, 10, 10, -10, 3, 3), 'Diagonal crossing between frames was not detected');
assert(swept(-2, 1, .5, -.2, 3, 3), 'Current body overlap was not detected');
assert(!swept(-10, -8, 10, 10, 3, 3), 'Separated racers were incorrectly classified as colliding');

// Guardrail proximity is harmless; a true outward crossing produces one impact response.
const nearRail = context.resolveRoadEdgeContact(8.1, 8.2, .1, 8.5, 0);
assert(!nearRail.hit && nearRail.speedLoss === 0 && nearRail.laneOffset === 8.2, 'Merely approaching the guardrail changed speed');
const edgeImpact = context.resolveRoadEdgeContact(8.45, 8.7, 3, 8.5, 0);
const lightImpact = context.resolveRoadEdgeContact(8.45, 8.62, 1, 8.5, 0);
const strongImpact = context.resolveRoadEdgeContact(8.1, 9.6, 2, 8.5, 0);
assert(edgeImpact.hit && edgeImpact.speedLoss > 1.2 && edgeImpact.laneOffset === 8.5, 'Actual guardrail contact did not produce impact-scaled speed loss');
assert(lightImpact.hit && strongImpact.hit && strongImpact.speedLoss > lightImpact.speedLoss, 'Guardrail impact loss must increase with impact strength');
const edgeCooldown = context.resolveRoadEdgeContact(8.5, 8.7, 3, 8.5, .3);
assert(!edgeCooldown.hit && edgeCooldown.speedLoss === 0, 'Guardrail contact cooldown did not prevent repeated impact penalties');

// The exact same momentum resolver is used for AI/AI and player/AI.
const style = { width: 4.5, length: 5.0 };
const a = { id: 'player', style, speed: 30, distance: 0, previousDistance: -1, laneOffset: 0, targetLane: 0 };
const b = { id: 'rival-01', style, speed: 20, distance: 3, previousDistance: 4, laneOffset: .2, targetLane: .2 };
const massA = context.racerCollisionMass(style), massB = context.racerCollisionMass(style);
const momentumBefore = massA * a.speed + massB * b.speed;
const response = context.resolveRacerCollision(a, b, 3, .2, 6, 5, 9, 9);
const momentumAfter = massA * a.speed + massB * b.speed;
assert(a.speed < 30 && b.speed > 20, 'Rear-end collision did not exchange momentum symmetrically');
assert(Math.abs(momentumBefore - momentumAfter) < 1e-8, 'Longitudinal collision response does not conserve momentum');
assert(response.impulse > 0 && Number.isFinite(response.impulse), 'Collision impulse is invalid');
const relativeAfter = b.speed - a.speed;
assert(Math.abs(relativeAfter - 1.4) < .05, 'Collision response does not use the configured 0.14 restitution');

const updateAi = html.slice(html.indexOf('function updateAICars(dt){'), html.indexOf('\nfunction updateIdle(dt){'));
assert((updateAi.match(/resolveRacerCollision\(/g) || []).length === 2, 'AI/AI and player/AI contact do not share one collision response function');
assert(updateAi.includes('if(!playerFinished){const playerBody=') || updateAi.includes("if(!playerFinished){\n    const playerBody={id:'player'"), 'Player contact proxy did not include the shared physics body');
assert(updateAi.includes('sweptPlanarContact(previousGap,gap,previousLateral,lateral,halfLength,halfWidth)'), 'Swept lateral collision test is not applied to both racer types');
assert(html.includes('const PHYSICS_FIXED_DT=1/120,MAX_PHYSICS_STEPS=12') && html.includes('physicsAccumulator=Math.min(physicsAccumulator+frameDt,PHYSICS_FIXED_DT*MAX_PHYSICS_STEPS)'), 'Fixed 120Hz physics accumulator is missing');
assert(!/maxSpeed\s*\*=?\s*cornerSkill/.test(html), 'A direct corner-skill hard top-speed multiplier remains in the game source');
assert(html.includes('const physical=aiGhostMode?[]:') && html.includes('if(!aiGhostMode){'), 'Ghost mode must skip racer-to-racer collision/avoidance while leaving road-edge movement active');

console.log(JSON.stringify({
  status: 'PASS',
  checks: {
    former277KmhHardCapRemoved: true,
    continuousCornerTractionAndScrub: true,
    noContactCornerDriveForceLossCappedAt3Pct: true,
    canExceedFormer277KmhThreshold: true,
    sweptDiagonalCollisionDetection: true,
    sharedPlayerAiAndAiAiImpulse: true,
    longitudinalMomentumConserved: true,
    restitutionApplied: true,
    fixed120HzPhysics: true,
    guardrailProximityNoSlowdown: true,
    actualGuardrailContactRetained: true,
    guardrailImpactCooldown: true,
    impactScaledSpeedLoss: true
  },
  observations: {
    speedAfter18SecondsInTightCornerMs: +speed.toFixed(3),
    speedAfter18SecondsInTightCornerKmh: +(speed * 3.6).toFixed(1),
    former277KmhThresholdMs: 277 / 3.6,
    cornerTractionAt77Ms: cornerAt77,
    cornerTractionAt106Ms: cornerAt106,
    collisionSpeedsAfterImpact: { player: +a.speed.toFixed(3), rival: +b.speed.toFixed(3) },
    momentumBefore: +momentumBefore.toFixed(6),
    momentumAfter: +momentumAfter.toFixed(6),
    collisionImpulse: +response.impulse.toFixed(6),
    guardrail: { proximitySpeedLoss: nearRail.speedLoss, lightImpactSpeedLoss: lightImpact.speedLoss, mediumImpactSpeedLoss: edgeImpact.speedLoss, strongImpactSpeedLoss: strongImpact.speedLoss, cooldownSpeedLoss: edgeCooldown.speedLoss }
  }
}, null, 2));
