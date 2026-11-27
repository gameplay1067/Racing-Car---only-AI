import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const take = (name, endMarker) => {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `Missing production helper ${name}`);
  return html.slice(start, end).trim();
};
const resolveStart = html.indexOf('function resolveRacerCollision(');
const resolveEnd = html.indexOf('\nlet selectedCarIndex', resolveStart);
assert(resolveStart >= 0 && resolveEnd > resolveStart, 'Could not isolate production collision resolver');
const helpers = [
  take('cornerTractionState', '\nfunction racerCollisionMass('),
  take('racerCollisionMass', '\nfunction resolveRacerCollision('),
  html.slice(resolveStart, resolveEnd),
  take('sweptPlanarContact', '\nfunction cornerTractionState('),
  take('resolveRoadEdgeContact', '\nfunction sweptLongitudinalContact(')
].join('\n');
const context = { Math, clamp: (value, min, max) => Math.max(min, Math.min(max, value)) };
vm.runInNewContext(`${helpers}\nthis.cornerTractionState=cornerTractionState;this.racerCollisionMass=racerCollisionMass;this.resolveRacerCollision=resolveRacerCollision;this.sweptPlanarContact=sweptPlanarContact;this.resolveRoadEdgeContact=resolveRoadEdgeContact;`, context);

const simulatedSeconds = 3600;
const hz = 120;
const totalSteps = simulatedSeconds * hz;
const dt = 1 / hz;
const beforeMemory = process.memoryUsage();
const cpuStart = process.cpuUsage();
const wallStart = performance.now();
let speed = 0, yaw = 0, yawRate = 0, lane = 0, driftGauge = .3, edgeCooldown = 0;
let maxSpeed = 0, minSpeed = Infinity, actualEdgeContacts = 0, driftTicks = 0, collisionChecks = 0, planarSweepHits = 0, edgeContactChecks = 0, proximityChecks = 0;
const roadLimit = 8.5;
const style = { width: 4.5, length: 5.0 };
const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value));

for (let step = 0; step < totalSteps; step++) {
  const t = step * dt;
  // A smooth synthetic S-curve route with a heading controller, rather than a
  // free-running yaw oscillator that would unrealistically pin the car to a rail.
  const roadYaw = .36 * Math.sin(t * .013) + .12 * Math.sin(t * .037);
  const roadYawRate = .36 * .013 * Math.cos(t * .013) + .12 * .037 * Math.cos(t * .037);
  const cornerPhase = Math.sin(t * .017);
  const cornerSkill = cornerPhase > .72 ? .72 : (.86 + .14 * (.5 + .5 * cornerPhase));
  const traction = context.cornerTractionState(speed, cornerSkill, 1, false);
  const throttle = Math.sin(t * .11) > -.62;
  speed += (throttle ? 33.5 * traction.longitudinalGrip : -2.1) * dt;

  const driftSegment = (step % (hz * 60)) < (hz * 20); // 20s of controlled drift input per virtual minute
  const authority = .075 + speed * .0038;
  const headingError = wrapAngle(yaw - roadYaw);
  const steeringBias = (driftSegment ? .16 : .035) * Math.sin(t * .19);
  const steer = context.clamp((headingError * 2.2 - roadYawRate) / Math.max(.1, authority) + steeringBias, -1, 1);
  const drifting = driftSegment && speed > 18; // The scripted test driver deliberately holds the drift input during this scheduled window.
  if (drifting) {
    driftTicks++;
    driftGauge = Math.min(1, driftGauge + .173 * (.90 + .10 * Math.min(1, Math.max(.25, (speed - 14) / 42))) * dt);
    speed = Math.max(0, speed - .43 * dt);
  }
  const targetYawRate = -steer * authority * (drifting ? 1.50 : 1);
  const yawResponse = 1 - Math.exp(-dt / (drifting ? .31 : .24));
  yawRate += (targetYawRate - yawRate) * yawResponse;
  yaw = wrapAngle(yaw + yawRate * dt);
  const driftSlip = drifting ? -steer * .22 : 0;
  const travelError = wrapAngle(yaw + driftSlip - roadYaw);
  const lateralSpeed = -speed * Math.sin(travelError);
  const requestedLane = lane + lateralSpeed * dt;
  edgeCooldown = Math.max(0, edgeCooldown - dt);
  const edge = context.resolveRoadEdgeContact(lane, requestedLane, lateralSpeed, roadLimit, edgeCooldown);
  lane = edge.laneOffset;
  edgeCooldown = edge.cooldown;
  if (edge.hit) {
    speed = Math.max(0, speed - edge.speedLoss);
    actualEdgeContacts++;
  }
  speed = Math.max(0, Math.min(106, speed));

  maxSpeed = Math.max(maxSpeed, speed);
  minSpeed = Math.min(minSpeed, speed);
  if ((step % 12000) === 0) {
    assert(Number.isFinite(speed) && Number.isFinite(yaw) && Number.isFinite(yawRate) && Number.isFinite(lane) && Number.isFinite(driftGauge), `Non-finite state at virtual t=${t.toFixed(1)}s`);
    assert(speed >= 0 && speed <= 106 + 1e-8, `Speed escaped bounds at virtual t=${t.toFixed(1)}s`);
    assert(Math.abs(lane) <= roadLimit + 1e-8, `Road boundary escaped at virtual t=${t.toFixed(1)}s`);
  }
  // Production swept contact test is exercised every virtual second.
  if ((step % hz) === 0) {
    const previousLong = -12, currentLong = 12, previousLateral = 9, currentLateral = -9;
    if (context.sweptPlanarContact(previousLong, currentLong, previousLateral, currentLateral, 3, 3)) planarSweepHits++;

    const a = { id: 'player', style, speed: 36 + 6 * Math.sin(t * .31), distance: 0, previousDistance: -1, laneOffset: -.1, targetLane: -.1 };
    const b = { id: 'rival', style, speed: 12 + 4 * Math.cos(t * .27), distance: 3, previousDistance: 4, laneOffset: .1, targetLane: .1 };
    const m = context.racerCollisionMass(style);
    const before = m * a.speed + m * b.speed;
    context.resolveRacerCollision(a, b, 3, .2, 6, 5, 9, 9);
    const after = m * a.speed + m * b.speed;
    assert(Math.abs(before - after) < 1e-7, `Momentum drifted at collision check ${collisionChecks}`);
    assert(a.speed >= 0 && b.speed >= 0 && Number.isFinite(a.speed) && Number.isFinite(b.speed), `Collision produced invalid speed at check ${collisionChecks}`);
    collisionChecks++;

    // Explicitly exercise the proximity-vs-contact distinction each minute.
    if (collisionChecks % 60 === 0) {
      const near = context.resolveRoadEdgeContact(8.05, 8.25, .2, roadLimit, 0);
      assert(!near.hit && near.speedLoss === 0, 'Guardrail proximity unexpectedly slowed the vehicle');
      proximityChecks++;
      const hit = context.resolveRoadEdgeContact(8.45, 8.7, 3, roadLimit, 0);
      assert(hit.hit && hit.speedLoss > 1.2 && hit.laneOffset === roadLimit, 'Actual road edge contact response failed');
      const cooldown = context.resolveRoadEdgeContact(roadLimit, 8.7, 3, roadLimit, hit.cooldown - .1);
      assert(!cooldown.hit && cooldown.speedLoss === 0, 'Repeated guardrail collision was not damped by cooldown');
      edgeContactChecks++;
    }
  }
}

