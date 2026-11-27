## 2.0.1 — Player drift chassis yaw correction

- Fixed a visual/handling integration bug: the player drift angle was calculated and used for the travel/collision calculations but was omitted from the player car root rotation. The car therefore slid laterally without visibly rotating its chassis into the drift.
- Applied `vehicleYaw + driftAngle` to the player car body, matching the existing AI car pose convention. The follow camera, road-edge envelope and player/AI collision envelope now use the same rendered body heading.
- Increased the player drift body offset from 0.185 rad to a handling-scaled 0.34–0.43 rad (about 19–25°), with a 0.14s smoothed entry and 0.22s recovery. Left and right inputs are symmetric.
- Increased front-wheel visual steering during drift and added a smoothed body-turn angle to the Canvas 2D compatibility renderer.
- Added a dedicated `qa:drift` regression test for body yaw magnitude/sign, entry/recovery, camera alignment, collision envelope and fallback rendering.

# Changelog

## 1.1.0 — 2026-11-20
- Added a Next.js App Router shell with static export.
- Added Electron desktop shell and Windows NSIS/portable build targets.
- Added resolution and fullscreen controls.
- Added six remappable driving controls, achievement milestones and original synthesized background music.
- Added an error-log export action and desktop log file support.
- Added remappable accelerate, brake, left, right, drift and nitro controls.
- Added desktop renderer error and crash logging.
- Preserved the existing game HTML in `public/game/index.html` and kept the source project untouched.


## 1.2.0 — 2026-11-21
- Replaced rail-following player movement with independent vehicle heading and steering-driven forward/lateral motion.
- Removed automatic road-direction alignment; no-steering input now allows the car to drift off the racing line on bends.
- Made the drift key affect the actual travel vector with a controlled slip angle, while retaining drift nitro charge, tire marks and smoke.
- Reworked all 20 procedural routes with more frequent linked bends and shorter straight sections.
- Moved the ground plane below the lowest sampled point of each track to prevent road meshes from being hidden by the ground.
- Added deterministic driving/track geometry QA.


## 1.2.1 — 2026-11-21
- Corrected steering rotation so pressing right turns the car to the right and pressing left turns it to the left.
- Corrected lateral movement projection so the car's world movement matches its visible heading.
- Corrected the follow camera's forward vector to match the vehicle model's local -Z front direction, preventing the camera from jumping to the wrong side when the countdown ends.
- Corrected drift slip and barrier-reflection directions to use the same coordinate convention.
- Corrected front wheel visual steering direction for the player and AI cars.
- Added deterministic regression checks for right/left steering, camera alignment, drift slip and barrier response.


## 1.3.0 — 2026-11-21
- Shortened all 20 generated circuits to a 5.4 km target (approximately one minute at racing speed) while retaining and tightening each route's corner profile.
- Reworked AI Grand Prix into a continuous multi-track tour: players choose 2–20 stages, the game randomly selects that many unique tracks, and racers move to the next stage without a new countdown or intermediate results screen.
- Carried player and AI progress across stage transitions so the overall race position and gaps remain continuous.
- Changed Grand Prix proximity/standings calculations from wrapped lap distances to linear tour distances.
- Replaced the hard guardrail rebound with a soft scrape: small steering correction, minimal speed loss, lower-volume scrape sound and no camera shake.
- Updated the 2D compatibility mode's track length and course-time labels to the one-minute target.
- Expanded deterministic QA for course geometry, 2–20 stage selection, route uniqueness, seamless transitions and guardrail response.


## 1.4.0 — Terrain, biomes, hypercar handling and seamless tours

- Replaced the huge shadow-receiving ground with a stable unlit terrain surface; disabled shadow reception on the road and added opaque water to reduce depth/shadow flicker.
- Moved mountain meshes well outside the road safety envelope. Added desert wells, oasis pools and mine entrances; countryside windmills and a water tower; snow/ice lodges and cave tunnels; mountain tunnels and mine portals.
- Increased road width from 22m to 24.5m and moved roadside rails, lights and markers with it.
- Improved drift rotation and changed the travel slip direction so the car turns into the corner rather than washing outward.
- Rebuilt the car silhouette with a longer low nose, elongated rear deck, longer side blades and wider wheelbase. Removed the visible “DRIFT ACTIVE” badge.
- AI Grand Prix stages now align the next track's start point and tangent to the previous finish, blend the beginning and end of each next circuit into the prior route for trailing AI traffic, and interpolate sky/fog/ground colours over 5.5 seconds. The per-stage toast flash was removed.

