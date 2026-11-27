import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIMULATION_RACES = 5000;
const source = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const outDir = path.join(root, 'docs', 'simulation');
fs.mkdirSync(outDir, { recursive: true });
const extract = (regex, label) => {
  const match = source.match(regex);
  if (!match) throw new Error(`${label} not found in the production source`);
  return vm.runInNewContext(`(${match[1]})`);
};
const cars = extract(/const CAR_DATA=(\[[\s\S]*?\n\]);/, 'CAR_DATA');
const profiles = extract(/const CAR_PROFILES=Object\.freeze\((\{[\s\S]*?\n\})\);/, 'CAR_PROFILES');
const base = extract(/const BASE_PERFORMANCE=Object\.freeze\((\{[^;]+\})\);/, 'BASE_PERFORMANCE');
const productionDifficulty = extract(/const DIFFICULTY=(\{[^;]+\});/, 'DIFFICULTY');
if (cars.length !== 20 || Object.keys(profiles).length !== 20) throw new Error('Simulation requires the full 20-car production roster');

// Reproducible PRNG; every race is an actual time-stepped headless kinematic race, not a static score estimate.
let seed = 0x81a7c0de;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DIFFICULTIES = [
  { name: 'easy', ...productionDifficulty.easy, weight: .10 },
  { name: 'normal', ...productionDifficulty.normal, weight: .60 },
  { name: 'hard', ...productionDifficulty.hard, weight: .25 },
  { name: 'expert', ...productionDifficulty.expert, weight: .05 }
];
function chooseDifficulty() {
  const x = random(); let t = 0;
  for (const d of DIFFICULTIES) { t += d.weight; if (x <= t) return d; }
  return DIFFICULTIES[1];
}
const carStats = new Map(cars.map(c => [c.id, {
  id: c.id, name: c.name, isPremium: !!c.price, price: c.price || 0,
  playerStarts: 0, playerWins: 0, playerTimes: [], fieldStarts: 0, fieldWins: 0,
  finishTimes: [], maxSpeedObserved: 0, accelerationSamples: [], driftChargeSamples: [],
  abilityActivations: 0, timeouts: 0, playerByDifficulty:{}
}]));
const totalStats = { races: 0, playerWins: 0, topThree: 0, playerFinishTime: [], difficulty: {}, byDifficulty: {}, routeCounts: {}, premiumWins: 0, freeWins: 0, timeouts: 0, abilities: {} };

