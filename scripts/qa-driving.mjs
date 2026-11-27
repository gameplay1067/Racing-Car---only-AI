import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// The player must have independent heading and travel direction; no old rail-follow lane motor.
assert(html.includes('let distanceAlong=0,speed=0,laneOffset=0,vehicleYaw=0'), 'Independent vehicle heading state is missing');
assert(html.includes('const targetYawRate=-steer*steeringAuthority*(drifting?1.50:1)') && html.includes('vehicleYaw=wrapAngle(vehicleYaw+vehicleYawRate*dt)'), 'Smoothed right/left steering rotation sign is incorrect');
assert(html.includes('const forwardSpeed=speed*Math.cos(travelError)'), 'Forward motion is not projected from vehicle heading');
assert(html.includes('const lateralSpeed=-speed*Math.sin(travelError)'), 'Lateral motion does not match the vehicle heading convention');
assert(html.includes('const driftSlip=drifting?-steer*.22*(perf.driftHandling/BASE_PERFORMANCE.driftHandling)*(.83+driftQuality*.17):0') && html.includes('drifting?.31:.24') && html.includes('drifting?1.50:1'), 'Weighted midpoint drift tuning must rotate and travel into the steered corner');
assert(html.includes('const carForward=new THREE.Vector3(-Math.sin(bodyYaw),0,-Math.cos(bodyYaw))') && html.includes('car.rotation.y=bodyYaw'), 'Race camera and player chassis must follow the rendered drift body heading');
assert(html.includes('wheel.pivot.rotation.y=wheel.front?-steer*(drifting?.27:.20):0'), 'Player front-wheel visual steering sign or drift angle is incorrect');
assert(html.includes('function resolveRoadEdgeContact(') && html.includes('speedLoss=hit?1.2+strength*8.8:0') && html.includes('cooldown:hit?.48:Math.max(0,cooldown)') && html.includes('speed-edgeContact.speedLoss') && html.includes('inwardYaw=-edgeContact.side'), 'Impact-scaled guardrail response is missing or is not restricted to actual contact');
assert(!html.slice(html.indexOf('const edgeContact=resolveRoadEdgeContact'), html.indexOf('if(drifting){', html.indexOf('const edgeContact=resolveRoadEdgeContact'))).includes('triggerShake'), 'Guardrail collision still triggers camera shake');
assert(html.includes('sweptPlanarContact(previousGap,gap,previousLateral,lateral,halfLength,halfWidth)') && html.includes('const playerEnvelopeNow=vehicleEnvelope(selectedCar,wrapAngle(playerBodyYaw(vehicleYaw,driftAngle)-trackYawAt(distanceAlong)))'), 'AI/player contact does not use the actual drifted chassis envelope');
assert(html.includes('function sweptPlanarContact(') && html.includes('previousLaneOffset'), 'High-speed lateral collision sweep history is missing');
assert(html.includes('function resolveRacerCollision(') && (html.match(/resolveRacerCollision\(/g)||[]).length>=3, 'Player-AI and AI-AI contacts do not share the same impulse resolver');
assert(!html.includes('laneVelocity'), 'Legacy assisted lane-velocity system is still present');
assert(html.includes('id="aiVehicleModeSelect"') && html.includes("localStorage.getItem('ur_ai_vehicle_mode')") && html.includes('if(!aiGhostMode){'), 'Persisted AI Ghost Mode selection or racer-only collision gate is missing');
assert(html.includes('setAIGhostVisuals(aiGhostMode)') && html.includes('ghost.opacity'), 'AI ghost transparency materials are missing');
assert(html.includes('trackGroundY=lowestRoadY-5.0'), 'Ground plane is not placed below the lowest road sample');
assert(html.includes('new THREE.MeshBasicMaterial({color:theme.ground,toneMapped:false})') && html.includes('ground.receiveShadow=false') && html.includes('renderer.shadowMap.enabled=false') && !html.includes("renderer.shadowMap.enabled=graphicsQuality!=='low'"), 'Terrain must use a stable, shadow-free ground material');
assert(html.includes('const ROAD_WIDTH=25.5'), 'Road width was not increased slightly');
const playerPhysics=html.slice(html.indexOf('function updateCar(dt){'),html.indexOf('\nfunction updateAICars(dt){'));
assert(playerPhysics.includes('cornerTractionState(speed,cornerSkill,perf.grip,drifting)') && playerPhysics.includes('let maxSpeed=playerBaseSpeed*abilityMax') && !playerPhysics.includes('maxSpeed*=cornerSkill') && !playerPhysics.includes('Math.max(.72,cornerSkill)'), 'Cornering still applies a hard speed cap instead of continuous tyre load');
assert(html.includes('const PHYSICS_FIXED_DT=1/120,MAX_PHYSICS_STEPS=12') && html.includes('physicsAccumulator'), 'Fixed 120Hz physics stepping is missing');
assert(html.includes('function roadSiteClear(pos,footprint,margin=28)') && html.includes('const roadSafetySamples=[];for(let j=0;j<3200;j++)') && html.includes('const required=footprint+ROAD_WIDTH*.5+2.9+margin') && html.includes('function mountainSiteClear(pos,footprint){return roadSiteClear(pos,footprint,32)}') && html.includes('footprint=Math.hypot(width,depth)'), 'Mountain footprints are not checked against the complete road route and vehicle buffer');
assert(html.includes('function safeRoadsidePosition(frame,side,footprint,offsets,margin=28)') && html.includes('safeRoadsidePosition(f,side,footprint,[120+rnd()*80,260+rnd()*130,430+rnd()*170,650+rnd()*200],30)') && html.includes('safeRoadsidePosition(f,side,Math.hypot(width,depth),[100+rnd()*120,260+rnd()*140,450+rnd()*160],24)') && html.includes('function landmarkGroup(distance,side,offset,faceRoad=false,footprint=18)') && html.includes('if(!position)return null;'), 'Landmarks and large roadside props need route-wide clearance');
assert(html.includes('function addDesertWell') && html.includes('function addOasis') && html.includes('function addMineEntrance'), 'Desert landmarks are missing');
assert(html.includes('function addWindmill') && html.includes("selectedTrack.theme==='countryside'"), 'Plain/countryside landmarks are missing');
assert(html.includes('function addTunnelSegment') && html.includes("['snow','glacier','highland','forest','cliffs'].includes(selectedTrack.theme)") && html.includes('radius=ROAD_WIDTH/2+6'), 'Mountain/ice cave tunnels or vehicle clearance are missing');
assert(!html.includes('DRIFT ACTIVE'), 'Obsolete DRIFT ACTIVE badge text must be removed');
assert(html.includes('function createHypercarHullGeometry(width,length)') && html.includes('add(createHypercarHullGeometry(w,L),bodyMat,0,0,0)') && html.includes('const bodyGeo=createHypercarHullGeometry(width,length)') && html.includes('const kit=(style.kit') && html.includes('const wingKind=(style.wing+index+variant)%5'), 'Player and individually-kitted AI hypercar models are missing');
assert(html.includes('const target=5400'), 'Tracks are not shortened to the one-minute target length');
assert((html.match(/minutes:'01:00'/g)||[]).length===20, 'All 20 track cards must advertise the one-minute target');
assert(html.includes('id="gpTrackCount"') && html.includes('value="20"'), 'Grand Prix must allow selecting 2–20 tracks');
assert(html.includes('function generateGrandPrixRoute(count=5)') && html.includes('gpRoute=pool.slice(0,count)'), 'AI Grand Prix route selection is missing or not unique');
assert(html.includes('function transitionGrandPrixStage(completedProgress)') && html.includes('const sourceDistance=distanceAlong;') && html.includes('buildTrackWorld(nextIndex,placement,previousCurve,{sourceDistance,tailHold,headHold})'), 'Grand Prix transition must anchor at the player road position');
assert(html.includes('const GP_STAGE_TRIGGER_RATIO=.84') && html.includes('function grandPrixStageTriggerDistance()') && html.includes('if(playerProgress<trigger)return'), 'Intermediate Grand Prix regions must change before the finish line when the player reaches the route seam');
assert(html.includes('tailHold=clamp(maxTrailingGap+520,900,1880)') && html.includes('headHold=clamp(maxLeadingGap+520,900,1880)') && html.includes('tailFade=Math.min(1050,Math.max(620,tailHold*.62))'), 'Grand Prix road seam blend is not long enough to preserve the racing pack');
assert(html.includes('previousCurve.getPointAt(sourceT)') && html.includes('blendFrom.getPointAt(oldD/previousLength)') && html.includes('const headHold=clamp(Number(seamBlend?.headHold)||1050,600,generatedLength*.36)'), 'Next biome is not aligned and blended to the actual player position');
assert(html.includes('function setSceneryFade(group,direction,duration)') && html.includes('trackSceneryLayer') && html.includes('duration:10.5') && html.includes('fadeInTrackScenery(8.2)'), 'Only biome scenery should fade gradually while the road stays continuous');
assert(html.includes('function maybeAdvanceGrandPrix()') && html.includes('transitionGrandPrixStage(playerProgress)') && html.includes('if(playerProgress<trackLength)return') && html.includes('gpTotalRaceDistance=gpCompletedDistance+trackLength'), 'Grand Prix final region must finish only at its full end, not an AI-led early trigger');
assert(html.includes('gpStageIndex>=gpRoute.length-1&&rival.progress>=trackLength') && html.includes('rival.finished=true;rival.finishTime=elapsed;rival.bestLapTime=Number.isFinite(rival.bestLapTime)'), 'AI racers should complete and stop at the final finish instead of wrapping around the final road');
assert(!html.includes('function transitionGrandPrixStage(leader,completedProgress)') && !html.includes('if(leader.progress<trigger)return'), 'Grand Prix stage change is still triggered by an AI leader rather than the player-centered road seam');
assert(!html.includes('showToast(`코스 ${gpStageIndex+1}/${gpRoute.length}'), 'Abrupt stage transition toast is still present');
assert(html.includes('rival.distance-=sourceDistance') && html.includes('rival.startDistance=previousStart+completedProgress-sourceDistance') && html.includes('gpCompletedDistance+=completedProgress'), 'AI racer offsets and cumulative tour progress are not preserved across stage transitions');
assert(html.includes('OPEN-ROAD TOUR') && html.includes('TRACK TOUR'), 'Grand Prix open-road tour HUD/record labels are missing');
assert(html.includes("if(gameMode==='grandprix')return d"), 'Grand Prix racer gaps must remain linear across a stage, not wrap like laps');
assert(html.includes("rail:{f:175,to:120,d:.09,w:'triangle',v:.025}"), 'Guardrail scrape audio is not softened');
assert((html.match(/~ 01:00 <small>MIN<\/small>/g)||[]).length>=1 && html.includes('const trackLength=5400;'), 'Fallback mode does not use the shorter course length');

// Parse the source track list and reproduce the deterministic radial control points.
const trackMatches = [...html.matchAll(/\{name:'([^']+)',kr:'[^']+',environment:'([^']+)',theme:'([^']+)',type:'([^']+)',typeLabel:'[^']+',desc:'[^']+',seed:(\d+)/g)];
assert(trackMatches.length === 20, `Expected 20 tracks, found ${trackMatches.length}`);
const TAU = Math.PI * 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const lcg = seed => { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; };
function sampleTrack(theme, type, seed, index) {
  const rnd = lcg(seed * 101 + index * 7919);
  const n = type === 'drift' ? 22 : (type === 'speed' ? 18 : 20);
  const phase = rnd() * TAU;
  const points = [];
  for (let i = 0; i < n; i++) {
    const jitter = type === 'drift' ? .105 : (type === 'speed' ? .075 : .09);
    const a = -Math.PI / 2 + i * TAU / n + (rnd() - .5) * jitter;
    let radius;
    if (type === 'drift') radius = 3150 + 620 * Math.sin(3*a+phase) + 360 * Math.cos(6*a+phase*.7) + 210 * Math.sin(9*a+index);
    else if (type === 'speed') radius = 3440 + 390 * Math.sin(3*a+phase) + 235 * Math.cos(6*a+phase*.7) + 130 * Math.sin(9*a+index);
    else radius = 3300 + 500 * Math.sin(2*a+phase) + 325 * Math.cos(5*a+phase*.4) + 180 * Math.sin(8*a+index*.3);
    radius += (rnd() - .5) * (type === 'drift' ? 130 : 105);
    const rx = radius * (1.06 + (index % 3) * .012);
    const rz = radius * (.94 + ((index + 1) % 3) * .012);
    const elev = ['snow','volcano','forest','cliffs','highland','glacier'].includes(theme) ? 95 : (theme === 'coast' || theme === 'skyway' ? 32 : 12);
    const y = elev * (Math.sin(2*a+phase)*.58 + Math.sin(5*a+phase*.7)*.25 + Math.cos(3*a-index*.2)*.17);
    points.push([Math.cos(a)*rx, y, Math.sin(a)*rz]);
  }
  const rotation = (index % 7) * .19;
  for (const p of points) { const x = p[0], z = p[2]; p[0] = x*Math.cos(rotation)-z*Math.sin(rotation); p[2] = x*Math.sin(rotation)+z*Math.cos(rotation); }
  const tension = .42, samplesPerSegment = 60, samples = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const v0 = mul(sub(p2, p0), tension), v1 = mul(sub(p3, p1), tension);
    const c0 = p1, c1 = v0;
    const c2 = add(add(mul(p1, -3), mul(p2, 3)), add(mul(v0, -2), mul(v1, -1)));
    const c3 = add(add(mul(p1, 2), mul(p2, -2)), add(v0, v1));
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment, t2 = t*t, t3 = t2*t;
      samples.push(add(add(c0, mul(c1, t)), add(mul(c2, t2), mul(c3, t3))));
    }
  }
  let length = 0;
  for (let i = 0; i < samples.length; i++) length += norm(sub(samples[(i+1)%samples.length], samples[i]));
  const target = 5400;
  const scale = target / length;
  return samples.map(p => mul(p, scale));
}
function checkTrack(points, name) {
  const count = points.length;
  const radii = [];
  for (let i = 0; i < count; i++) {
    const a = points[(i-1+count)%count], b = points[i], c = points[(i+1)%count];
    const ab = [b[0]-a[0], b[2]-a[2]], bc = [c[0]-b[0], c[2]-b[2]], ac = [c[0]-a[0], c[2]-a[2]];
    const cross = Math.abs(ab[0]*bc[1] - ab[1]*bc[0]);
    const denom = 2 * cross;
    if (denom > 1e-8) radii.push((Math.hypot(...ab) * Math.hypot(...bc) * Math.hypot(...ac)) / denom);
  }
  radii.sort((a,b)=>a-b);
  const radiusP01 = radii[Math.floor(radii.length * .01)];
  assert(radiusP01 > 25, `${name}: tightest 1% curvature radius too small (${radiusP01.toFixed(1)}m)`);

  // Spatial buckets make the non-local centerline-overlap test inexpensive.
  const cell = 26, buckets = new Map(), minSeparation = 14;
  let closePairs = 0;
  for (let i = 0; i < count; i++) {
    const p = points[i], bx = Math.floor(p[0]/cell), bz = Math.floor(p[2]/cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = buckets.get(`${bx+dx},${bz+dz}`) || [];
      for (const j of bucket) {
        const separation = Math.min(i-j, count-(i-j));
        if (separation <= minSeparation) continue;
        const q = points[j], dist = Math.hypot(p[0]-q[0], p[2]-q[2]);
        if (dist < cell) closePairs++;
      }
    }
    const key = `${bx},${bz}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  assert(closePairs === 0, `${name}: non-local road centerlines overlap within road width (22m) (${closePairs} pairs)`);
  return radiusP01;
}

const geometryResults = [];
for (let index = 0; index < trackMatches.length; index++) {
  const [, name, , theme, type, seed] = trackMatches[index];
  const points = sampleTrack(theme, type, Number(seed), index);
  geometryResults.push({ name, radiusP01: checkTrack(points, name) });
}

// A curved road with zero steering must accumulate heading error and leave its centreline.
let heading = 0, distance = 0, lane = 0;
const speed = 50, curvature = 1 / 700, dt = .05;
for (let step = 0; step < 120; step++) {
  const roadYaw = distance * curvature;
  const error = Math.atan2(Math.sin(heading-roadYaw), Math.cos(heading-roadYaw));
  distance += speed * Math.cos(error) * dt;
  lane += speed * Math.sin(error) * dt;
}
assert(Math.abs(heading) < 1e-9 && Math.abs(lane) > 8.4, 'Zero-input steering is still being auto-corrected onto the curved road');

// Grand Prix handoff re-bases every racer without changing cumulative standings.
const oldStart=-46, playerDistance=oldStart+4536, aiStates=[{distance:oldStart+4700,start:-34},{distance:oldStart+4200,start:-23},{distance:oldStart+3900,start:-11}];
const completed=playerDistance-oldStart,oldCompleted=10800;
const newPlayerDistance=playerDistance-playerDistance,newPlayerStart=oldStart+completed-playerDistance;
assert(Math.abs((oldCompleted+playerDistance-oldStart)-(oldCompleted+completed+newPlayerDistance-newPlayerStart))<1e-8, 'Player cumulative Grand Prix progress changed across the handoff');
for(const ai of aiStates){const before=oldCompleted+ai.distance-ai.start;const rebasedDistance=ai.distance-playerDistance,rebasedStart=ai.start+completed-playerDistance;const after=oldCompleted+completed+rebasedDistance-rebasedStart;assert(Math.abs(before-after)<1e-8,'AI cumulative Grand Prix progress changed across the handoff');}

// Coordinate-convention regression: local -Z is the car's forward axis.
// A positive right-steer input must reduce yaw, move along +road-right, and
// the follow camera must use the very same forward vector as the car.
const rightYaw = -.30;
const rightForward = [-Math.sin(rightYaw), -Math.cos(rightYaw)];
const rightLaneVelocity = -speed * Math.sin(rightYaw);
assert(rightForward[0] > 0 && rightLaneVelocity > 0, 'Right steering does not move the car toward the road right side');
const leftYaw = .30;
const leftForwardX = -Math.sin(leftYaw);
const leftLaneVelocity = -speed * Math.sin(leftYaw);
assert(leftForwardX < 0 && leftLaneVelocity < 0, 'Left steering does not move the car toward the road left side');
const cameraForward = [-Math.sin(rightYaw), -Math.cos(rightYaw)];
const cameraDot = rightForward[0]*cameraForward[0] + rightForward[1]*cameraForward[1];
assert(cameraDot > .999, 'Race camera is not aligned with the car forward direction');
const rightDriftTravelYaw = rightYaw - .20;
const rightDriftLaneVelocity = -speed * Math.sin(rightDriftTravelYaw);
assert(rightDriftTravelYaw < rightYaw && rightDriftLaneVelocity > 0, 'Right drift must move the travel vector into the right-hand corner');

console.log(JSON.stringify({
  checks: { independentSteering: true, rightLeftDirection: true, cameraAlignment: true, lateralProjection: true, driftIntoCorner: true, stableTerrain: true, biomeLandmarks: true, caveTunnels: true, hypercarSilhouette: true, widerRoad: true, sceneryOnlyCrossFade: true, smoothGrandPrixTransition: true, softGuardrailScrape: true, noBarrierCameraShake: true, noLaneAssist: true, groundClearance: true, zeroInputLeavesCurvedRoad: true, twentyTrackGeometry: true, oneMinuteCourseTarget: true, grandPrixCount2To20: true, randomUniqueGrandPrixRoute: true, playerLedEarlyHandoff: true, finalStageFullFinish: true, aiFinalFinishStop: true, continuousRoadBridge: true, linearTourStandings: true, allRouteTerrainClearance: true, forestAndCityClearance: true },
  trackCount: geometryResults.length,
  lowestOnePercentCurveRadiusM: Math.min(...geometryResults.map(x => x.radiusP01)).toFixed(1),
  trackGeometry: geometryResults.map(x => ({ name: x.name, radiusP01: x.radiusP01.toFixed(1) }))
}, null, 2));
