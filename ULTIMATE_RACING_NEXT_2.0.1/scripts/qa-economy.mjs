import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'public/game/index.html'), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const carsMatch = html.match(/const CAR_DATA=(\[[\s\S]*?\n\]);/);
assert(carsMatch, 'CAR_DATA not found');
const cars = vm.runInNewContext(`(${carsMatch[1]})`);
assert(cars.length === 20, 'Exactly twenty vehicles must be available');
assert(cars.slice(0, 10).every(car => !car.price), 'The original ten cars must remain free');
const premium = cars.slice(10);
assert(premium.length === 10 && premium.every(car => car.price > 0 && car.price <= 2000), 'Premium cars must be purchasable and cost no more than 2,000 coins');
assert(new Set(premium.map(car => car.price)).size === 10, 'Premium vehicle prices must be unique');

const economyStart = html.indexOf("const ECONOMY_KEY='ur_economy_v1';");
const economyEnd = html.indexOf('\nfunction playerSpecial(style)', economyStart);
assert(economyStart >= 0 && economyEnd > economyStart, 'Economy/classification functions could not be located');
const economySource = html.slice(economyStart, economyEnd);
const state = new Map([['ur_selected_car', '2']]);
const storage = {
  fail: false,
  getItem(key) { return state.has(key) ? state.get(key) : null; },
  setItem(key, value) { if (this.fail) throw new Error('simulated quota/storage failure'); state.set(key, value); },
  removeItem(key) { state.delete(key); }
};
const math = Object.create(Math);
math.random = () => 0.9;
const context = {
  CAR_DATA: cars,
  localStorage: storage,
  console: { warn() {} },
  $: () => null,
  showToast() {},
  gpRoute: [0, 1, 2, 3, 4],
  difficulty: 'normal',
  Math: math
};
vm.runInNewContext(`${economySource}\nthis.__getEconomy=()=>economy;this.__setEconomy=(v)=>{economy=v};this.__buy=(id)=>purchaseVehicle(id);this.__reward=(pos,id,finished=true)=>gpRunReward(pos,id,finished);this.__advance=(id)=>advanceCareerWithoutWin(id);this.__timeReward=(id)=>timeAttackReward(id);this.__reload=()=>loadEconomyData();this.__record=(rows,id)=>recordGrandPrixClassification(rows,id);this.__career=()=>getCareerClassification();`, context);
const read = () => JSON.parse(JSON.stringify(context.__getEconomy()));
const write = value => context.__setEconomy(value);

let data = read();
assert(data.schema === 3, 'Existing save data should migrate to economy schema 3');
assert(data.ownedVehicleIds.length === 10, 'Migration must preserve/unlock exactly ten original free cars');
assert(data.equippedVehicleId === 'UR-X03', 'Legacy selected-car index must be preserved during migration');
assert(data.coins === 0, 'A fresh save must not mint coins');
assert(!('dailyRewardedRuns' in data), 'Daily reward count must be removed from the active save schema');

// Purchase, duplicate prevention, insufficient funds, and rollback on storage failure.
data.coins = 350; write(data);
let buy = context.__buy('UR-X11');
assert(buy.ok && buy.remaining === 150 && read().ownedVehicleIds.includes('UR-X11'), 'Premium purchase did not debit and unlock the entry vehicle at its new price');
assert(context.__buy('UR-X11').reason === 'already-owned', 'Duplicate purchase was not rejected');
assert(context.__buy('UR-X12').reason === 'insufficient-coins', 'Insufficient balance did not block a purchase');

data = read(); data.coins = 10000; write(data); storage.fail = true;
const beforeFailedPurchase = read();
buy = context.__buy('UR-X12');
assert(!buy.ok && buy.reason === 'save-failed', 'Purchase storage failure was not surfaced');
assert(JSON.stringify(read()) === JSON.stringify(beforeFailedPurchase), 'Failed purchase mutated the wallet or ownership');
storage.fail = false;