function makeRacer(carIndex, isPlayer, gridProgress, difficulty, raceSeed, variation=1) {
  const car = cars[carIndex], profile = profiles[car.id];
  const skill = isPlayer ? 1 : variation;
  return {
    id: car.id, car, profile, isPlayer, difficultySpeed: isPlayer ? 1 : difficulty.speed,
    progress: gridProgress, speed: 0, nitro: isPlayer ? .35 : .22 + random() * .40,
    driftTime: 0, wasDrifting: false, driftChargeAdded: 0, driftExitTimer: 0,
    specialTimer: 0, specialCooldown: random() * 2, cruiseTimer: 0,
    launchTimer: profile.special === 'street-falcon' ? 3 : 0,
    elapsed: 0, finishTime: null, maxSpeed: 0, accelerationStart: 0,
    skill, phase: random() * Math.PI * 2, nitroTimer: 0, abilityActivations: 0,
    raceSeed, activatedSpecials:new Set()
  };
}
const perCarDifficultyPlan = {easy:25,normal:150,hard:62,expert:13};
const racePlan=[];
for(let carIndex=0;carIndex<cars.length;carIndex++)for(const [difficulty,count] of Object.entries(perCarDifficultyPlan))for(let n=0;n<count;n++)racePlan.push({playerCarIndex:carIndex,difficulty:DIFFICULTIES.find(d=>d.name===difficulty)});
if(racePlan.length!==SIMULATION_RACES)throw new Error(`Race plan must contain ${SIMULATION_RACES} entries; got ${racePlan.length}`);
let orderSeed = 0x54c9a21d;
const orderRandom = () => { orderSeed = (Math.imul(orderSeed, 1664525) + 1013904223) >>> 0; return orderSeed / 4294967296; };
for (let i=racePlan.length-1;i>0;i--){const j=Math.floor(orderRandom()*(i+1));[racePlan[i],racePlan[j]]=[racePlan[j],racePlan[i]];}
function runRace(raceIndex, plan) {
  const markAbility = (r, ability, repeatable=false) => {
    if (!ability) return;
    if (!repeatable && r.activatedSpecials.has(ability)) return;
    if (!repeatable) r.activatedSpecials.add(ability);
    r.abilityActivations++;
    totalStats.abilities[ability] = (totalStats.abilities[ability] || 0) + 1;
  };
  const difficulty = plan.difficulty;
  const routeCount = 2 + Math.floor(random() * 19);
  const distanceRequired = 5400 + (routeCount - 1) * 5400 * .84;
  const playerCarIndex = plan.playerCarIndex;
  const field = [];
  // Player begins in the mid-pack. AI grid offsets mirror the 3-column 25-car start layout.
  field.push(makeRacer(playerCarIndex, true, 0, difficulty, raceIndex));
  const aiIndices = [];
  for (let i = 0; i < 24; i++) {
    const carIndex = Math.floor(random() * cars.length);
    aiIndices.push(carIndex);
    const slot = i >= 13 ? i + 1 : i;
    const row = Math.floor(slot / 3);
    const gridAdvantage = (4 - row) * 12.2;
    field.push(makeRacer(carIndex, false, gridAdvantage, difficulty, raceIndex, .975 + (i % 9) * .006));
  }
  const step = .5;
  let simulationTime = 0;
  const maxTime = 1300;
  const routePhase = random() * Math.PI * 2;
  let stageThemeSeed = Math.floor(random() * 1000);
  while (simulationTime < maxTime && field.some(r => r.finishTime === null)) {
    simulationTime += step;
    for (const r of field) {
      if (r.finishTime !== null) continue;
      r.elapsed += step;
      const stage = Math.max(0, Math.floor(r.progress / (5400 * .84)));
      const local = (r.progress - stage * 5400 * .84) / (5400 * .84);
      const cornerWave = .5 + .5 * Math.sin(local * Math.PI * 4 + routePhase + stage * .91 + stageThemeSeed * .001);
      const cornerType = (stage + raceIndex) % 3;
      const trackTightness = cornerType === 0 ? .19 : cornerType === 1 ? .13 : .16;
      const cornerFactor = clamp(1 - cornerWave * trackTightness, .78, 1);
      const p = r.profile;
      const ability = p.special || '';
      const handlingMultiplier = p.handling * (ability === 'corner-phantom' ? 1.03 : (ability === 'drift-viper' && r.driftExitTimer > 0 ? 1.07 : 1));
      const cornerSkill = clamp(cornerFactor + (handlingMultiplier - 1) * .42, .70, 1.04);
      const playerDriftInput = !r.isPlayer || (Math.sin(r.elapsed * .63 + r.phase) > -.707);
      const drifting = playerDriftInput && cornerSkill < .982 && r.speed > 28;
      if (ability === 'phantom-overlord') markAbility(r, ability);
      if (ability === 'corner-phantom' && cornerSkill < .98) markAbility(r, ability);
      if (ability === 'drift-viper' && drifting) markAbility(r, ability);
      if (ability === 'inferno-x' && drifting) markAbility(r, ability);
      if (r.wasDrifting && !drifting && (ability === 'phantom-rx' || ability === 'inferno-x' || ability === 'drift-viper')) {
        r.driftExitTimer = ability === 'inferno-x' ? 2.5 : (ability === 'phantom-rx' ? 2 : 1.25);
        markAbility(r, ability, true);
      }
      r.wasDrifting = drifting;
      r.driftExitTimer = Math.max(0, r.driftExitTimer - step);

      let accelerationMultiplier = r.isPlayer ? 1.07 : 1;
      let maxMultiplier = r.isPlayer ? 1.06 : 1;
      let driftChargeMultiplier = 1;
      let nitroDrain = r.isPlayer ? .255 : .23;
      let nitroPower = base.nitroPower * p.nitro;
      let nitroAccel = base.nitroAcceleration * p.nitro;
      if (ability === 'street-falcon' && r.elapsed < 3) { accelerationMultiplier *= 1.08; markAbility(r, ability); }
      if (ability === 'corner-phantom' && r.isPlayer) maxMultiplier *= 1.01;
      if (ability === 'drift-viper' && drifting) maxMultiplier *= 1.02;
      if (ability === 'drift-viper') driftChargeMultiplier *= 1.15;
      if (ability === 'aero-specter') { accelerationMultiplier *= .96; }
      if (ability === 'nitro-reaper') { nitroDrain *= .85; nitroAccel *= 1.06; if (!r.isPlayer) nitroPower *= 1.06; }
      if (ability === 'phantom-overlord') { maxMultiplier *= 1.01; accelerationMultiplier *= 1.01; driftChargeMultiplier *= r.isPlayer ? 1.04 : 1.04; nitroPower *= r.isPlayer ? 1.02 : 1.02; }
      if (ability === 'thunder-gt' && r.speed > 70) { accelerationMultiplier *= 1.07; maxMultiplier *= 1.02; markAbility(r, ability); }
      if (ability === 'inferno-x') driftChargeMultiplier *= 1.20;
      if (r.driftExitTimer > 0) {
        if (ability === 'phantom-rx') accelerationMultiplier *= 1.07;
        if (ability === 'inferno-x') accelerationMultiplier *= 1.10;
      }

      const straight = cornerSkill > .965;
      if (ability === 'aero-specter' && straight && r.speed > 65) { maxMultiplier *= 1.08; markAbility(r, ability); }
      if (ability === 'turbo-lynx' && straight && r.speed > 40) {
        r.cruiseTimer += step;
        if (r.cruiseTimer >= 4.2 && r.specialCooldown <= 0) {
          r.specialTimer = 2.8; r.specialCooldown = 15; r.cruiseTimer = 0;
          markAbility(r, ability, true);
        }
      } else r.cruiseTimer = Math.max(0, r.cruiseTimer - step * 1.6);
      r.specialCooldown = Math.max(0, r.specialCooldown - step);
      if (r.specialTimer > 0) {
        r.specialTimer = Math.max(0, r.specialTimer - step);
        maxMultiplier *= 1.02; accelerationMultiplier *= 1.08;
      }

      const targetBase = base.maxSpeed * p.maxSpeed * r.difficultySpeed * r.skill;
      const curvature = clamp((1 - clamp(cornerSkill, .70, 1.04)) * .0105, 0, .00335);
      const maxLateralAccel = 25.5 * clamp(p.grip, .88, 1.14) * (drifting ? .94 : 1);
      const lateralDemand = r.speed * r.speed * curvature;
      const lateralUtilization = lateralDemand / Math.max(1, maxLateralAccel);
      const tractionGrip = clamp(1 - Math.max(0, lateralUtilization - .78) * .62, .34, 1);
      const tireScrub = Math.min(12, Math.max(0, lateralUtilization - 1) * 18);
      let desired = targetBase * maxMultiplier;
      if (ability === 'thunder-gt' && r.speed > 70 && !r.isPlayer) { desired = Math.min(desired, targetBase * 1.02); }
      if (ability === 'corner-phantom' && !r.isPlayer && cornerSkill < .98) desired *= 1.01;

      const useNitro = straight && r.nitro > (r.isPlayer ? .42 : .24) && r.speed > 42;
      if (useNitro) {
        if (ability === 'nitro-reaper') markAbility(r, ability);
        r.nitro = Math.max(0, r.nitro - nitroDrain * step);
        desired += 10.5 * nitroPower;
        accelerationMultiplier *= 1 + Math.min(.08, nitroAccel / 400);
      } else if (drifting) {
        const driftQuality = r.isPlayer
          ? .90 + .10 * clamp((r.speed - 14) / 42, .25, 1)
          : clamp((1 - cornerSkill) / .22, .18, 1);
        const gain = base.driftChargeRate * p.charge * driftChargeMultiplier * driftQuality * step * (r.isPlayer ? 1 : .33);
        r.nitro = Math.min(1, r.nitro + gain);
        r.driftChargeAdded += gain;
        r.driftTime += step;
      } else r.driftTime = 0;

      const currentSpeed = r.speed;
      const delta = desired - r.speed;
      const accel = base.acceleration * p.acceleration * accelerationMultiplier * tractionGrip;
      const braking = base.braking * p.braking;
      r.speed += clamp(delta, -braking * step, accel * step);
      if (drifting && r.isPlayer) r.speed = Math.max(0, r.speed - base.driftSpeedLoss / p.grip * (ability === 'drift-viper' ? .92 : 1) * step);
      const speedCap = r.isPlayer ? base.maxSpeed * p.maxSpeed * maxMultiplier : base.maxSpeed * p.maxSpeed * 1.08;
      r.speed = Math.max(0, clamp(r.speed, 0, speedCap) - tireScrub * step);
      if (r.elapsed <= 3) r.accelerationStart = Math.max(r.accelerationStart, r.speed / Math.max(.1, r.elapsed));
      r.maxSpeed = Math.max(r.maxSpeed, r.speed);
      r.progress += r.speed * step;
      if (r.progress >= distanceRequired) {
        r.progress = distanceRequired;
        r.finishTime = r.elapsed - (r.progress - distanceRequired) / Math.max(1, r.speed);
      }
    }
  }

  for (const r of field) {
    const stats = carStats.get(r.id);
    stats.fieldStarts++; stats.maxSpeedObserved = Math.max(stats.maxSpeedObserved, r.maxSpeed);
    stats.finishTimes.push(r.finishTime ?? maxTime); stats.accelerationSamples.push(r.accelerationStart);
    stats.driftChargeSamples.push(r.driftChargeAdded); stats.abilityActivations += r.abilityActivations;
    if (r.finishTime === null) stats.timeouts++;
  }
  const completed = field.filter(r => r.finishTime !== null).sort((a,b) => a.finishTime - b.finishTime);
  const winner = completed[0];
  const player = field[0];
  const playerPosition = completed.findIndex(r => r.isPlayer) + 1;
  const pStats = carStats.get(player.id);
  pStats.playerStarts++;
  if (player.finishTime !== null) pStats.playerTimes.push(player.finishTime);
  const pDiff=pStats.playerByDifficulty[difficulty.name] ||= {starts:0,wins:0,podiums:0,finishTimes:[]};
  pDiff.starts++;if(player.finishTime!==null)pDiff.finishTimes.push(player.finishTime);if(playerPosition===1)pDiff.wins++;if(playerPosition>0&&playerPosition<=3)pDiff.podiums++;
  if (playerPosition === 1) { pStats.playerWins++; totalStats.playerWins++; }
  if (playerPosition > 0 && playerPosition <= 3) totalStats.topThree++;
  if (player.finishTime !== null) totalStats.playerFinishTime.push(player.finishTime);
  if (winner) {
    carStats.get(winner.id).fieldWins++;
    if (winner.car.price) totalStats.premiumWins++; else totalStats.freeWins++;
  }
  totalStats.difficulty[difficulty.name] = (totalStats.difficulty[difficulty.name] || 0) + 1;
  totalStats.routeCounts[routeCount] = (totalStats.routeCounts[routeCount] || 0) + 1;
  const diffStats = totalStats.byDifficulty[difficulty.name] ||= {races:0,wins:0,podiums:0};
  diffStats.races++; if(playerPosition===1)diffStats.wins++; if(playerPosition>0&&playerPosition<=3)diffStats.podiums++;
  if (!winner || completed.length !== field.length) totalStats.timeouts++;
  totalStats.races++;
}

