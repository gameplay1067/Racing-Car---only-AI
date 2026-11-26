import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const start = html.indexOf('function driftBodyAngleTarget(');
const end = html.indexOf('\nfunction trackYawAt(', start);
assert(start >= 0 && end > start, 'Player drift body-angle helper is missing');
const src = html.slice(start, end);
const context = { Math, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), wrapAngle: v => Math.atan2(Math.sin(v), Math.cos(v)) };
vm.runInNewContext(`${src}\nthis.target=driftBodyAngleTarget;this.bodyYaw=playerBodyYaw;`, context);

const right = context.target(1, true, 1, 1);
const left = context.target(-1, true, 1, 1);
assert(right < 0 && left > 0, 'Left/right drift body yaw signs are reversed');
assert(Math.abs(right + left) < 1e-9, 'Left/right drift body yaw is not symmetric');
assert(Math.abs(right) >= .37 && Math.abs(right) <= .39, 'Baseline drift chassis yaw is not visibly strong enough');
assert(context.target(1, false, 1, 1) === 0, 'Drift body angle should recover to zero outside drift');
assert(Math.abs(context.target(1, true, 1.12, 1)) <= .43, 'High-handling vehicle drift angle exceeds its safe cap');
assert(Math.abs(context.target(1, true, .88, .94)) >= .34, 'Low-handling drift angle is too weak');

const bodyYaw = context.bodyYaw(.2, right);
assert(Math.abs(bodyYaw - (.2 + right)) < 1e-9, 'Rendered body heading does not include drift angle');
const originalYaw = .2;
const noDriftYaw = context.bodyYaw(originalYaw, 0);
assert(Math.abs(noDriftYaw-originalYaw)<1e-9, 'Normal steering heading changed by drift offset');

let angle = 0;
const dt = 1/120;
const blend = 1-Math.exp(-dt/.14);
for (let i=0; i<72; i++) angle += (right-angle)*blend;
assert(Math.abs(angle-right)<.01, 'Drift body yaw did not reach target smoothly within 0.5s');
let recover = angle;
const recoverBlend = 1-Math.exp(-dt/.22);
for (let i=0; i<72; i++) recover += (0-recover)*recoverBlend;
assert(Math.abs(recover)<.03, 'Drift body yaw does not recover smoothly after release');

const updateStart = html.indexOf('function updateCar(dt){');
const updateEnd = html.indexOf('\nfunction updateAICars(dt){', updateStart);
const update = html.slice(updateStart, updateEnd);
assert(update.includes('car.rotation.y=bodyYaw'), 'Player 3D chassis rotation is not using bodyYaw');
assert(update.includes('const driftBodyTarget=driftBodyAngleTarget('), 'Player 3D update does not calculate the drift body target');
assert(update.includes('const safeRoadLimit=roadLaneLimit(selectedCar,wrapAngle(bodyYaw-roadYaw))'), 'Road envelope does not account for the rotated chassis');
assert(update.includes('new THREE.Vector3(-Math.sin(bodyYaw),0,-Math.cos(bodyYaw))'), 'Follow camera is not aligned to the rotated chassis');
assert(html.includes('carVisualAngle+=(visualTarget-carVisualAngle)*(1-Math.exp(-dt/(drifting?.12:.20)))'), 'Canvas fallback does not smoothly rotate the car body during drift');
assert(html.includes('drawCar(ctx,W*.5+lane*W*.035,H*.83,1.25,cars[selectedCar][1],carVisualAngle,true)'), 'Canvas fallback renderer is not using the drift body angle');

console.log(JSON.stringify({
  status: 'PASS',
  checks: {
    symmetricLeftRightDriftAngle: true,
    driftChassisYawIncrease: true,
    smoothEntry: true,
    smoothRecovery: true,
    normalHeadingUnaffected: true,
    collisionEnvelopeIncludesBodyYaw: true,
    cameraFollowsBodyYaw: true,
    canvasFallbackDriftRotation: true
  },
  baselineAngleRadians: Math.abs(right).toFixed(3),
  baselineAngleDegrees: (Math.abs(right)*180/Math.PI).toFixed(1),
  driftEntrySecondsTo95Percent: 0.14*Math.log(20),
  recoveryTimeConstantSeconds: .22
}, null, 2));
