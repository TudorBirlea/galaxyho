import { describe, it, expect } from 'vitest';
import { generateGalaxy, starDistance, generatePlanets, generateAsteroidBelt, generateComets } from '../ho/js/data.js';
import { CONFIG } from '../ho/js/config.js';

const VALID_SPECTRAL = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
const VALID_PLANET_TYPES = ['terran', 'desert', 'ice', 'gas_giant', 'lava', 'ocean', 'water'];

// ── generateGalaxy ──

describe('generateGalaxy', () => {
  const galaxy = generateGalaxy(42);

  it('is deterministic (same seed → same output)', () => {
    const g2 = generateGalaxy(42);
    expect(g2.stars.length).toBe(galaxy.stars.length);
    for (let i = 0; i < galaxy.stars.length; i++) {
      expect(g2.stars[i].name).toBe(galaxy.stars[i].name);
      expect(g2.stars[i].position.x).toBe(galaxy.stars[i].position.x);
      expect(g2.stars[i].position.y).toBe(galaxy.stars[i].position.y);
      expect(g2.stars[i].position.z).toBe(galaxy.stars[i].position.z);
    }
  });

  it('generates roughly the configured number of stars', () => {
    // May be slightly less due to Poisson-disc rejection
    expect(galaxy.stars.length).toBeGreaterThan(CONFIG.galaxy.starCount * 0.8);
    expect(galaxy.stars.length).toBeLessThanOrEqual(CONFIG.galaxy.starCount);
  });

  it('star 0 is the closest to origin (home star)', () => {
    const dist0 = Math.hypot(galaxy.stars[0].position.x, galaxy.stars[0].position.y, galaxy.stars[0].position.z);
    for (let i = 1; i < galaxy.stars.length; i++) {
      const d = Math.hypot(galaxy.stars[i].position.x, galaxy.stars[i].position.y, galaxy.stars[i].position.z);
      expect(d).toBeGreaterThanOrEqual(dist0);
    }
  });

  it('all stars have valid spectral classes', () => {
    for (const star of galaxy.stars) {
      expect(VALID_SPECTRAL).toContain(star.spectralClass);
    }
  });

  it('all stars have non-empty names', () => {
    for (const star of galaxy.stars) {
      expect(star.name.length).toBeGreaterThan(0);
    }
  });

  it('all star IDs match their array index', () => {
    for (let i = 0; i < galaxy.stars.length; i++) {
      expect(galaxy.stars[i].id).toBe(i);
    }
  });

  it('star positions respect minimum distance', () => {
    const minD = CONFIG.galaxy.minStarDist;
    for (let i = 0; i < galaxy.stars.length; i++) {
      for (let j = i + 1; j < galaxy.stars.length; j++) {
        const d = starDistance(galaxy.stars[i], galaxy.stars[j]);
        expect(d).toBeGreaterThanOrEqual(minD * 0.99); // small float tolerance
      }
    }
  });

  it('all stars have at least one adjacent star', () => {
    for (const star of galaxy.stars) {
      expect(star.adjacentIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('adjacency is bidirectional', () => {
    for (const star of galaxy.stars) {
      for (const adjId of star.adjacentIds) {
        expect(galaxy.stars[adjId].adjacentIds).toContain(star.id);
      }
    }
  });

  it('no star is adjacent to itself', () => {
    for (const star of galaxy.stars) {
      expect(star.adjacentIds).not.toContain(star.id);
    }
  });

  it('galaxy is fully connected (BFS from star 0)', () => {
    const visited = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const adj of galaxy.stars[cur].adjacentIds) {
        if (!visited.has(adj)) {
          visited.add(adj);
          queue.push(adj);
        }
      }
    }
    expect(visited.size).toBe(galaxy.stars.length);
  });

  it('planet counts are within spectral class range', () => {
    for (const star of galaxy.stars) {
      const spec = CONFIG.spectral[star.spectralClass];
      // Remnant black holes have reduced planet counts (0.5x)
      if (star.remnantType === 'blackHole') {
        expect(star.planetCount).toBeGreaterThanOrEqual(1);
      } else {
        expect(star.planetCount).toBeGreaterThanOrEqual(spec.minPlanets);
        expect(star.planetCount).toBeLessThanOrEqual(spec.maxPlanets);
      }
    }
  });

  it('has stellar remnants in configured ranges', () => {
    const bh = galaxy.stars.filter(s => s.remnantType === 'blackHole').length;
    const ns = galaxy.stars.filter(s => s.remnantType === 'neutronStar').length;
    const wd = galaxy.stars.filter(s => s.remnantType === 'whiteDwarf').length;
    expect(bh).toBeGreaterThanOrEqual(CONFIG.remnants.blackHoleCount[0]);
    expect(bh).toBeLessThanOrEqual(CONFIG.remnants.blackHoleCount[1]);
    expect(ns).toBeGreaterThanOrEqual(CONFIG.remnants.neutronStarCount[0]);
    expect(ns).toBeLessThanOrEqual(CONFIG.remnants.neutronStarCount[1]);
    expect(wd).toBeGreaterThanOrEqual(CONFIG.remnants.whiteDwarfCount[0]);
    expect(wd).toBeLessThanOrEqual(CONFIG.remnants.whiteDwarfCount[1]);
  });

  it('home star (id=0) is never a remnant', () => {
    expect(galaxy.stars[0].remnantType).toBeNull();
  });

  it('neutron stars are marked as pulsars', () => {
    for (const star of galaxy.stars) {
      if (star.remnantType === 'neutronStar') {
        expect(star.isPulsar).toBe(true);
        expect(star.pulseRate).toBeGreaterThan(0);
      }
    }
  });

  it('hasBelt and hasComets are booleans', () => {
    for (const star of galaxy.stars) {
      expect(typeof star.hasBelt).toBe('boolean');
      expect(typeof star.hasComets).toBe('boolean');
    }
  });

  it('different seeds produce different galaxies', () => {
    const g2 = generateGalaxy(999);
    expect(g2.stars[0].name).not.toBe(galaxy.stars[0].name);
  });
});

// ── starDistance ──

describe('starDistance', () => {
  it('returns 0 for same point', () => {
    const s = { position: { x: 5, y: 3, z: 1 } };
    expect(starDistance(s, s)).toBe(0);
  });

  it('calculates correct distance for known values', () => {
    const a = { position: { x: 0, y: 0, z: 0 } };
    const b = { position: { x: 3, y: 4, z: 0 } };
    expect(starDistance(a, b)).toBe(5);
  });

  it('is symmetric', () => {
    const a = { position: { x: 1, y: 2, z: 3 } };
    const b = { position: { x: 4, y: 5, z: 6 } };
    expect(starDistance(a, b)).toBe(starDistance(b, a));
  });

  it('satisfies triangle inequality', () => {
    const a = { position: { x: 0, y: 0, z: 0 } };
    const b = { position: { x: 3, y: 0, z: 0 } };
    const c = { position: { x: 5, y: 4, z: 0 } };
    expect(starDistance(a, c)).toBeLessThanOrEqual(starDistance(a, b) + starDistance(b, c) + 0.001);
  });
});

// ── generatePlanets ──

describe('generatePlanets', () => {
  const galaxy = generateGalaxy(42);
  const star = galaxy.stars[0];
  const planets = generatePlanets(star);

  it('is deterministic', () => {
    const p2 = generatePlanets(star);
    expect(p2.length).toBe(planets.length);
    for (let i = 0; i < planets.length; i++) {
      expect(p2[i].name).toBe(planets[i].name);
      expect(p2[i].type).toBe(planets[i].type);
      expect(p2[i].seed).toBe(planets[i].seed);
    }
  });

  it('generates the correct number of planets', () => {
    expect(planets.length).toBe(star.planetCount);
  });

  it('all planets have valid types', () => {
    for (const p of planets) {
      expect(VALID_PLANET_TYPES).toContain(p.type);
    }
  });

  it('planet names include star name', () => {
    for (const p of planets) {
      expect(p.name.startsWith(star.name)).toBe(true);
    }
  });

  it('planet attributes are within config ranges', () => {
    for (const p of planets) {
      const pt = CONFIG.planetTypes[p.type];
      expect(p.size).toBeGreaterThanOrEqual(pt.sizeRange[0]);
      expect(p.size).toBeLessThanOrEqual(pt.sizeRange[1]);
      expect(p.habitability).toBeGreaterThanOrEqual(pt.habRange[0]);
      expect(p.habitability).toBeLessThanOrEqual(pt.habRange[1]);
      expect(p.metalRichness).toBeGreaterThanOrEqual(pt.metalRange[0]);
      expect(p.metalRichness).toBeLessThanOrEqual(pt.metalRange[1]);
      expect(pt.atmOptions).toContain(p.atmosphere);
    }
  });

  it('orbit radii are increasing', () => {
    for (let i = 1; i < planets.length; i++) {
      expect(planets[i].orbitRadius).toBeGreaterThan(planets[i - 1].orbitRadius);
    }
  });

  it('orbit speeds decrease outward (Keplerian)', () => {
    for (let i = 1; i < planets.length; i++) {
      expect(planets[i].orbitSpeed).toBeLessThan(planets[i - 1].orbitSpeed);
    }
  });

  it('shader types correspond to planet types', () => {
    for (const p of planets) {
      expect(p.shaderType).toBe(CONFIG.planetTypes[p.type].shader);
    }
  });

  it('texture paths are from the configured set', () => {
    for (const p of planets) {
      const pt = CONFIG.planetTypes[p.type];
      expect(pt.textures).toContain(p.texturePath);
    }
  });

  it('moons have valid attributes when present', () => {
    for (const p of planets) {
      for (const m of p.moons) {
        expect(m.orbitRadius).toBeGreaterThan(0);
        expect(m.orbitSpeed).toBeGreaterThan(0);
        expect(m.size).toBeGreaterThan(0);
        expect(m.orbitPhase).toBeGreaterThanOrEqual(0);
        expect(m.orbitPhase).toBeLessThan(Math.PI * 2);
      }
    }
  });

  it('gas giants can have rings', () => {
    // Test across many stars
    let foundRingedGasGiant = false;
    for (const s of galaxy.stars.slice(0, 30)) {
      for (const p of generatePlanets(s)) {
        if (p.type === 'gas_giant' && p.hasRings) foundRingedGasGiant = true;
      }
    }
    expect(foundRingedGasGiant).toBe(true);
  });

  it('generates planets for multiple stars without error', () => {
    for (const s of galaxy.stars) {
      const ps = generatePlanets(s);
      expect(ps.length).toBe(s.planetCount);
    }
  });
});

// ── generateAsteroidBelt ──

describe('generateAsteroidBelt', () => {
  it('returns null for a single-planet system', () => {
    const fakeStar = { seed: 12345 };
    const oneplanet = [{ orbitRadius: 10 }];
    expect(generateAsteroidBelt(fakeStar, oneplanet)).toBeNull();
  });

  it('returns null or a valid belt object', () => {
    const galaxy = generateGalaxy(42);
    for (const star of galaxy.stars) {
      const planets = generatePlanets(star);
      const belt = generateAsteroidBelt(star, planets);
      if (belt !== null) {
        expect(belt.beltInnerRadius).toBeGreaterThan(0);
        expect(belt.beltOuterRadius).toBeGreaterThan(belt.beltInnerRadius);
        expect(belt.beltSeed).toBeTypeOf('number');
      }
    }
  });

  it('is deterministic per star', () => {
    const galaxy = generateGalaxy(42);
    const star = galaxy.stars[5];
    const planets = generatePlanets(star);
    const belt1 = generateAsteroidBelt(star, planets);
    const belt2 = generateAsteroidBelt(star, planets);
    expect(belt1).toEqual(belt2);
  });

  it('~25% of systems have belts', () => {
    const galaxy = generateGalaxy(42);
    let withBelt = 0;
    for (const star of galaxy.stars) {
      const planets = generatePlanets(star);
      if (generateAsteroidBelt(star, planets) !== null) withBelt++;
    }
    // Allow wide margin since it's stochastic
    expect(withBelt).toBeGreaterThan(5);
    expect(withBelt).toBeLessThan(galaxy.stars.length * 0.5);
  });
});

// ── generateComets ──

describe('generateComets', () => {
  it('returns an array', () => {
    const galaxy = generateGalaxy(42);
    const comets = generateComets(galaxy.stars[0]);
    expect(Array.isArray(comets)).toBe(true);
  });

  it('is deterministic per star', () => {
    const galaxy = generateGalaxy(42);
    const star = galaxy.stars[3];
    expect(generateComets(star)).toEqual(generateComets(star));
  });

  it('comets have valid orbital parameters', () => {
    const galaxy = generateGalaxy(42);
    for (const star of galaxy.stars.slice(0, 20)) {
      for (const c of generateComets(star)) {
        expect(c.semiMajorAxis).toBeGreaterThan(0);
        expect(c.eccentricity).toBeGreaterThanOrEqual(0);
        expect(c.eccentricity).toBeLessThan(1);
        expect(c.orbitPhase).toBeGreaterThanOrEqual(0);
        expect(c.orbitPhase).toBeLessThan(Math.PI * 2);
      }
    }
  });

  it('comet count is within configured range', () => {
    const galaxy = generateGalaxy(42);
    for (const star of galaxy.stars.slice(0, 20)) {
      const comets = generateComets(star);
      // Count can be 0 if all individual chance checks fail
      expect(comets.length).toBeLessThanOrEqual(CONFIG.comets.maxPerSystem);
    }
  });
});