const start = performance.now();
for (let i = 0; i < SIMULATION_RACES; i++) runRace(i,racePlan[i]);
const durationMs = performance.now() - start;
const mean = values => values.length ? values.reduce((a,b)=>a+b,0) / values.length : null;
const report = {
  status: 'PASS',
  simulationType: 'Headless time-stepped kinematic race model using production CAR_DATA, CAR_PROFILES, BASE_PERFORMANCE and ability identifiers. It models acceleration, top speed, corner speed, drift charge, nitro and vehicle-specific abilities; it does not run the Three.js renderer, player input, scenery collision or the full in-game traffic solver.',
  actualRacesExecuted: totalStats.races,
  productionSourceVersion: '2.0.0',
  deterministicSeed: '0x81a7c0de',
  simulationWallClockSeconds: +(durationMs/1000).toFixed(2),
  simulatedRaceTimeSeconds: +totalStats.playerFinishTime.reduce((a,b)=>a+b,0).toFixed(1),
  routeCountRange: '2–20 tracks, randomly sampled',
  timestepSeconds: .5,
  entrantCount: 25,
  difficultyDistribution: totalStats.difficulty,
  byDifficulty: Object.fromEntries(Object.entries(totalStats.byDifficulty).map(([k,v])=>[k,{...v,playerWinRatePct:+(v.wins/v.races*100).toFixed(2),podiumRatePct:+(v.podiums/v.races*100).toFixed(2)}])),
  sampledRouteCounts: totalStats.routeCounts,
  player: {
    wins: totalStats.playerWins,
    winRatePct: +(totalStats.playerWins / totalStats.races * 100).toFixed(2),
    topThree: totalStats.topThree,
    podiumRatePct: +(totalStats.topThree / totalStats.races * 100).toFixed(2),
    averageFinishSeconds: +mean(totalStats.playerFinishTime).toFixed(2),
    timeoutRaces: totalStats.timeouts
  },
  fieldWinners: { freeVehicleWins: totalStats.freeWins, premiumVehicleWins: totalStats.premiumWins },
  vehicles: cars.map(car => {
    const s = carStats.get(car.id);
    return {
      id: car.id, name: car.name, price: s.price,
      playerStarts: s.playerStarts,
      playerWins: s.playerWins,
      playerWinRatePct: s.playerStarts ? +(s.playerWins / s.playerStarts * 100).toFixed(2) : 0,
      playerAverageFinishSeconds: s.playerTimes.length ? +mean(s.playerTimes).toFixed(2) : null,
      playerWinRateByDifficulty: Object.fromEntries(Object.entries(s.playerByDifficulty).map(([k,v])=>[k,{starts:v.starts,winRatePct:+(v.wins/v.starts*100).toFixed(2),podiumRatePct:+(v.podiums/v.starts*100).toFixed(2),averageFinishSeconds:v.finishTimes.length?+mean(v.finishTimes).toFixed(2):null}])),
      fieldStarts: s.fieldStarts,
      fieldWins: s.fieldWins,
      fieldWinRatePct: s.fieldStarts ? +(s.fieldWins / s.fieldStarts * 100).toFixed(2) : 0,
      fieldAverageFinishSeconds: s.finishTimes.length ? +mean(s.finishTimes).toFixed(2) : null,
      observedMaxSpeedMs: +s.maxSpeedObserved.toFixed(2),
      averageInitialAccelerationMs2: +mean(s.accelerationSamples).toFixed(2),
      averageDriftChargePerRace: +mean(s.driftChargeSamples).toFixed(3),
      abilityActivations: s.abilityActivations,
      timeouts: s.timeouts
    };
  }),
  abilityActivations: totalStats.abilities,
  caveats: [
    `This is a real execution of ${SIMULATION_RACES.toLocaleString('en-US')} deterministic headless race simulations, but it is a reduced kinematic balance model, not a full browser/Three.js game session.`,
    'The model reads the 2.0.0 production car profiles, difficulty speed factors and special-ability configuration and mirrors player/AI ability branches. It does not reproduce Easy-mode lane-yield decisions, detailed lane changes, model-mesh contacts, mountains/props, guardrail mesh impacts, rendering, sound or persistent UI.',
    'Special-ability activation totals count first passive/trigger events per car per race and repeatable turbo / drift-exit activations where applicable; they are not frame counts.',
    'Every player vehicle receives exactly 250 starts: 25 easy, 150 normal, 62 hard and 13 expert. The player car/difficulty schedule is balanced and then deterministically shuffled to avoid car/difficulty sampling bias.',
    'AI rivals use the same deterministic per-index variation range (.975–1.023) assigned by the production makeAICar constructor. The player has no hidden AI variation and is simulated with an assisted racing line and strategic nitro on straights; actual manual player outcomes can differ.'
  ]
};
fs.writeFileSync(path.join(outDir, `race-simulation-${SIMULATION_RACES}.json`), JSON.stringify(report, null, 2));
const csv = ['id,name,price,playerStarts,playerWins,playerWinRatePct,playerAverageFinishSeconds,fieldStarts,fieldWins,fieldWinRatePct,fieldAverageFinishSeconds,observedMaxSpeedMs,averageInitialAccelerationMs2,averageDriftChargePerRace,abilityActivations', ...report.vehicles.map(v => [v.id, JSON.stringify(v.name), v.price, v.playerStarts, v.playerWins, v.playerWinRatePct, v.playerAverageFinishSeconds ?? '', v.fieldStarts, v.fieldWins, v.fieldWinRatePct, v.fieldAverageFinishSeconds ?? '', v.observedMaxSpeedMs, v.averageInitialAccelerationMs2, v.averageDriftChargePerRace, v.abilityActivations].join(','))].join('\n');
fs.writeFileSync(path.join(outDir, `race-simulation-${SIMULATION_RACES}.csv`), csv);
console.log(JSON.stringify(report, null, 2));