## 1.5.0 — Visuals, handling and seamless tour flow

- Stabilized terrain rendering by disabling dynamic shadow-map rendering and using fixed unlit ground/water surfaces. Mountain meshes are anchored to the terrain and placed farther outside the driving corridor.
- Added region landmarks: desert well, oasis and mine entrance; countryside windmills, farmhouse and water tower; mountain/forest mine entrances; snow/ice lodge, crystals and cave tunnels.
- Extended and tapered player and AI car body geometry into a low hypercar silhouette; moved nitro exhaust to the longer rear.
- Increased inward drift steering and slip so the travel vector enters the steered corner more decisively.
- Removed the obsolete DRIFT ACTIVE badge, widened the road slightly to 25.5m, and cross-faded old/new track worlds over four seconds during AI Grand Prix stage changes.
- Extended route seam blending with a dynamic tail hold based on the farthest AI gap, so trailing rivals remain on the previous route until they reach the joined segment.


## 1.6.0 — Collision-safe scenery and continuous open-road Grand Prix

- Checked the complete horizontal footprint of mountain meshes against 2,200 samples around the entire road; unsafe mountains are moved farther out or skipped. Applied the same route-wide clearance to cliffs/desert rocks, forest trees, and large city/airport/industrial buildings.
- Intermediate Grand Prix regions now change at 84% of the route when the player reaches the handoff point. No intermediate finish line, gantry, results screen, or restart countdown is crossed.
- The final selected region is different: it runs to 100% before the Grand Prix ends. AI rivals stop at that final endpoint rather than looping around the course.
- Anchored each next region to the player's exact world position and road tangent. All AI racers are re-based by the same amount, preserving their relative gaps and cumulative standings.
- Extended the road bridge to as much as 1,880m behind/ahead of the handoff, using a denser curve sample to reduce abrupt curvature changes.
- Kept road, kerbs and guardrails fully opaque. Only biome scenery cross-fades over 8.2 seconds, while sky/fog/ground colours blend over 10.5 seconds. Removed the abrupt stage-change click sound.
- Added automated regression checks for player-triggered handoffs, full-length final stage completion, AI finish stopping, standings preservation, and route-wide terrain clearance.


## 1.7.0 — Vehicle identity, drift charge and collision envelopes

- Raised the player baseline top speed from 91 to 100 m/s (+9.89%) and acceleration from 31 to 33.5 (+8.06%).
- Added 10 modest, complementary car profiles affecting top speed, acceleration, handling, drift response, braking, grip, nitro and drift-meter charge; the same profile is used for player physics and the matching AI vehicle.
- Increased base drift-meter charge from 0.105 to 0.125 per second. Charge is gated by drift key, steering input and a minimum speed; nominal full-steer drift quality is +15.93% at 45 m/s and +19.05% at 56 m/s.
- Rebuilt 24 AI rivals with distinct nose/deck ratios, cabin dimensions, body width/length, aero kits, wings, livery geometry and wheel designs. Added unique model-signature diagnostics.
- Expanded vehicle collision envelopes to include body kits and front/rear overhang, then projected those envelopes by current yaw so a drifting car's longer axis is included in road-edge and vehicle-to-vehicle clearance.
- Applied swept longitudinal contact tests and the same road-corridor constraint to player/AI and AI/AI interactions.
- Fixed a Grand Prix seam bug by resetting each racer's previous-frame collision position after the route coordinate system is rebased.
- Added `qa:balance` to verify the car profile bounds, 24 unique AI silhouettes, drift charge rates/gates, player buffs, vehicle envelopes, swept contacts and racer physics integration.


## 1.8.0 — Grand Prix economy, premium garage and vehicle abilities

