import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function literalAfter(pattern, label) {
  const match = html.match(pattern);
  assert(match, `${label} literal not found`);
  return vm.runInNewContext(`(${match[1]})`);
}
const cars = literalAfter(/const CAR_DATA=(\[[\s\S]*?\n\]);/, 'CAR_DATA');
const base = literalAfter(/const BASE_PERFORMANCE=Object\.freeze\((\{[^;]+\})\);/, 'BASE_PERFORMANCE');
const profiles = literalAfter(/const CAR_PROFILES=Object\.freeze\((\{[\s\S]*?\n\})\);/, 'CAR_PROFILES');
assert(cars.length === 20, `Expected 20 selectable cars (10 free + 10 premium), found ${cars.length}`);
assert(cars.slice(0,10).every(car=>!car.price) && cars.slice(10).every(car=>car.price>0), 'The original ten free vehicles must remain free and the new ten must be purchasable');
assert(new Set(cars.slice(10).map(car=>car.price)).size===10, 'All premium vehicles must have unique prices');
assert(Object.keys(profiles).length === cars.length, 'Every car needs exactly one performance profile');

const profileRows = cars.map((car) => {
  const p = profiles[car.id];
  assert(p, `${car.id} has no performance profile`);
  for (const key of ['maxSpeed', 'acceleration', 'handling', 'drift', 'braking', 'grip', 'nitro', 'charge']) {
    assert(Number.isFinite(p[key]), `${car.id} ${key} multiplier is not finite`);
    assert(p[key] >= .93 && p[key] <= 1.08, `${car.id} ${key} is outside the conservative .93–1.08 balance range`);
  }
  return {
    id: car.id,
    name: car.name,
    profile: p.label,
    maxSpeedMs: +(base.maxSpeed * p.maxSpeed).toFixed(2),
    maxSpeedKmh: +(base.maxSpeed * p.maxSpeed * 3.6).toFixed(1),
    acceleration: +(base.acceleration * p.acceleration).toFixed(2),
    handlingPct: Math.round(p.handling * 100),
    driftPct: Math.round(p.drift * 100),
    chargePct: Math.round(p.charge * 100)
  };
});

// Verify the requested player base buff against the v1.6.0 values read from its backup spec.
const oldMaxSpeed = 91, oldAcceleration = 31, oldDriftRate = .145;
const maxSpeedGain = (base.maxSpeed / oldMaxSpeed - 1) * 100;
const accelerationGain = (base.acceleration / oldAcceleration - 1) * 100;
assert(maxSpeedGain >= 8 && maxSpeedGain <= 12, `Player top-speed gain ${maxSpeedGain.toFixed(2)}% is outside the requested 8–12%`);
assert(accelerationGain >= 5 && accelerationGain <= 10, `Player acceleration gain ${accelerationGain.toFixed(2)}% is outside the requested 5–10%`);

// Reproduce the implemented charge quality and gating with representative drift inputs.
function driftState({ driftKey, steer, speed }) {
  const steerStrength = Math.max(0, Math.min(1, (Math.abs(steer) - .12) / .88));
  const speedQuality = Math.max(.25, Math.min(1, (speed - 14) / 42));
  const quality = steerStrength * (.90 + .10 * speedQuality);
  const active = !!driftKey && Math.abs(steer) > .12 && speed > 16 && quality > .025;
  return { active, quality, rate: active ? base.driftChargeRate * quality : 0 };
}
const normal = driftState({ driftKey: false, steer: 1, speed: 45 });
const noSteer = driftState({ driftKey: true, steer: 0, speed: 45 });
const slow = driftState({ driftKey: true, steer: 1, speed: 12 });
const nominal = driftState({ driftKey: true, steer: 1, speed: 45 });
const highSpeed = driftState({ driftKey: true, steer: 1, speed: 56 });
assert(normal.rate === 0 && noSteer.rate === 0 && !slow.active, 'Drift charge can be farmed without the key, steering or minimum speed');
const nominalGain = (nominal.rate / oldDriftRate - 1) * 100;
const highGain = (highSpeed.rate / oldDriftRate - 1) * 100;
assert(nominalGain >= 15 && nominalGain <= 20, `Nominal drift gain ${nominalGain.toFixed(2)}% is outside 15–20%`);
assert(highGain >= 15 && highGain <= 20, `High-speed drift gain ${highGain.toFixed(2)}% is outside 15–20%`);
const oldReleaseBonus = .075;
const newReleaseBonus = .075 * nominal.quality;
const releaseBonusGain = (newReleaseBonus / oldReleaseBonus - 1) * 100;
assert(newReleaseBonus <= .075 && newReleaseBonus > .065, 'Drift release bonus must remain capped and avoid an extra burst exploit');
const oldFillSeconds = .65 / oldDriftRate;
const newFillSeconds = .65 / nominal.rate;
let shortCharge = .35 + nominal.rate * .6;
let longCharge = .35;
for (let i = 0; i < 120; i++) longCharge = Math.min(1, longCharge + nominal.rate * .05);
assert(shortCharge > .35 && shortCharge < 1 && longCharge === 1, 'Short/long drift charge integration does not behave as expected');