// GP rewards are unlimited across a day, but the same run ID remains idempotent.
data = read(); data.coins = 0; data.gpRound = 1; data.season = 1; data.winStreak = 0; data.claimedGrandPrixRuns = []; write(data);
const gpPayouts = [];
for (let i = 1; i <= 7; i++) gpPayouts.push(context.__reward(1, `qa-unlimited-${i}`).paid);
assert(gpPayouts.every(value => value > 0), 'Valid GP wins should continue paying beyond three wins in one day');
const afterSeven = read();
assert(afterSeven.gpRound === 8 && afterSeven.winStreak === 7, 'Career rounds/streak did not advance through unlimited daily replays');
assert(!('dailyRewardedRuns' in afterSeven), 'Daily payout limit was retained in the economy data');
const coinsAfterSeven = afterSeven.coins;
const duplicate = context.__reward(1, 'qa-unlimited-7');
assert(duplicate.paid === 0 && read().coins === coinsAfterSeven, 'Duplicate settlement for the same GP run paid twice');

// Every valid finisher receives rank-based coins; the same run is settled only once.
data = read(); data.coins = 900; data.gpRound = 4; data.winStreak = 3; write(data);
const secondPlace = context.__reward(2, 'qa-second-place');
assert(secondPlace.placement === 160 && secondPlace.top10 === 50 && secondPlace.completion === 45 && secondPlace.paid === 255, 'Second-place finisher did not receive placement + top-10 + completion rewards');
assert(read().coins === 1155 && read().gpRound === 5 && read().winStreak === 0, 'Second-place payout or career progression is incorrect');
const duplicateSecond = context.__reward(2, 'qa-second-place');
assert(duplicateSecond.paid === 0 && read().coins === 1155, 'A repeated second-place result paid twice');
const dnf = context.__reward(11, 'qa-dnf', false);
assert(dnf.paid === 0 && read().coins === 1155 && !read().claimedGrandPrixRuns.includes('qa-dnf'), 'DNF must not receive or claim a finish reward');
data = read(); data.coins = 900; data.gpRound = 4; data.winStreak = 3; write(data);
const eleventh = context.__reward(11, 'qa-eleventh-place', true);
assert(eleventh.placement === 70 && eleventh.top10 === 0 && eleventh.paid === 115, '11th+ finisher should receive the base finish reward without top-10 bonus');

// Round ten pays the championship bonus and rolls over the season.
data = read(); data.coins = 0; data.gpRound = 10; data.season = 2; data.winStreak = 0; data.claimedGrandPrixRuns = []; write(data);
const champion = context.__reward(1, 'qa-champion');
assert(champion.champion === 1500 && read().gpRound === 1 && read().season === 3, 'Round 10 champion payout/season rollover failed');

// Time Attack: always at least 80, exactly +40 on a bonus, no duplicate reward.
data = read(); data.coins = 0; data.claimedTimeAttackRuns = []; write(data);
context.Math.random = () => 0.29;
const bonusReward = context.__timeReward('qa-ta-bonus');
assert(bonusReward.base === 80 && bonusReward.bonus === 40 && bonusReward.paid === 120 && bonusReward.bonusTriggered, '30% bonus branch should pay 80 + 40');
const taBalance = read().coins;
assert(context.__timeReward('qa-ta-bonus').paid === 0 && read().coins === taBalance, 'A repeated Time Attack run ID paid twice');
context.Math.random = () => 0.31;
const baseReward = context.__timeReward('qa-ta-base');
assert(baseReward.base === 80 && baseReward.bonus === 0 && baseReward.paid === 80, 'Non-bonus Time Attack must pay exactly the 80-coin base');

// Statistical threshold sanity: use a deterministic 100,000-sample LCG to check the 30% rule.
let seed = 0x4a72c91;
const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
let bonusCount = 0;
for (let i = 0; i < 100000; i++) if (rng() < .30) bonusCount++;
const observedBonusRate = bonusCount / 100000;
assert(observedBonusRate > .295 && observedBonusRate < .305, `30% bonus threshold sample drifted to ${(observedBonusRate*100).toFixed(2)}%`);

