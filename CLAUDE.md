# Galaxy Ho! — Project Journal

## What Is This
A 3D space exploration game built with Three.js. The player discovers a procedurally generated galaxy cluster by cluster, flying a ship between star systems and scanning planets for fuel and data. Features procedural events with meaningful choices and a 12-upgrade progression tree.

## Current Version: v6.4
- **Galaxy View**: ~100 stars with parallax background starfield (3 layers), volumetric nebulae (3 layers per cloud, billboarded), bloom tint pass preserving spectral colors, dark dust lanes (FBM noise, NormalBlending), pulsating variable stars (~4%), stellar remnants (black holes, neutron stars, white dwarfs), particle stream warp trails on visited connections, asteroid belt & comet activity indicators in star tooltips
- **System View**: Ray-marched atmospheric scattering on planets, planet shadow on rings, configurable star surface rotation, decorative moons orbiting planets, enhanced asteroid belts, single comet per system with dual tails; black hole gravitational lensing shader, neutron star rotating beam cones, white dwarf rendering; **flyable ship** (orbital state machine: parking orbit → parametric Hohmann ellipse transfer → approach → docked orbit, 60-particle thruster trail, burn phases with 5× particle intensity, proximity thruster boost near planets), **event indicator sprites** (pulsing gold dots when Event Scanner upgrade active), **planet status rings** (3-arc shader rings showing scan/mine/explore completion per planet)
- **Gameplay**: Fuel resource (consumed on star jumps, collected from planets by type), Data resource (earned from scanning + events, spent on upgrades), 36 procedural event templates (12 universal + per-type, seeded per planet, 2-3 choices with risk/reward), 12-upgrade tree (4 categories × 3 tiers: Engines, Sensors, Fuel Systems, Communications), emergency jump to home star when stranded
- **Post-processing**: Film grain overlay, vignette, bloom tint (galaxy view), UnrealBloomPass
- **Planet Info Cards**: Slide-up panel with type, size, habitability, metals, atmosphere, specials, **3 action buttons** (Scan/Mine/Explore) with progress bars and inline reward display
- **Progressive Unlock**: Visit 3 stars in a cluster → adjacent clusters unlock
- **Persistence**: LocalStorage saves visited stars, unlocked clusters, fuel, data, upgrades, resolved events (with migration for old saves)
- **Touch-first**: Drag to orbit, pinch to zoom, tap to select, double-tap to enter
- **Version**: Displayed in HUD (top-right), set via `VERSION` constant in config.js

## Tech Stack
- Three.js r160 (CDN ESM imports)
- Custom GLSL shaders: simplex noise, FBM, domain warping
- Seeded procedural generation (mulberry32 PRNG)
- Post-processing: EffectComposer → UnrealBloomPass → BloomTintPass → FilmGrainPass
- Modular ES module codebase (js/ directory)

## File Structure
```
ho/index.html          — The game (entry point, HTML + CSS)
ho/js/main.js          — Init, game loop, transitions, journal, event/upgrade wiring
ho/js/config.js        — All tuning constants (spectral, planet types, bloom, camera, gameplay, ship)
ho/js/data.js          — Procedural galaxy & planet generation
ho/js/shaders.js       — All GLSL shaders (star, planet, ring, galaxy, nebula, ship)
ho/js/system-view.js   — System view: build, update, depth sphere, planet snapshots, event indicators
ho/js/galaxy-view.js   — Galaxy view: star sprites, connections, nebulae
ho/js/engine.js        — Three.js setup: renderer, camera, controls, bloom, scene groups
ho/js/input.js         — Mouse/touch/keyboard input, fly-then-scan flow
ho/js/ui.js            — HUD, tooltips, info cards, journal, fuel gauge, event cards, upgrade panel
ho/js/minimap.js       — Galaxy minimap overlay
ho/js/state.js         — Save/load state to LocalStorage (fuel, data, upgrades, events)
ho/js/app.js           — Shared app state singleton
ho/js/utils.js         — mulberry32 PRNG, easing functions
ho/js/gameplay.js      — Fuel/data resource logic, upgrade effects, solar regen
ho/js/ship.js          — Ship mesh, parametric Hohmann transfer, thruster particles, orbital state machine
ho/js/events.js        — 36 event templates, seeded generation, choice resolution
ho/js/upgrades.js      — Upgrade tree (4×3), purchase logic, effect definitions
ho/textures/           — Planet equirectangular textures (16 maps)
_extras/               — Reference files, backups, experiments (gitignored)
.github/workflows/     — GitHub Pages deploy workflow
```