- Removed synthetic speed loss for guardrail proximity. The player still receives a small speed loss only when actual road-corridor contact occurs; AI road-lane constraints remain enabled.
- Kept the existing v1.7 player base and in-game assist multipliers without stacking another global speed increase.
- Added ten GP career rounds with increasing base payouts, difficulty multipliers, tour completion bonus, win-streak bonus and a round-10 champion reward.
- Added idempotent race settlement, three paid winner settlements per local day, zero payout on losses, progression after completed losses and rollback on storage failure.
- Added schema-2 local economy migration while retaining the original ten free vehicle IDs and legacy equipped-car selection.
- Added ten purchasable models and unique prices (2,500–75,000 coins), bringing the full 3D garage roster to twenty.
- Added 3D preview, separate preview/equip state, purchase confirmation/cancel, wallet display and save-persistent ownership/equipped state.
- Implemented ten premium special ability profiles in the player and AI driving update paths.
- Calibrated AI speed multipliers after repeated 5,000-race sweeps: Easy 1.005, Normal 1.0225, Hard 1.0245 and Expert 1.030, preserving the intended ascending difficulty order.
- Initialized finite, bounded per-rival speed variation in `makeAICar`; this fixes an undefined `rival.variation` value that could propagate `NaN` into AI speed calculations.
- Matched Drift Viper and other vehicle ability branches across player/AI paths where the same ability is intended to apply, and expanded regression checks for the new abilities.
- Added economy, guardrail and shop UI tests plus a deterministic 5,000-race headless kinematic simulation.


## 1.9.0 — Vehicle physics, collision fairness and reward system stabilization

- Removed the corner-dependent `0.72` speed multiplier that made the old balanced-car corner ceiling appear at about 277 km/h. Corner loading now affects longitudinal grip and tyre scrub continuously instead of applying a fixed corner top-speed cap.
- Added a shared mass/restitution-based longitudinal impulse resolver for player–AI and AI–AI impacts, conserving momentum for equal-mass rear-end examples.
- Added two-axis swept collision detection using previous/current longitudinal and lateral positions to detect high-speed diagonal crossings that a longitudinal-only sweep could miss.
- Set the physics accumulator to a fixed 120 Hz timestep with a bounded catch-up loop.
- Removed guardrail-proximity speed loss while keeping road-corridor constraints and actual edge-contact scrape loss.
- Increased the base drift-charge rate from 0.145 to 0.173 (+19.31% at full-quality drift); quality gating remains active. Drift yaw response is more damped and less twitchy.
- Rebuilt GP final classification around actual finish flags, elapsed finish times, per-racer progress and stable IDs. DNF racers receive zero points; career sorting uses points, total finish time, wins and only recorded best laps.
- Repriced ten premium cars to unique values from 200 to 2,000 coins, preserving the original free ten.
- Added 80-coin minimum Time Attack completion reward with a 30% chance of +40 coins. Added unique run IDs for duplicate claim protection.
- Removed AI Grand Prix daily entry/payout limits while retaining duplicate settlement protection and storage rollback.
- Added physics/collision, updated economy, classification, time-attack reward and one-hour virtual-time soak tests.

## 2.0.0 — Guardrail impact, Easy AI, Ghost Mode and race rewards

- Split road-edge clamping from impact response. Proximity and safe-corridor correction do not brake the player; an actual outward crossing beyond the road edge creates impact-severity-scaled speed loss, a 0.48s repeat-hit cooldown and an inward yaw response.
- Removed per-frame tyre-scrub speed subtraction from ordinary cornering. Corner load now affects available drive force smoothly, capped to a maximum 3% drive-force reduction in the helper, without a corner-only speed ceiling or automatic brake.
- Recalibrated drift feel between the twitchy and heavy presets: drift yaw authority 1.50, response time constant 0.31s, and lateral slip coefficient 0.22.
- Updated Easy AI behaviour to lower aggressive passing attempts and yield toward a free lateral corridor when the player is closing from behind. Collision resolution remains the same in every difficulty.
- Added Grand Prix pre-race AI Vehicle Mode selection: Normal Mode retains vehicle collisions; Ghost Mode renders AI cars with translucent cloned materials and disables racer-to-racer collision/avoidance only. Track-corridor/road-edge constraints and race progress continue, and rewards are not reduced in Ghost Mode.
- Centralized speed HUD conversion from current physical speed in m/s to km/h; stopped/invalid speed renders as `000`, independently of each car's performance top-speed value.
- Added rank-based GP completion rewards for all finishers: 1st 180, 2nd 160, 3rd 145, 4th–6th 125, 7th–10th 100 and 11th+ 70 coins, plus +50 for top ten and existing winner/round/completion bonuses. DNF still receives no finish payout.
- Preserved saved AI mode in `localStorage` and added 2.0 regression tests for startup order, ghost material restore, reward parity, speed HUD, Easy AI yielding and drift response.
- Added an extra 1-hour virtual 120Hz physics helper soak; this is not a one-hour live game session.