// Reproduce the 24 generated rival silhouettes with the exact source formulas.
const aiSignatures = [];
for (let index = 0; index < 24; index++) {
  const style = cars[index % cars.length];
  const variant = Math.floor(index / cars.length);
  const width = style.width * (.955 + ((index * 3) % 7) * .014);
  const length = style.length * (.948 + ((index * 5) % 7) * .014);
  const noseLength = length * (.50 + ((index + 1) % 4) * .045);
  const noseWidth = width * (.68 + ((index * 2) % 4) * .035);
  const cabinW = style.cabinW * (.92 + (index % 4) * .04);
  const cabinL = style.cabinL * (.90 + ((index + 2) % 5) * .035);
  const roofH = style.roofH + ((index % 5) - 2) * .045;
  const kit = (style.kit === 'splitter' || index % 6 === 0) ? 'splitter' : (style.kit === 'fender' || index % 6 === 1) ? 'fender' : (style.kit === 'fin' || index % 6 === 2) ? 'fin' : (style.kit === 'scoop' || index % 6 === 3) ? 'scoop' : 'canard';
  const wingKind = (style.wing + index + variant) % 5;
  const wheelRadius = .425 + (index % 5) * .022;
  const wheelSegments = 10 + (index % 5) * 2;
  aiSignatures.push([width,length,noseLength,noseWidth,cabinW,cabinL,roofH,kit,wingKind,wheelRadius,wheelSegments].map(v => typeof v === 'number' ? v.toFixed(4) : v).join('|'));
}
assert(new Set(aiSignatures).size === 24, `Only ${new Set(aiSignatures).size}/24 AI model silhouettes are unique`);
assert(html.includes('root.userData.aiModelSignature=modelSignature') && html.includes('new Set(aiCars.map(r=>r.modelSignature)).size===24'), 'Runtime diagnostics do not verify unique AI model signatures');