## Key Architecture Decisions
- Stars in galaxy view: Points geometry with custom vertex/fragment shaders (Gaussian core, diffraction spikes, colored halos)
- Stars in system view: Fullscreen quad (PlaneGeometry 2x2) + ray-marched shader
  - Camera rays reconstructed via inverse view-projection matrix (u_invViewProj)
  - Normalized space rendering (cameraPosition / starRadius)
  - Voronoi 3D cells, FBM detail, sunspots, bright regions, limb darkening
  - EUV color grading, corona glow, coronal streamers, prominences
  - Background starfield (3-layer procedural)
  - ACES filmic tonemapping, vignette, gamma
  - Invisible depth sphere (colorWrite: false) for proper planet occlusion
- Planets: SphereGeometry + ShaderMaterial (hybrid texture + procedural overlays)
  - Base: equirectangular texture maps (UV-warped per seed for variety)
  - Overlays: procedural clouds, lava veins, cracks, dust haze (per-type)
  - Lighting: per-planet atmosphere colors + per-type specular
  - Lava worlds: luminance-based magma/crust separation for proper night-side glow
- Rings: RingGeometry + ShaderMaterial (band patterns, Cassini gaps, planet shadow via ray-sphere intersection)
- Atmosphere: Ray-marched Rayleigh scattering (12 steps, BackSide sphere shell, per-type scatter config)
- Single THREE.Scene with galaxyGroup/systemGroup toggled via `.visible`
- View transitions: CSS overlay fade (0.4s black → swap groups → fade out)
- Star glow: additive Sprite billboard per star (canvas radial gradient, spectral-colored, depthTest off, scale ~7× starRadius), skipped for black holes
- System starfield: 2000 Points in sphere (r 60–360), boosted sizes (1.0–3.5) and alpha (1.2×) for visibility
- Bloom: enabled in galaxy view (threshold 0.35), disabled in system view (star shader handles its own glow)
- Bloom tint pass: re-saturates bloom areas to preserve spectral star colors (galaxy view only)
- Film grain: hash-based animated noise + smoothstep vignette (ShaderPass, always active)
- Galaxy background: 3-layer starfield with parallax drift based on camera displacement
- Nebulae: 5-layer volumetric planes per cloud (10 clouds, 50 total meshes), billboarded via lookAt each frame
- Star surface: configurable rotation speed via u_rotSpeed uniform
- Orbital speeds: Keplerian drop-off (inner planets visibly faster than outer)
- Moons: small SphereGeometry + MeshBasicMaterial, orbit parent planet position each frame
- Asteroid belts: Points geometry (500 particles) with per-particle attributes (radius, angle, seed, composition type), placed in largest orbital gap
  - Keplerian orbits: per-particle speed = baseSpeed / sqrt(radius), inner particles visibly faster
  - Irregular shapes: fragment shader angular distortion (4 sine lobes seeded per particle) for rocky silhouettes
  - Gaussian vertical distribution: CLT approximation (avg of 3 randoms) clusters particles near midplane
  - 3 composition types: silicate (60%, warm brown), carbonaceous (25%, dark charcoal), metallic (15%, blue-gray)
  - Phase-angle lighting: dot(toStar, toCamera) brightens particles when camera sees their lit side
  - Dust glow layer: RingGeometry + noise-driven density shader (AdditiveBlending) underneath particles
  - Large rocks: 4 IcosahedronGeometry(detail=2) meshes with elongation + 3-octave spherical harmonic displacement (smooth asteroid shapes), Keplerian orbits, tumbling rotation
  - Collision bursts: pool of 8 burst objects (25 particles each), spawn every ~12s (jittered), expand + fade over 1.5s
