import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const start = html.indexOf('function getStandings(){');
const end = html.indexOf('\nfunction finishRace(){', start);
assert(start >= 0 && end > start, 'Could not locate production standings and progress functions');
const source = html.slice(start, end);
const careerStart = html.indexOf('function getCareerClassification(){');
const careerEnd = html.indexOf('\nfunction recordGrandPrixClassification(', careerStart);
assert(careerStart >= 0 && careerEnd > careerStart, 'Could not locate career classification sorter');
const careerSource = html.slice(careerStart, careerEnd);
const context = {
  gameMode: 'grandprix', gpTotalRaceDistance: 20000, gpCompletedDistance: 0,
  distanceAlong: 10000, raceStartDistance: 0, playerFinished: true,
  playerFinishTime: 62.25, speed: 0, completedLapTimes: [20.1, 19.6],
  trackLength: 5400, gpRoute: [0, 1, 2], GP_STAGE_TRIGGER_RATIO: .84,
  aiCars: [
    { id: 'rival-01', name: 'RIVAL-01', distance: 10100, startDistance: 0, speed: 0, finished: true, finishTime: 60.5, bestLapTime: null },
    { id: 'rival-02', name: 'RIVAL-02', distance: 9700, startDistance: 0, speed: 0, finished: true, finishTime: 66.2, bestLapTime: null },
    { id: 'rival-03', name: 'RIVAL-03', distance: 9200, startDistance: 0, speed: 20, finished: false, finishTime: null, bestLapTime: null }
  ],
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  fmtTime: value => `${value.toFixed(2)}s`,
  gpClassification: { drivers: {
    points: { id:'points',name:'POINTS',races:4,points:100,completedRaces:4,totalCompletionTime:500,wins:1,bestLapTime:20 },
    fastest: { id:'fastest',name:'FASTEST',races:3,points:50,completedRaces:3,totalCompletionTime:290,wins:1,bestLapTime:21 },
    quick: { id:'quick',name:'QUICK',races:3,points:50,completedRaces:3,totalCompletionTime:300,wins:1,bestLapTime:20 },
    wins: { id:'wins',name:'WINS',races:3,points:50,completedRaces:3,totalCompletionTime:300,wins:3,bestLapTime:22 },
    lap: { id:'lap',name:'LAP',races:3,points:50,completedRaces:3,totalCompletionTime:300,wins:1,bestLapTime:18 },
    dnf: { id:'dnf',name:'DNF',races:2,points:50,completedRaces:0,totalCompletionTime:0,wins:0,bestLapTime:null }
  }}
};
vm.runInNewContext(`${source}\n${careerSource}\nthis.__standings=getStandings;this.__status=formatProgressStatus;this.__career=getCareerClassification;`, context);
const rows = context.__standings();
assert(rows.map(r => r.id).join(',') === 'rival-01,player,rival-02,rival-03', 'Final order did not use actual finish flags/times and DNF progress');
assert(rows[0].finishTime === 60.5 && rows[1].finishTime === 62.25, 'Finisher timestamps were not preserved');
assert(context.__status(rows[0]) === 'FINISH · 60.50s', 'Finished racers should display their actual elapsed finish time');
const dnf = context.__status(rows[3]);
assert(dnf.includes('DNF · STAGE 3') && dnf.endsWith('2%'), `DNF progress must be calculated per racer, not a shared 84% (${dnf})`);
const standingsSource = source.slice(source.indexOf('function getStandings(){'), source.indexOf('\nfunction formatProgressStatus('));
assert(standingsSource.includes('if(a.finished!==b.finished)') && standingsSource.includes('a.finishTime-b.finishTime') && standingsSource.includes('b.progress-a.progress'), 'Standings lack finish-time and real-progress sorting');
const careerOrder=context.__career().map(row=>row.id);
assert(careerOrder.join(',')==='points,fastest,wins,lap,quick,dnf', `Career ranking must prioritize points, total finish time, wins, then best lap (${careerOrder.join(',')})`);
assert(html.includes('recordGrandPrixClassification(standings,gpRunId)') && html.includes('row.finished?(GP_POSITION_POINTS[index]||0):0'), 'Career points must be recorded from actual result and DNFs must receive no points');
console.log(JSON.stringify({
  status: 'PASS',
  checks: {
    finishersSortedByElapsedTime: true,
    playerNotRankedByJoinOrder: true,
    unfinishedDriversSortedByActualProgress: true,
    individualDnfPercentages: true,
    dnfReceivesZeroPoints: true,
    persistentClassificationUsesActualResults: true,
    careerTieBreakOrderPointsTimeWinsBestLap: true
  },
  observedOrder: rows.map((r, i) => ({ position: i + 1, id: r.id, finished: r.finished, progress: r.progress, finishTime: r.finishTime, display: context.__status(r) })),
  careerTieBreakOrder: careerOrder
}, null, 2));
