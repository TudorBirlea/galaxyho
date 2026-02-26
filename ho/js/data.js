import { CONFIG } from './config.js?v=3.7';
import { mulberry32, hashInt, lerp, genStarName, pickSpectralClass, ROMAN, SPECIALS } from './utils.js?v=3.7';

export function generateGalaxy(seed) {
  const rng = mulberry32(seed);
  const { starCount: N, fieldRadius: R, fieldHeight: H, minStarDist: minD,
          maxConnections: maxConn, connectionRange: connRange } = CONFIG.galaxy;
  const stars = [];

  // Generate star positions — Poisson-disc in a flat disc
  let attempts = 0;
  while (stars.length < N && attempts < N * 100) {
    attempts++;
    const r = Math.sqrt(rng()) * R;
    const theta = rng() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = (rng() - 0.5) * H * (1 - r / R * 0.6);

    let tooClose = false;
    for (const s of stars) {
      const dx = s.position.x - x, dy = s.position.y - y, dz = s.position.z - z;
      if (dx * dx + dy * dy + dz * dz < minD * minD) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const sc = pickSpectralClass(rng);
    const sid = hashInt(seed, stars.length);
    const isPulsar = rng() < CONFIG.pulsars.chance;
    stars.push({
      id: stars.length,
      name: genStarName(sid),
      position: { x, y, z },
      spectralClass: sc,
      planetCount: CONFIG.spectral[sc].minPlanets + Math.floor(rng() * (CONFIG.spectral[sc].maxPlanets - CONFIG.spectral[sc].minPlanets + 1)),
      seed: sid,
      visited: false,
      adjacentIds: [],
      isPulsar,
      pulseRate: isPulsar ? (CONFIG.pulsars.pulseSpeedMin + rng() * (CONFIG.pulsars.pulseSpeedMax - CONFIG.pulsars.pulseSpeedMin)) : 0,
      remnantType: null,
    });
  }

  // Move the star closest to center to index 0 (home star)
  let closestIdx = 0, closestDist = Infinity;
  for (let i = 0; i < stars.length; i++) {
    const { x, y, z } = stars[i].position;
    const d = x * x + y * y + z * z;
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  }
  if (closestIdx !== 0) {
    [stars[0], stars[closestIdx]] = [stars[closestIdx], stars[0]];
    stars[0].id = 0;
    stars[closestIdx].id = closestIdx;
  }

  // ── v3: Designate stellar remnants ──
  const remnantRng = mulberry32(seed + 900);
  const rcfg = CONFIG.remnants;
  const shuffled = [...Array(stars.length).keys()].sort(() => remnantRng() - 0.5);
  let di = 0;

  const bhCount = rcfg.blackHoleCount[0] + Math.floor(remnantRng() * (rcfg.blackHoleCount[1] - rcfg.blackHoleCount[0] + 1));
  let assigned = 0;
  for (let k = di; k < shuffled.length && assigned < bhCount; k++) {
    const s = stars[shuffled[k]];
    if (s.id === 0) continue;
    s.remnantType = 'blackHole';
    s.planetCount = Math.max(1, Math.floor(s.planetCount * 0.5));
    assigned++; di = k + 1;
  }

  const nsCount = rcfg.neutronStarCount[0] + Math.floor(remnantRng() * (rcfg.neutronStarCount[1] - rcfg.neutronStarCount[0] + 1));
  assigned = 0;
  for (let k = di; k < shuffled.length && assigned < nsCount; k++) {
    const s = stars[shuffled[k]];
    if (s.id === 0 || s.remnantType) continue;
    s.remnantType = 'neutronStar';
    s.isPulsar = true;
    s.pulseRate = rcfg.neutronStar.pulseSpeed;
    assigned++; di = k + 1;
  }

  const wdCount = rcfg.whiteDwarfCount[0] + Math.floor(remnantRng() * (rcfg.whiteDwarfCount[1] - rcfg.whiteDwarfCount[0] + 1));
  assigned = 0;
  for (let k = di; k < shuffled.length && assigned < wdCount; k++) {
    const s = stars[shuffled[k]];
    if (s.id === 0 || s.remnantType) continue;
    s.remnantType = 'whiteDwarf';
    assigned++;
  }

  // Build adjacency — each star connects to nearest neighbors within range
  for (let i = 0; i < stars.length; i++) {
    const dists = [];
    for (let j = 0; j < stars.length; j++) {
      if (i === j) continue;
      const dx = stars[i].position.x - stars[j].position.x;
      const dy = stars[i].position.y - stars[j].position.y;
      const dz = stars[i].position.z - stars[j].position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= connRange) dists.push({ id: j, d });
    }
    dists.sort((a, b) => a.d - b.d);
    const count = Math.min(dists.length, maxConn);
    for (let k = 0; k < count; k++) {
      const j = dists[k].id;
      if (!stars[i].adjacentIds.includes(j)) stars[i].adjacentIds.push(j);
      if (!stars[j].adjacentIds.includes(i)) stars[j].adjacentIds.push(i);
    }
  }

  // Ensure full connectivity — BFS from star 0, bridge isolated components
  const visited = new Set([0]);
  const queue = [0];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const adj of stars[cur].adjacentIds) {
      if (!visited.has(adj)) { visited.add(adj); queue.push(adj); }
    }
  }
  for (let i = 0; i < stars.length; i++) {
    if (visited.has(i)) continue;
    let nearest = -1, nearDist = Infinity;
    for (const v of visited) {
      const dx = stars[i].position.x - stars[v].position.x;
      const dy = stars[i].position.y - stars[v].position.y;
      const dz = stars[i].position.z - stars[v].position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < nearDist) { nearDist = d; nearest = v; }
    }
    if (nearest >= 0) {
      stars[i].adjacentIds.push(nearest);
      stars[nearest].adjacentIds.push(i);
    }
    // BFS from newly connected star to absorb its component
    visited.add(i);
    const bq = [i];
    while (bq.length > 0) {
      const cur = bq.shift();
      for (const adj of stars[cur].adjacentIds) {
        if (!visited.has(adj)) { visited.add(adj); bq.push(adj); }
      }
    }
  }

  // ── Pre-compute asteroid belt presence for galaxy-view tooltips ──
  for (const s of stars) {
    const planets = generatePlanets(s);
    const belt = generateAsteroidBelt(s, planets);
    s.hasBelt = belt !== null;
  }

  return { seed, stars };
}