- Comets: max 1 per system (~45% chance), elliptical Keplerian orbits (5-iteration Newton solver), dual particle tails (200-particle ion tail blue-white anti-sunward + 150-particle dust tail warm gold curved behind orbit), soft sprite coma (canvas radial gradient, AdditiveBlending), per-particle size attributes (large near head, small at tip), Gaussian falloff fragment shader, activity scaling near perihelion, sparkle shimmer, dashed orbit path lines
- Pulsars/variable stars: aPulseRate attribute on galaxy Points, vertex shader brightness modulation, fragment shader expanding ring effect
- Dust lanes: PlaneGeometry + FBM noise shader with NormalBlending (dark, absorptive), 4 regions × 2 layers
- Warp trails: Points geometry per visited connection, positions computed in vertex shader via mix(from,to,fract(time*speed+offset)), sinusoidal lateral drift
- Stellar remnants: black holes (dedicated BLACK_HOLE_FRAG with Schwarzschild geodesic ray tracing, Velocity Verlet integration, conserved angular momentum h², Novikov-Thorne temperature profile, blackbody color ramp, Doppler beaming on temperature, gravitational redshift, higher-order Einstein ring images via multi-crossing tracking, Einstein ring brightening via dFdx/dFdy, improved adaptive stepping near photon sphere), neutron stars (STAR_FRAG with extreme params + rotating ConeGeometry beams), white dwarfs (STAR_FRAG with small radius + high temp)
- Remnant galaxy rendering: aRemnantType attribute on galaxy Points, black holes rendered with dark center + orange accretion ring in fragment shader
- Font: SF Mono / Fira Code / Consolas monospace (sci-fi terminal aesthetic)
- Ship: THREE.Group (dual-cone fuselage + cockpit dome + delta wings + dorsal fin + engine nacelles + 3 glow sprites + hull accent stripe), scaled by CONFIG.ship.meshScale
  - Orbital state machine: PARKING → BURN_DEPART → TRANSFER → BURN_ARRIVE → APPROACH → DOCKED
  - Entry: spawns in circular parking orbit around star (beyond outermost planet + buffer), tangent-facing, counterclockwise
  - Transfer: parametric Hohmann half-ellipse — ship position computed analytically from Kepler's equation each frame (no simulation, no numerical integration); guaranteed smooth trajectory from departure radius to target radius through exactly π radians prograde
  - Kepler solver: Newton-Raphson iteration (15 max) on M = E - e·sin(E), then E → true anomaly ν → polar position (r, θ); correct speed variation (fast at periapsis, slow at apoapsis)
  - Ellipse parameters: semi-major axis a = (r1+r2)/2, eccentricity e = |r2-r1|/(r1+r2); outward transfers depart from periapsis, inward from apoapsis
  - Duration: fixed configurable `transferDuration` (6s default), scaled by speed upgrades
  - Facing: centered finite-difference on the parametric curve (ε=0.002) gives smooth velocity direction
  - Arrival: progress reaches 1.0 → exact position at (r2, departureAngle+π), no snap needed
  - Thruster visuals: intensity scales with planet proximity (up to 5× near massive bodies)
  - Burns: 0.35s departure/arrival burns with 5× thruster particle intensity
  - Approach: ship orbits at target radius prograde-only (never reverses), catches up to planet angular position, docks on convergence
  - Docked orbit: ship orbits planet at 2.5× visualSize radius with 0.3 tilt, tangent-facing via lookAt(angle+0.1), camera stays centered on star
  - Thruster trail: 60-particle Points with age/alpha attributes, AdditiveBlending, intensity varies by flight phase
  - Camera: no follow — camera stays at user's perspective during flight, controls.target always lerps to star origin
- Planet actions: 3 independent per-planet actions (Scan/Mine/Explore), tracked in `state.planetActions["starId-planetId"]` as `{ scanned, mined, explored }` booleans
  - Scan: instant, awards 3-8 data via `rollScanData()`, reveals planet stats
  - Mine: 1.5s progress bar, awards fuel scaled by metalRichness (`rollMiningYield()`, metalRichness/50 multiplier)
  - Explore: 2s progress bar, awards 3-6 data via `rollExploreData()`, triggers planet events
  - Info card buttons: `.ic-action` elements with CSS progress bars, done-state checkmarks, inline reward display
  - Each action once per planet, state persisted via `planetActions` in LocalStorage
  - Actions locked until ship docked at planet (or Orbital Scan upgrade), "Click planet again to dock" hint