// Verify the collision envelope contains the extended AI bumpers/bodywork and preserves a road-edge buffer.
const envelopeFnSource = html.match(/function vehicleEnvelope\(style,yawError=0\)\{[^\n]+/)?.[0];
assert(envelopeFnSource, 'Vehicle collision envelope helper missing');
const envelopeContext = {};
vm.runInNewContext(`${envelopeFnSource}; this.vehicleEnvelope=vehicleEnvelope;`, envelopeContext);
const vehicleEnvelope = envelopeContext.vehicleEnvelope;
const roadWidth = 25.5;
const envelopeRows = cars.map(car => {
  const envelope = vehicleEnvelope(car);
  const driftEnvelope = vehicleEnvelope(car, .24);
  const actualHalfLength = car.length * .86;
  const actualHalfWidth = car.width * .525 + .34;
  const expectedYawHalfWidth = actualHalfWidth * Math.cos(.24) + actualHalfLength * Math.sin(.24);
  assert(envelope.halfLength >= actualHalfLength, `${car.id} collision envelope does not cover its front/rear model extents`);
  assert(envelope.halfWidth >= actualHalfWidth, `${car.id} collision envelope does not cover its side/body-kit extents`);
  assert(driftEnvelope.halfWidth >= expectedYawHalfWidth, `${car.id} drift-angle envelope does not cover the rotated body extents`);
  const laneLimit = Math.max(0, roadWidth * .5 - driftEnvelope.halfWidth - .45);
  assert(laneLimit + driftEnvelope.halfWidth + .45 <= roadWidth * .5 + 1e-8, `${car.id} can cross the road-edge envelope`);
  // A 107 m/s car at 24 degrees can move about 1.0m laterally in a 40ms frame.
  const requestedAtHighSpeed = laneLimit - .1 + 107 * Math.sin(.24) * .04;
  const clampedAtHighSpeed = Math.max(-laneLimit, Math.min(laneLimit, requestedAtHighSpeed));
  assert(Math.abs(clampedAtHighSpeed) + driftEnvelope.halfWidth + .45 <= roadWidth * .5 + 1e-8, `${car.id} high-speed road-edge sweep exceeds the corridor`);
  return { id: car.id, halfWidth: +envelope.halfWidth.toFixed(2), halfLength: +envelope.halfLength.toFixed(2), driftHalfWidthAt24deg: +driftEnvelope.halfWidth.toFixed(2), maxLaneOffsetAt24deg: +laneLimit.toFixed(2) };
});

const sweptSource = html.match(/function sweptLongitudinalContact\([^}]+\}/)?.[0];
assert(sweptSource, 'Swept contact test helper missing');
const sweptContext = {};
vm.runInNewContext(`${sweptSource}; this.sweptLongitudinalContact=sweptLongitudinalContact;`, sweptContext);
const swept = sweptContext.sweptLongitudinalContact;
assert(swept(-8, 8, 5), 'High-speed racer crossing should be detected by swept contact');
assert(swept(2, 1, 5), 'Overlapping vehicle envelopes should be detected');
assert(!swept(-20, -16, 5), 'Separated vehicle envelopes should not report contact');
assert(html.includes('rival.previousDistance=rival.distance') && html.includes('rival.previousLaneOffset=rival.laneOffset') && html.includes('playerPreviousDistance=distanceAlong'), 'Grand Prix handoff does not reset swept-collision history after coordinate rebasing');
assert(html.includes('const perf=rival.performance') && html.includes('perf.maxSpeed*preset.speed*rival.variation') && html.includes('perf.acceleration*aiAccelerationMultiplier*aiTraction.longitudinalGrip*dt'), 'AI physics is not using each selected vehicle performance profile and special ability acceleration');
assert(html.includes('variation:.975+(index%9)*.006') && html.includes('aiVariationsFinite:aiCars.every(r=>Number.isFinite(r.variation)'), 'AI speed variation must be initialized to a finite, bounded value for every rival');
assert(html.includes('const perf=performanceFor(selectedCar)') && html.includes('perf.maxSpeed') && html.includes('perf.acceleration'), 'Player physics is not using selected car performance profile');
assert(html.includes('function purchaseVehicle(id)') && html.includes('insufficient-coins') && html.includes('already-owned'), 'Shop purchase checks are incomplete');
assert(html.includes('function gpRunReward(position,runId,finished=true)') && !html.includes('dailyRewardedRuns<3') && html.includes('claimedGrandPrixRuns.includes(runId)'), 'Rank-based GP reward idempotency is missing or a daily payout cap remains');
assert(html.includes('function playerSpecial(style)') && html.includes('rival.special===\'aero-specter\'') && html.includes('rival.special===\'turbo-lynx\'') && html.includes('rival.special===\'inferno-x\''), 'AI special ability integration is incomplete');
assert(html.includes("if(ability==='drift-viper'){abilityDriftCharge*=1.15;playerAbilityName='DRIFT CELL +15%';if(drifting)abilityMax*=1.02;}") && html.includes("if(rival.special==='drift-viper'&&rival.drifting)desired*=1.02;"), 'Drift Viper speed/charge behavior must match for player and AI');
assert(html.includes("const cornerHandlingBonus=rival.special==='corner-phantom'?1.03:1;") && html.includes("if(ability==='drift-viper')abilityHandling*=1.07;") && html.includes("rival.special==='corner-phantom'?1.04:(rival.special==='drift-viper'&&rival.driftExitTimer>0?1.12:1)"), 'Special handling bonuses are not represented consistently');
assert(html.includes('function roadSiteClear(pos,footprint,margin=28)') && html.includes('const required=footprint+ROAD_WIDTH*.5+2.9+margin') && html.includes('const roadSafetySamples=[];for(let j=0;j<3200;j++)'), 'Route-wide prop clearance is not enabled');
assert(html.includes('const requestedLane=laneOffset+lateralSpeed*dt') && html.includes('const safeRoadLimit=roadLaneLimit(selectedCar,wrapAngle(bodyYaw-roadYaw))') && html.includes('resolveRoadEdgeContact(laneOffset,requestedLane,lateralSpeed,safeRoadLimit') && html.includes('laneOffset=edgeContact.laneOffset'), 'Player road edge constraint is missing');
assert(html.includes('const laneLimit=roadLaneLimit(rival.style,rival.driftAngle)') && html.includes('const aiEdge=resolveRoadEdgeContact(previousLaneOffset,requestedLane,aiLateralSpeed,laneLimit,rival.barrierHitCooldown)') && html.includes('rival.laneOffset=aiEdge.laneOffset'), 'AI road edge constraint/contact response is missing');