export function starDistance(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = a.position.z - b.position.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function generatePlanets(star) {
  const rng = mulberry32(star.seed);
  const planets = [];
  const sc = star.spectralClass;

  for (let i = 0; i < star.planetCount; i++) {
    let type;
    const r = rng();
    const inner = i < star.planetCount * 0.4;
    if (sc === 'O' || sc === 'B') { type = r < 0.3 ? 'lava' : r < 0.5 ? 'desert' : r < 0.65 ? 'gas_giant' : r < 0.75 ? 'water' : r < 0.88 ? 'ice' : 'ocean'; }
    else if (sc === 'M' || sc === 'K') { type = inner ? (r < 0.25 ? 'terran' : r < 0.45 ? 'desert' : r < 0.6 ? 'ocean' : r < 0.75 ? 'water' : 'lava') : (r < 0.35 ? 'ice' : r < 0.6 ? 'gas_giant' : r < 0.75 ? 'water' : 'desert'); }
    else { type = inner ? (r < 0.25 ? 'terran' : r < 0.45 ? 'desert' : r < 0.58 ? 'lava' : r < 0.72 ? 'ocean' : r < 0.85 ? 'water' : 'gas_giant') : (r < 0.28 ? 'gas_giant' : r < 0.45 ? 'ice' : r < 0.6 ? 'terran' : r < 0.75 ? 'ocean' : r < 0.88 ? 'water' : 'desert'); }

    const pt = CONFIG.planetTypes[type];
    const size = pt.sizeRange[0] + Math.floor(rng() * (pt.sizeRange[1] - pt.sizeRange[0] + 1));
    const hab = Math.floor(lerp(pt.habRange[0], pt.habRange[1], rng()));
    const met = Math.floor(lerp(pt.metalRange[0], pt.metalRange[1], rng()));
    const atm = pt.atmOptions[Math.floor(rng() * pt.atmOptions.length)];
    const hasRings = type === 'gas_giant' ? rng() < 0.6 : (type === 'ice' ? rng() < 0.15 : (type === 'water' ? rng() < 0.2 : false));
    const special = rng() < 0.10 ? SPECIALS[Math.floor(rng() * SPECIALS.length)] : null;
    const pseed = hashInt(star.seed, i * 7 + 3);
    const texturePath = pt.textures[Math.floor(rng() * pt.textures.length)];
    const spinRate = pt.shader === 3 ? 1.2 + rng() * 0.6 : 0.7 + rng() * 0.6; // gas giants spin faster
    const visualSize = type === 'gas_giant' ? 0.8 + rng() * 0.5 : (type === 'water' ? 0.55 + rng() * 0.4 : 0.35 + rng() * 0.35);

    // v3: Generate moons for eligible planets
    const moonCfg = CONFIG.moons;
    const moonChance = moonCfg.chances[type] || 0;
    const moonMax = moonCfg.maxMoons[type] || 0;
    const moons = [];
    if (rng() < moonChance && moonMax > 0) {
      const moonCount = 1 + Math.floor(rng() * moonMax);
      for (let m = 0; m < Math.min(moonCount, moonMax); m++) {
        moons.push({
          id: m,
          orbitRadius: visualSize * (moonCfg.orbitRadiusMin + rng() * (moonCfg.orbitRadiusMax - moonCfg.orbitRadiusMin)),
          orbitSpeed: moonCfg.orbitSpeed[0] + rng() * (moonCfg.orbitSpeed[1] - moonCfg.orbitSpeed[0]),
          orbitPhase: rng() * Math.PI * 2,
          size: moonCfg.sizeRange[0] + rng() * (moonCfg.sizeRange[1] - moonCfg.sizeRange[0]),
          seed: hashInt(pseed, m * 13 + 7),
        });
      }
    }

    planets.push({
      id: i, name: star.name + ' ' + ROMAN[i],
      type, shaderType: pt.shader, label: pt.label,
      size, habitability: hab, metalRichness: met, atmosphere: atm,
      hasRings, special, seed: pseed, texturePath,
      atmosCol: pt.atmosCol, atmosStr: pt.atmosStr, spinRate,
      orbitRadius: 4 * CONFIG.spectral[sc].starScale * 3 + 3 + Math.pow(i + 1, 1.35) * (3.5 + rng() * 2.5),
      orbitSpeed: (0.15 + rng() * 0.15) / Math.pow(1 + i, 1.4),
      orbitPhase: rng() * Math.PI * 2,
      visualSize,
      moons,
    });
  }
  return planets;
}

// v3: Asteroid belt generation
export function generateAsteroidBelt(star, planets) {
  const rng = mulberry32(star.seed + 500);
  if (rng() > CONFIG.asteroidBelt.chance) return null;
  if (planets.length < 2) return null;

  const sorted = [...planets].sort((a, b) => a.orbitRadius - b.orbitRadius);
  let bestGap = 0, bestInner = 0, bestOuter = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].orbitRadius - sorted[i].orbitRadius;
    if (gap > bestGap) {
      bestGap = gap;
      bestInner = sorted[i].orbitRadius + gap * 0.2;
      bestOuter = sorted[i + 1].orbitRadius - gap * 0.2;
    }
  }
  if (bestGap < 3) return null;

  return { beltInnerRadius: bestInner, beltOuterRadius: bestOuter, beltSeed: hashInt(star.seed, 501) };
}

