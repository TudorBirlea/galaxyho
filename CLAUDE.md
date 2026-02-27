# Galaxy Ho! — Project Journal

## What Is This
A 3D space exploration game built with Three.js. The player discovers a procedurally generated galaxy cluster by cluster, flying a ship between star systems and scanning planets for fuel and data. Features procedural events with meaningful choices and a 12-upgrade progression tree.

## Current Version: v5.0 "Gameplay"
- **Galaxy View**: ~100 stars with parallax background starfield (3 layers), volumetric nebulae (3 layers per cloud, billboarded), bloom tint pass preserving spectral colors, dark dust lanes (FBM noise, NormalBlending), pulsating variable stars (~4%), stellar remnants (black holes, neutron stars, white dwarfs), particle stream warp trails on visited connections, asteroid belt & comet activity indicators in star tooltips
- **System View**: Ray-marched atmospheric scattering on planets, planet shadow on rings, configurable star surface rotation, decorative moons orbiting planets, enhanced asteroid belts, comets with dual tails; black hole gravitational lensing shader, neutron star rotating beam cones, white dwarf rendering; **flyable ship** (ConeGeometry hull + wings + engine glow, quadratic Bezier arc flight, 60-particle thruster trail, camera follow), **event indicator sprites** (pulsing gold dots when Event Scanner upgrade active)
- **Gameplay**: Fuel resource (consumed on star jumps, collected from planets by type), Data resource (earned from scanning + events, spent on upgrades), 37 procedural event templates (12 universal + per-type, seeded per planet, 2-3 choices with risk/reward), 12-upgrade tree (4 categories × 3 tiers: Engines, Sensors, Fuel Systems, Communications), emergency jump to home star when stranded
- **Post-processing**: Film grain overlay, vignette, bloom tint (galaxy view), UnrealBloomPass
- **Planet Info Cards**: Slide-up panel with type, size, habitability, metals, atmosphere, specials
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
ho/js/ship.js          — Ship mesh, Bezier flight, thruster particles, camera follow
ho/js/events.js        — 37 event templates, seeded generation, choice resolution
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
  - Large rocks: 4 IcosahedronGeometry meshes with vertex displacement, Keplerian orbits, tumbling rotation
  - Collision bursts: pool of 8 burst objects (25 particles each), spawn every ~12s (jittered), expand + fade over 1.5s
- Comets: elliptical Keplerian orbits (5-iteration Newton solver), dual particle tails (200-particle ion tail blue-white anti-sunward + 150-particle dust tail warm gold curved behind orbit), soft sprite coma (canvas radial gradient, AdditiveBlending), per-particle size attributes (large near head, small at tip), Gaussian falloff fragment shader, activity scaling near perihelion, sparkle shimmer, dashed orbit path lines
- Pulsars/variable stars: aPulseRate attribute on galaxy Points, vertex shader brightness modulation, fragment shader expanding ring effect
- Dust lanes: PlaneGeometry + FBM noise shader with NormalBlending (dark, absorptive), 4 regions × 2 layers
- Warp trails: Points geometry per visited connection, positions computed in vertex shader via mix(from,to,fract(time*speed+offset)), sinusoidal lateral drift
- Stellar remnants: black holes (dedicated BLACK_HOLE_FRAG with Schwarzschild geodesic ray tracing, Velocity Verlet integration, conserved angular momentum h², Novikov-Thorne temperature profile, blackbody color ramp, Doppler beaming on temperature, gravitational redshift, higher-order Einstein ring images via multi-crossing tracking, Einstein ring brightening via dFdx/dFdy, improved adaptive stepping near photon sphere), neutron stars (STAR_FRAG with extreme params + rotating ConeGeometry beams), white dwarfs (STAR_FRAG with small radius + high temp)
- Remnant galaxy rendering: aRemnantType attribute on galaxy Points, black holes rendered with dark center + orange accretion ring in fragment shader
- Font: SF Mono / Fira Code / Consolas monospace (sci-fi terminal aesthetic)
- Ship: THREE.Group (dual-cone fuselage + cockpit dome + delta wings + dorsal fin + engine nacelles + 3 glow sprites + hull accent stripe), scaled by CONFIG.ship.meshScale
  - Entry: spawns beyond outermost planet orbit at random angle (arrives from interstellar space)
  - Flight: quadratic Bezier arc with live target tracking (recomputes end position from orbiting planet each frame), duration scales with distance (0.8–3.0s), easeInOutCubic
  - Thruster trail: 60-particle Points with age/alpha attributes, AdditiveBlending, spawns during flight, fades when idle
  - Camera follow: controls.target lerps toward ship during flight, returns to star (origin) when idle (orbit center always on star)
  - Docked orbit: ship follows planet position when parked, camera stays centered on star
- Events: 37 templates (12 universal + 3-5 per planet type), seeded RNG per planet (hashInt(seed, 9999)), ~70% chance
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
- Glassmorphism UI: rgba backgrounds with backdrop-filter blur for event cards, upgrade panel, outcome overlay

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
- **v5.0**: Gameplay update — full gameplay loop added: flyable ship in system view (Bezier arc flight, thruster particles, camera follow), fuel resource (consumed on star jumps, collected from planets by type), data resource (earned from scanning + events, spent on upgrades), 37 procedural event templates (12 universal + per-type, seeded per planet, 2-3 risk/reward choices), 12-upgrade tree (Engines/Sensors/Fuel Systems/Communications × 3 tiers), emergency jump to home star, event indicator sprites, glassmorphism UI (fuel gauge, data counter, event cards, outcome overlays, upgrade panel); 4 new modules (gameplay.js, ship.js, events.js, upgrades.js), state migration for old saves
- **v5.1**: Ship & camera polish — redesigned ship mesh (dual-cone fuselage, cockpit dome, delta wings, dorsal fin, engine nacelles, 3 glow sprites, hull accent stripe), ship spawns at system exterior beyond outermost orbit, live planet tracking during flight (fixes ship flying to stale position), camera orbit always centered on star (fixes rotation around ship), system view minDist reduced to 4, passive stellar fuel absorption (0.15/s base, 0.5/s with Solar Collector upgrade)