const wallMs = performance.now() - wallStart;
const cpu = process.cpuUsage(cpuStart);
const afterMemory = process.memoryUsage();
assert(collisionChecks === simulatedSeconds, `Expected ${simulatedSeconds} collision stress checks, got ${collisionChecks}`);
assert(proximityChecks === 60 && edgeContactChecks === 60, 'Guardrail proximity/contact scenarios were not fully exercised');
assert(driftTicks > totalSteps * .08, `Drift branch was not exercised enough during the virtual soak (${driftTicks}/${totalSteps})`);
assert(maxSpeed > 277 / 3.6, `Vehicle did not exceed the former 277 km/h corner threshold (${(maxSpeed * 3.6).toFixed(1)} km/h)`);
console.log(JSON.stringify({
  status: 'PASS',
  testType: 'Virtual one-hour 120Hz physics helper soak; NOT a live browser/Three.js session',
  virtualDrivingSeconds: simulatedSeconds,
  fixedTimestepHz: hz,
  physicsTicks: totalSteps,
  collisionImpulseChecks: collisionChecks,
  sweptPlanarChecks: collisionChecks,
  sweptPlanarHits: planarSweepHits,
  driftTicks,
  driftSharePct: +(driftTicks / totalSteps * 100).toFixed(2),
  actualRoadEdgeContacts: actualEdgeContacts,
  guardrailProximityChecks: proximityChecks,
  guardrailContactAndCooldownChecks: edgeContactChecks,
  speedRangeMs: { min: +minSpeed.toFixed(4), max: +maxSpeed.toFixed(4) },
  peakSpeedKmh: +(maxSpeed * 3.6).toFixed(2),
  finalDriftGauge: +driftGauge.toFixed(4),
  wallClockSeconds: +(wallMs / 1000).toFixed(3),
  cpuSeconds: +((cpu.user + cpu.system) / 1e6).toFixed(3),
  heapUsedBeforeMB: +(beforeMemory.heapUsed / 1048576).toFixed(2),
  heapUsedAfterMB: +(afterMemory.heapUsed / 1048576).toFixed(2),
  caveat: 'Exercises production traction, two-axis swept collision, collision impulse and road-edge response helpers inside a deterministic synthetic S-curve driver. It does not load the full scene, Three.js renderer, browser UI, full AI traffic solver, assets, GPU or persistent browser storage.'
}, null, 2));
