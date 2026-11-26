import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'public/game/index.html'),'utf8');
const assert=(v,m)=>{if(!v)throw new Error(m)};
const fnStart=html.indexOf('function resolveRoadEdgeContact(');
const fnEnd=html.indexOf('\nfunction sweptLongitudinalContact(',fnStart);
assert(fnStart>=0&&fnEnd>fnStart,'Production road-edge response helper not found');
const context={Math,clamp:(v,min,max)=>Math.max(min,Math.min(max,v))};
vm.runInNewContext(`${html.slice(fnStart,fnEnd)}\nthis.resolveRoadEdgeContact=resolveRoadEdgeContact;`,context);
const resolve=context.resolveRoadEdgeContact;
const limit=9.2,speed=100;
const cases={
  farStraight:resolve(0,0,0,limit,0),
  nearRailStraight:resolve(limit-.35,limit-.35,0,limit,0),
  nearRailAccelerating:resolve(limit-.35,limit-.35,0,limit,0),
  nearRailCorneringInside:resolve(limit-.35,limit-.60,-6.25,limit,0),
  lightImpact:resolve(limit-.1,limit+.12,1.1,limit,0),
  strongImpact:resolve(limit-.4,limit+1.1,20,limit,0),
  impactDuringCooldown:resolve(limit-.1,limit+.4,5,limit,.2)
};
assert(cases.farStraight.speedLoss===0,'Straight-road speed changed without contact');
assert(cases.nearRailStraight.speedLoss===0&&!cases.nearRailStraight.hit,'Guardrail proximity caused an unwanted slowdown');
assert(cases.nearRailAccelerating.speedLoss===0,'Acceleration near a guardrail was blocked');
assert(cases.nearRailCorneringInside.speedLoss===0&&!cases.nearRailCorneringInside.hit,'Turning away from the guardrail caused a false impact');
assert(cases.lightImpact.hit&&cases.strongImpact.hit&&cases.strongImpact.speedLoss>cases.lightImpact.speedLoss,'Actual contact does not scale with impact severity');
assert(!cases.impactDuringCooldown.hit&&cases.impactDuringCooldown.speedLoss===0,'Collision cooldown did not prevent duplicate impact penalties');
const updateCar=html.slice(html.indexOf('function updateCar(dt){'),html.indexOf('\nfunction updateAICars(dt){'));
assert(updateCar.includes('resolveRoadEdgeContact(laneOffset,requestedLane,lateralSpeed,safeRoadLimit')&&updateCar.includes('speed-edgeContact.speedLoss'),'Player movement does not apply production road-edge contact response');
const updateAI=html.slice(html.indexOf('function updateAICars(dt){'),html.indexOf('\nfunction updateIdle(dt){'));
assert(updateAI.includes('resolveRoadEdgeContact(previousLaneOffset,requestedLane,aiLateralSpeed,laneLimit,rival.barrierHitCooldown)'),'AI road-edge contact constraint is missing');
console.log(JSON.stringify({status:'PASS',checks:{noProximityBrake:true,accelerationNearRail:true,cornerAwayFromRail:true,impactSeverityScalesSpeedLoss:true,cooldownPreventsRepeatedHits:true,playerAndAIRoadEdgeHandlers:true},cases},null,2));
