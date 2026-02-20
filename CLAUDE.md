# Galaxy Ho! — Project Journal

## What Is This
A 3D space exploration game built with Three.js. The player discovers a procedurally generated galaxy cluster by cluster, zooming into star systems and inspecting individual planets. Pure exploration — no economy, combat, or turns.

## Current Version: v1 "Explorer"
- **Galaxy View**: ~200 stars across 10 clusters, glowing sprites color-coded by spectral class
- **System View**: Central star with animated procedural surface, 3-7 orbiting planets with per-type shaders
- **Planet Info Cards**: Slide-up panel with type, size, habitability, metals, atmosphere, specials
- **Progressive Unlock**: Visit 3 stars in a cluster → adjacent clusters unlock
- **Persistence**: LocalStorage saves visited stars and unlocked clusters
- **Touch-first**: Drag to orbit, pinch to zoom, tap to select, double-tap to enter

## Tech Stack
- Three.js r160 (CDN ESM imports)
- Custom GLSL shaders: simplex noise, FBM, domain warping
- Seeded procedural generation (mulberry32 PRNG)
- Post-processing: EffectComposer + UnrealBloomPass
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
- Rings: RingGeometry + ShaderMaterial (band patterns, Cassini gaps)
- Single THREE.Scene with galaxyGroup/systemGroup toggled via `.visible`
- View transitions: CSS overlay fade (0.4s black → swap groups → fade out)
- Bloom: enabled in galaxy view (threshold 0.35), disabled in system view (star shader handles its own glow)
- Orbital speeds: Keplerian drop-off (inner planets visibly faster than outer)
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