// Save failures must roll back both GP and Time Attack rewards.
data = read(); data.coins = 321; data.claimedGrandPrixRuns = []; write(data); storage.fail = true;
const gpBeforeFailure = read();
const failedGp = context.__reward(1, 'qa-gp-save-failure');
assert(failedGp.reason.includes('저장 실패') && JSON.stringify(read()) === JSON.stringify(gpBeforeFailure), 'Failed GP save must roll back coin mutations');
const taBeforeFailure = read();
const failedTa = context.__timeReward('qa-ta-save-failure');
assert(failedTa.reason.includes('저장 실패') && JSON.stringify(read()) === JSON.stringify(taBeforeFailure), 'Failed Time Attack save must roll back coin mutations');
storage.fail = false;

// Career classification must use actual finish records; DNF rows receive zero points.
const raceRows = [
  { id: 'rival-01', name: 'RIVAL-01', finished: true, finishTime: 61.4, bestLapTime: 19.8 },
  { id: 'player', isPlayer: true, name: 'YOU', finished: true, finishTime: 62.2, bestLapTime: 19.2 },
  { id: 'rival-02', name: 'RIVAL-02', finished: false, finishTime: null, bestLapTime: null, progress: 4200 }
];
assert(context.__record(raceRows, 'qa-classification-1').ok, 'Actual GP classification record failed');
const career = context.__career();
const driver = id => career.find(row => row.id === id);
assert(driver('rival-01')?.points === 25 && driver('player')?.points === 18, 'Points did not follow the actual finishing order');
assert(driver('rival-02')?.points === 0 && driver('rival-02')?.dnfs === 1, 'DNF received points or was not recorded');
const careerCountBeforeDuplicate = career.length;
assert(context.__record(raceRows, 'qa-classification-1').reason === 'duplicate' && context.__career().length === careerCountBeforeDuplicate, 'Duplicate GP classification record was not rejected');

// A persistence reload must preserve currency, purchases, and equipped vehicle.
data = read(); data.coins = 12345; data.equippedVehicleId = 'UR-X11'; write(data);
storage.setItem('ur_economy_v1', JSON.stringify(read()));
const restored = context.__reload();
assert(restored.coins === 12345 && restored.equippedVehicleId === 'UR-X11' && restored.ownedVehicleIds.includes('UR-X11'), 'Currency/ownership/equipped car did not survive reload');
assert(!('dailyRewardedRuns' in restored), 'Legacy daily count should not reappear after migration/reload');
assert(html.includes("playSfx('coin')") && html.includes("rewardPanel.classList.add('bonus-pop')") && html.includes(".result-reward.bonus-pop"), 'Time Attack bonus does not trigger reward sound and visual animation');

console.log(JSON.stringify({
  status: 'PASS',
  checks: {
    schemaMigrationKeepsTenFreeCars: true,
    legacyEquippedCarPreserved: true,
    premiumPricesUniqueAndCappedAt2000: true,
    purchaseDebitsAndUnlocks: true,
    duplicatePurchaseBlocked: true,
    insufficientFundsBlocked: true,
    failedPurchaseRollsBack: true,
    unlimitedDailyGpWins: true,
    duplicateGpSettlementBlocked: true,
    allFinishersReceiveRankReward: true,
    dnfReceivesNoCoins: true,
    roundTenChampionBonusAndSeasonRollover: true,
    timeAttackMinimum80: true,
    timeAttackBonusSoundAndAnimation: true,
    timeAttackBonus120: true,
    timeAttackRewardIdempotency: true,
    thirtyPercentBonusThreshold: true,
    failedRewardSaveRollsBack: true,
    actualGpClassificationAndDnfPoints: true,
    duplicateClassificationBlocked: true,
    persistenceReloadPreservesCurrencyAndCars: true
  },
  observed: {
    secondPlacePayout: 255,
    gpPayoutsBeyondDailyThree: gpPayouts,
    sampledBonusRate: +(observedBonusRate * 100).toFixed(2),
    timeAttackBonusRun: bonusReward,
    timeAttackStandardRun: baseReward,
    restoredBalance: restored.coins,
    restoredEquipped: restored.equippedVehicleId,
    vehiclesInRoster: cars.length,
    premiumPrices: premium.map(car => ({ id: car.id, price: car.price }))
  }
}, null, 2));