- Planet interaction: first click shows info card, second click on same planet sends ship to orbit; ship won't fly to planet it's already docked at
- System summary panel: top-right glassmorphism panel (star name, spectral class colored badge, temperature, planet count + completion, asteroid belt/comet indicators); visible in system view only; remnant systems show type label instead of spectral class
- Planet status rings: RingGeometry + ShaderMaterial per planet, 3 arc sectors (120° each with gaps) — scan (cyan), mine (amber), explore (green); arcs visible only when action completed; additive blending, subtle pulse animation, renderOrder 3; positioned at planet center each frame; uniforms refreshed on action completion
- Events: 36 templates (12 universal + 3-5 per planet type), seeded RNG per planet (hashInt(seed, 9999)), ~70% chance
  - Template structure: title, description ({planetName}/{starName} interpolation), planetTypes filter, rarity weighting (common=6, uncommon=3, rare=1), 2-3 choices with risk/successRate/outcome ranges
  - Resolution: seeded roll against successRate (modified by Deep Scanner +10%), interpolated reward ranges
  - Deterministic: same planet always generates same event, same choice always gives same outcome
  - Event indicators: pulsing gold Sprite dots above unscanned planets (visible when Event Scanner upgrade purchased)
- Upgrades: 4 categories × 3 sequential tiers (must own tier N-1 to buy tier N), currency is Data
  - Engines: Fuel Efficiency (-25% cost) → Extended Range (2-hop jumps) → Warp Mk II (-50% cost + faster flight)
  - Sensors: Event Scanner (see indicators) → Deep Scanner (+10% success) → Orbital Scan (scan without flying)
  - Fuel Systems: Tank Expansion (+50% capacity) → Fuel Harvester (+50% yield) → Solar Collector (3× stellar absorption rate)
  - Communications: Diplomacy Suite (extra choices) → Trade Protocols (+30% data) → Beacon Network (reveal 2-hop stars)
- Fuel economy: distance_ly × 3.5 × fuelCostMult, planet yields vary by type (gas_giant highest, lava lowest), passive stellar absorption (0.15/s base, 0.5/s with Solar Collector upgrade)
- Emergency jump: free teleport to home star (star 0) when fuel insufficient for any reachable jump
- Ship status panel: bottom-left glassmorphism panel (SVG ship icon, star location, fuel bar with value/max, data counter, stars explored, planets scanned), positioned above minimap
- Glassmorphism UI: rgba backgrounds with backdrop-filter blur for event cards, upgrade panel, outcome overlay, ship panel

## Spectral Classes & Temperatures
| Class | Temp Range | Color | Game Probability |
|-------|-----------|-------|-----------------|
| O | 30,000K+ | Blue-violet | 1% |
| B | 10-30,000K | Blue-white | 3% |
| A | 7,500-10,000K | White-blue | 4% |
| F | 6,000-7,500K | Yellow-white | 7% |
| G | 5,200-6,000K | Yellow | 12% |
| K | 3,700-5,200K | Orange | 18% |
| M | 2,400-3,700K | Red-orange | 55% |

## Planet Types (7)
terran, desert, ice, gas_giant, lava, ocean, water — hybrid texture-mapped with procedural overlays per type

| Type | Shader | Textures | Atmosphere Color | Notes |
|------|--------|----------|-----------------|-------|
| terran | 0 | 3 variants | Blue | Clouds + polar caps overlay |
| desert | 1 | 3 variants | Orange-brown | Dune detail + dust haze |
| ice | 2 | 1 variant | Pale blue | Crack network + frost |
| gas_giant | 3 | 5 variants | Deep blue | Turbulent wisps |
| lava | 4 | 1 variant | Red | Emissive veins + night glow |
| ocean | 5 | 1 variant | Blue-green | Cloud cover + cyclones |
| water | 6 | 2 variants | Blue | Thick banded clouds (sub-Neptune) |

