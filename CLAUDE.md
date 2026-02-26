# Galaxy Ho! — Project Journal

## What Is This
A 3D space exploration game built with Three.js. The player discovers a procedurally generated galaxy cluster by cluster, zooming into star systems and inspecting individual planets. Pure exploration — no economy, combat, or turns.

## Current Version: v3.0 "Exploration"
- **Galaxy View**: ~100 stars with parallax background starfield (3 layers), volumetric nebulae (3 layers per cloud, billboarded), bloom tint pass preserving spectral colors, dark dust lanes (FBM noise, NormalBlending), pulsating variable stars (~4%), stellar remnants (black holes, neutron stars, white dwarfs), particle stream warp trails on visited connections
- **System View**: Ray-marched atmospheric scattering on planets, planet shadow on rings, configurable star surface rotation, decorative moons orbiting planets, asteroid belts (InstancedMesh, 200 rocks), comets with elliptical Keplerian orbits and anti-sunward particle tails, black hole gravitational lensing shader, neutron star rotating beam cones, white dwarf rendering
- **Post-processing**: Film grain overlay, vignette, bloom tint (galaxy view), UnrealBloomPass
- **Planet Info Cards**: Slide-up panel with type, size, habitability, metals, atmosphere, specials
- **Progressive Unlock**: Visit 3 stars in a cluster → adjacent clusters unlock
- **Persistence**: LocalStorage saves visited stars and unlocked clusters
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
ho/js/main.js          — Init, game loop, transitions, journal
ho/js/config.js        — All tuning constants (spectral, planet types, bloom, camera)
ho/js/data.js          — Procedural galaxy & planet generation
ho/js/shaders.js       — All GLSL shaders (star, planet, ring, galaxy, nebula, ship)
ho/js/system-view.js   — System view: build, update, depth sphere, planet snapshots
ho/js/galaxy-view.js   — Galaxy view: star sprites, connections, nebulae
ho/js/engine.js        — Three.js setup: renderer, camera, controls, bloom, scene groups
ho/js/input.js         — Mouse/touch/keyboard input handling
ho/js/ui.js            — HUD, tooltips, info cards, journal panel
ho/js/minimap.js       — Galaxy minimap overlay
ho/js/state.js         — Save/load state to LocalStorage
ho/js/app.js           — Shared app state singleton
ho/js/utils.js         — mulberry32 PRNG, easing functions
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
- Asteroid belts: InstancedMesh (OctahedronGeometry, 200 instances, 1 draw call), placed in largest orbital gap, slow whole-belt rotation
- Comets: elliptical Keplerian orbits (5-iteration Newton solver), anti-sunward particle tails (Points + per-particle alpha), coma glow (AdditiveBlending sphere)
- Pulsars/variable stars: aPulseRate attribute on galaxy Points, vertex shader brightness modulation, fragment shader expanding ring effect
- Dust lanes: PlaneGeometry + FBM noise shader with NormalBlending (dark, absorptive), 4 regions × 2 layers
- Warp trails: Points geometry per visited connection, positions computed in vertex shader via mix(from,to,fract(time*speed+offset)), sinusoidal lateral drift
- Stellar remnants: black holes (dedicated BLACK_HOLE_FRAG with Schwarzschild geodesic ray tracing, Velocity Verlet integration, conserved angular momentum h², Novikov-Thorne temperature profile, blackbody color ramp, Doppler beaming on temperature, gravitational redshift, higher-order Einstein ring images via multi-crossing tracking, Einstein ring brightening via dFdx/dFdy, improved adaptive stepping near photon sphere), neutron stars (STAR_FRAG with extreme params + rotating ConeGeometry beams), white dwarfs (STAR_FRAG with small radius + high temp)
- Remnant galaxy rendering: aRemnantType attribute on galaxy Points, black holes rendered with dark center + orange accretion ring in fragment shader
- Font: SF Mono / Fira Code / Consolas monospace (sci-fi terminal aesthetic)

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