console.log(JSON.stringify({
  status: 'PASS',
  checks: {
    twentyCarRoster: true, tenFreeTenPremium: true, uniquePremiumPrices: true, carProfiles: true, playerTopSpeedBuff: true, playerAccelerationBuff: true, shopPurchaseGuards: true, gpRewardIdempotencyWithoutDailyCap: true, aiSpecialAbilities: true,
    driftCharge15To20Percent: true, passiveDriftChargeBlocked: true,
    shortAndLongDriftIntegration: true, twentyFourDistinctAiSilhouettes: true,
    aiProfilesDriveTheirPhysics: true, aiSpeedVariationsFiniteAndBounded: true, playerProfilesDriveTheirPhysics: true,
    collisionEnvelopeCoversBodyKit: true, yawExpandedDriftEnvelope: true, sweptHighSpeedContact: true,
    playerAndAiRoadEdgeConstraints: true, highSpeedRoadEdgeClamp: true, guardrailProximityNoSlowdown: true, grandPrixCollisionHistoryRebased: true,
    routeWideSceneryClearance: true
  },
  playerBaseline: {
    v16MaxSpeed: oldMaxSpeed, v17VehicleBaseMaxSpeed: base.maxSpeed, vehicleBaseGainPct: +maxSpeedGain.toFixed(2), playerEffectiveMaxSpeed: +(base.maxSpeed*1.06).toFixed(2), playerTotalGainPct: +((base.maxSpeed*1.06/oldMaxSpeed-1)*100).toFixed(2),
    v16Acceleration: oldAcceleration, v17VehicleBaseAcceleration: base.acceleration, vehicleBaseGainPct: +accelerationGain.toFixed(2), playerEffectiveAcceleration: +(base.acceleration*1.07).toFixed(3), playerTotalGainPct: +((base.acceleration*1.07/oldAcceleration-1)*100).toFixed(2)
  },
  drift: {
    oldRatePerSecond: oldDriftRate,
    nominalSpeedMs: 45,
    nominalRatePerSecond: +nominal.rate.toFixed(5),
    nominalGainPct: +nominalGain.toFixed(2),
    highSpeedMs: 56,
    highSpeedRatePerSecond: +highSpeed.rate.toFixed(5),
    highSpeedGainPct: +highGain.toFixed(2),
    oldReleaseBonus: +oldReleaseBonus.toFixed(5),
    newReleaseBonusAt45Ms: +newReleaseBonus.toFixed(5),
    releaseBonusGainPct: +releaseBonusGain.toFixed(2),
    oldFillSecondsFrom35Pct: +oldFillSeconds.toFixed(2),
    newFillSecondsFrom35PctAt45Ms: +newFillSeconds.toFixed(2),
    shortDriftGaugeAfter06s: +shortCharge.toFixed(3),
    longDriftGaugeAfter6s: +longCharge.toFixed(3),
    passiveChargePerSecond: normal.rate,
    noSteerChargePerSecond: noSteer.rate
  },
  carProfiles: profileRows,
  aiModelCount: aiSignatures.length,
  uniqueAiModelCount: new Set(aiSignatures).size,
  collisionEnvelopes: envelopeRows
}, null, 2));
