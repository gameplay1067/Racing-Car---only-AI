# ULTIMATE RACING — Next.js + Electron Desktop Edition

**Version:** 2.0.1  
**Original source backup:** `ULTIMATE_RACING_NEXT_2.0.0_BACKUP.zip` (separate immutable archive)

## What changed in 2.0.1

- Separated guardrail proximity from impact: the vehicle is not slowed simply for approaching the rail, while an actual outward road-edge crossing applies impact-scaled speed loss, cooldown and an inward yaw response.
- Removed ordinary cornering tyre-scrub speed subtraction and capped the traction helper's maximum reduction in available drive force at 3%; no corner-only hard speed cap or automatic brake is used.
- Rebalanced drift input between the earlier twitchy and heavy variants (yaw authority 1.50, 0.31s response, 0.22 slip coefficient).
- Added Easy AI yielding when the player closes from behind in the same corridor. Difficulty affects pace/behaviour, not the shared collision resolver.
- Added persistent Normal/Ghost AI Vehicle Mode for AI Grand Prix. Ghost mode makes AI vehicles translucent and disables racer-to-racer contact only; road-corridor/edge constraints continue and rewards remain identical.
- Updated speed HUD to format the current physical speed (m/s → km/h); stopped or invalid speed displays `000`.
- Added placement coins for all GP finishers, +50 coins for top ten, and existing completion/win/round bonuses. DNFs receive no finish reward; duplicate run settlement remains blocked.
- Fixed the player drift chassis-rotation bug: the calculated drift angle now rotates the visible player body, not only its travel vector. The camera and vehicle collision envelope use the same body heading. The drift body angle now builds smoothly to 0.34–0.43 radians (about 19–25 degrees) with a 0.14s entry and 0.22s recovery; front wheel steering and the Canvas fallback were updated too.
- Added `qa:drift` regression checks for symmetric left/right body yaw, smooth drift entry/recovery, camera alignment, collision-envelope coverage and Canvas fallback rotation. The aggregate QA suite includes this check.

- Removed the old corner-dependent 0.72 top-speed ceiling which produced the apparent 277 km/h plateau. Corner load now reduces available traction and adds tyre scrub continuously; it no longer multiplies the vehicle's top-speed target.
- Kept guardrail proximity separate from physical contact: approaching a barrier does not brake the car; crossing the road-corridor boundary is still clamped and applies the existing small scrape response.
- Unified player-to-AI and AI-to-AI collision response through one mass/restitution momentum impulse function. Added two-axis swept contact checks to detect high-speed longitudinal and lateral crossing between fixed steps.
- Added a 120 Hz fixed physics timestep with up to 12 catch-up steps per rendered frame.
- Made drift steering heavier and more damped. Base drift charge increased from 0.145 to 0.173 (+19.31%); at 45 m/s/full steering the quality-adjusted gain is +16.19%, and at 56 m/s it is +19.31%.
- Reworked Grand Prix final classification to use actual finish state/time and real progress for DNFs. Career points are awarded only to finishers; the season table sorts by points, total completion time, wins and recorded best lap.
- Repriced all ten premium cars from 200 to 2,000 coins (unique prices); the original ten cars remain free.
- Time Attack pays at least 80 coins per valid finish with a 30% chance of an extra 40 coins. GP daily entry and payout caps are removed; duplicate run IDs still prevent double settlement.
- Kept the existing `ur_economy_v1` key and migrated the active object to schema 3, preserving balance, owned vehicles, equipped car, career round, season and claim history.

## What this package contains

- Next.js App Router shell configured for static export (`out/`).
- Electron desktop wrapper and Windows NSIS / portable build targets.
- Game source under `public/game/index.html`.
- Automated QA under `scripts/`: static, settings, driving, fixed-physics/collision, GP classification, balance, economy, guardrail, shop, Ghost Mode/speed HUD and 5,000-race headless simulation checks.
- One-hour virtual-time physics soak test (`npm run qa:soak`).
- Korean report in `docs/QA_REPORT_2.0.1_KO.md`.

## Build a Windows EXE

On Windows 10/11, install **Node.js 20 LTS or newer**. Then double-click `build-windows.bat`.

```powershell
npm install
npm run build
npx electron-builder --win nsis --x64
```

The installer is created in `release/`. To build a portable EXE instead, run `npm run dist:win:portable`.

## Run QA

```powershell
npm run qa
npm run qa:soak
```

The QA suite runs deterministic source and subsystem tests plus 5,000 headless kinematic balance races. The soak script advances 3,600 seconds of virtual driving at 120 Hz and exercises the production traction/collision helpers; it is not a one-hour wall-clock browser session.

## Runtime and test limitations

The full 3D renderer imports Three.js 0.160.0 from jsDelivr with unpkg fallback. Chromium headless smoke testing in this environment failed to initialize EGL/SwiftShader and timed out without DOM output, so the full 3D scene, rendered shop and Ghost Mode visuals, and real-time FPS could not be verified. If both CDNs are unavailable, the built-in Canvas 2D compatibility mode is used; it is not feature-equivalent to the full 3D mode or its economy/shop flow. A fully offline build requires bundling Three.js locally.

The driving system remains a spline-based kinematic vehicle model rather than a full rigid-body engine with mesh colliders for every scene object. This update adds fixed-step kinematic motion, continuous traction, momentum-based racer contact and swept two-axis collision checks, but does not turn mountain/prop meshes into full physical colliders. A live terrain/guardrail collision inspection remains necessary.

The 5,000-race simulation is a reduced kinematic balance model and does not execute Three.js, the full in-game traffic solver, user keyboard input, mesh contacts or rendering. Its results are comparative balance evidence, not measured in-game lap times.

A one-hour real browser/game soak test, actual FPS, CPU/GPU usage, memory growth and Windows EXE build/run were not completed in this environment. The one-hour 120Hz soak is a virtual-time helper test only; see the Korean QA report for explicit statuses.