## Changelog
- **v1.0**: Initial implementation — galaxy generation, system view, planet info cards, progressive unlock, LocalStorage persistence
- **v1.1**: Upgraded star shader to ray-marched blackbody with EUV-inspired colors; upgraded planet shader to dedicated per-type surface functions (from star.html / planets.html references)
- **v1.2**: Planet rendering upgrade — hybrid texture+procedural approach, 7th planet type (water), per-planet atmosphere colors, per-type specular models, night-side lava glow, monospace font, 16 equirectangular textures
- **v1.3**: Star shader overhaul — fullscreen quad ray-marching (ported from experiment-stars.html), invisible depth sphere for planet occlusion, bloom disabled in system view, Keplerian orbital speeds, overall brightness pass, lava world night-side fix, git repo + GitHub Pages deploy
- **v2.0**: Visual overhaul — 7 new effects integrated: ray-marched atmospheric scattering (per-planet, Rayleigh), film grain + vignette post-processing, volumetric multi-layer nebulae with billboarding, planet shadow on rings (ray-sphere), 3-layer parallax background starfield, configurable star surface rotation, bloom tint pass for spectral color preservation; version indicator in HUD
- **v3.0**: Exploration expansion — 7 new features: pulsating variable stars (~4%, shader-driven brightness + expanding ring), dark dust lanes (FBM noise absorption planes), particle stream warp trails (replace solid tubes on visited connections), decorative moons (per-planet-type chance, orbit parents), asteroid belts (InstancedMesh in largest orbital gap, 200 rocks), comets (Keplerian elliptical orbits, anti-sunward particle tails), stellar remnants (1-2 black holes with gravitational lensing shader + accretion disk, 2-3 neutron stars with rotating beam cones, 3-5 white dwarfs); remnant-aware tooltips
- **v3.7.1**: Black hole shader rewrite — correct Schwarzschild geodesic ray tracing with conserved angular momentum (h²), Velocity Verlet symplectic integration (replaces broken Euler + normalize), proper event horizon shadow, disk inner edge at photon sphere (1.5 rs), removed fake photon ring and straight-line secondary image hack
- **v3.7.2**: System view brightness — star glow sprite (additive billboard, spectral-colored, canvas radial gradient), boosted background starfield (larger points, higher alpha)
- **v3.8**: Black hole overhaul — Novikov-Thorne temperature profile (ISCO at r=3, plunge region), blackbody color ramp replacing hardcoded colors, Doppler shift applied to temperature (physically correct), gravitational redshift, higher-order Einstein ring images (up to 4 disk crossings with exponential dimming), Einstein ring brightening via screen-space derivatives (dFdx/dFdy), improved adaptive stepping near photon sphere (r=1.5), single-noise spiral (removed expensive second snoise call)
- **v4.0**: Comet reintroduction — improved visuals from experiment page: dual particle tails (200 ion blue-white anti-sunward + 150 dust warm gold curved), soft sprite coma (canvas radial gradient billboard), per-particle size attributes (Gaussian falloff shader), activity scaling near perihelion (distance-based brightness/size), sparkle shimmer, dashed orbit path lines, comet activity indicator in galaxy tooltip
- **v3.9.2**: Asteroid belt chance raised to 25%, frustumCulled fix for belt particles disappearing when zoomed in
- **v3.9.1**: Galaxy tooltip — asteroid belt presence shown in star detail tooltip (pre-computed during galaxy generation, gold-colored indicator)
- **v3.9**: Asteroid belt overhaul — 8 improvements: Keplerian per-particle orbital speeds (inner faster), irregular rocky shapes (4-lobe angular sine distortion in fragment shader), Gaussian vertical distribution (CLT clustering near midplane), 3 composition color types (silicate/carbonaceous/metallic), phase-angle star lighting, additive dust glow layer (RingGeometry + noise shader), 4 large tumbling rocks (IcosahedronGeometry + vertex displacement), rare collision dust bursts (~12s interval, 25-particle expanding puffs)
- **v5.0**: Gameplay update — full gameplay loop added: flyable ship in system view (Bezier arc flight, thruster particles, camera follow), fuel resource (consumed on star jumps, collected from planets by type), data resource (earned from scanning + events, spent on upgrades), 36 procedural event templates (12 universal + per-type, seeded per planet, 2-3 risk/reward choices), 12-upgrade tree (Engines/Sensors/Fuel Systems/Communications × 3 tiers), emergency jump to home star, event indicator sprites, glassmorphism UI (fuel gauge, data counter, event cards, outcome overlays, upgrade panel); 4 new modules (gameplay.js, ship.js, events.js, upgrades.js), state migration for old saves
- **v5.1**: Ship & camera polish — redesigned ship mesh (dual-cone fuselage, cockpit dome, delta wings, dorsal fin, engine nacelles, 3 glow sprites, hull accent stripe), ship spawns at system exterior beyond outermost orbit, live planet tracking during flight (fixes ship flying to stale position), camera orbit always centered on star (fixes rotation around ship), system view minDist reduced to 4, passive stellar fuel absorption (0.15/s base, 0.5/s with Solar Collector upgrade), ship status panel (SVG icon, location, fuel bar, data, stars explored, planets scanned), fuel/data moved from top HUD to ship panel, version bumped to 5.1
- **v5.2**: Planet actions — 3 independent per-planet actions replace single scan: Scan (instant, +data), Mine (1.5s, +fuel scaled by metalRichness), Explore (2s, +data + triggers events); info card action buttons with CSS progress bars, done-state checkmarks, inline reward display; ship orbits docked planet (2.5× radius, tilted circle, tangent-facing) instead of static hover; per-planet action state tracking (`planetActions` object with migration from old `scannedPlanets`); new gameplay functions `rollMiningYield()` and `rollExploreData()`
- **v5.3**: Orbital mechanics & status indicators — ship flight rewritten as 6-state orbital state machine (PARKING → BURN_DEPART → TRANSFER → BURN_ARRIVE → APPROACH → DOCKED): ship enters system in circular parking orbit, Hohmann-like half-ellipse transfer between orbits (Kepler-scaled duration), departure/arrival burn phases with 5× thruster intensity, approach phase converges on planet angular position before docking; planet status rings (3-arc ShaderMaterial rings per planet: cyan=scan, amber=mine, green=explore, visible after action completion); improved large asteroid geometry (IcosahedronGeometry detail 2 + elongation + 3-octave spherical harmonic displacement for smooth rocky shapes)
- **v5.4**: Observer camera & system panel — removed camera follow during ship flight (camera stays at user perspective, always centered on star); system summary panel (top-right glassmorphism: star name, spectral class badge, temperature, planet count + completion, belt/comet indicators); planet interaction reworked (first click = info card, second click = fly ship, no self-flight); action buttons locked until ship docked (with hint text)
- **v6.0**: Test suite & release cleanup — added Vitest test infrastructure (204 tests across 7 suites: utils, config, data, gameplay, events, upgrades, state); fixed safe-choice bug (0.98 success cap no longer applies to choices with 1.0 successRate); deleted .bak backup files; corrected event template count (36, not 37); added npm scripts (`npm test`, `npm run test:watch`)
- **v6.1**: Single comet & gravity slingshots — comets limited to max 1 per system (was 1-3); ship transfers now use gravity slingshot paths (cubic Bezier curved toward intermediate planets) when a planet exists between departure and target orbits, with thruster boost at closest approach; cache-busting query strings updated to v6.0 across all imports
- **v6.2**: N-body gravity transfers — replaced Bezier/Hohmann path evaluation with real-time gravitational simulation: Velocity Verlet integration (~5 substeps/frame), star + all planet forces computed each step, GM_star derived from innermost planet orbit, GM_planet from visualSize³; gravitational slingshots emerge naturally from physics; guidance correction ensures arrival; thruster intensity scales with planet proximity; removed old evalTransfer/evalSlingshotTransfer/findSlingshotPlanet functions
- **v6.3**: Proper elliptical orbits — fixed ship flying directly instead of arcing around star: added time-warp (real Hohmann duration compressed to ~5s real time via simulation multiplier so ship traces full elliptical arc); replaced homing-missile guidance with energy-based orbital trim (compares orbital energy to target Hohmann, corrects velocity magnitude not direction); removed transferSpeedScale (replaced by targetRealDuration); timeout extended to 2× real duration
- **v6.4**: Smooth parametric transfers — replaced n-body gravity simulation with analytical Hohmann half-ellipse: ship position computed from Kepler's equation each frame (Newton-Raphson solver, true anomaly → polar coordinates), guaranteeing smooth continuous trajectory with correct speed variation (fast at periapsis, slow at apoapsis); eliminated teleporting (no radius-snap on arrival — parametric progress reaches 1.0 at exact target position), direction reversal (approach phase always prograde), and multi-orbit circling (parametric path is exactly one half-ellipse); removed gravity config block (7 constants), added single `transferDuration: 6.0`; simplified BURN_DEPART (no velocity seeding or drift)
