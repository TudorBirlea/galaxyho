import { describe, it, expect } from 'vitest';
import { CONFIG, VERSION } from '../ho/js/config.js';
import { UPGRADE_TREE } from '../ho/js/upgrades.js';

const SPECTRAL_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
const PLANET_TYPES = ['terran', 'desert', 'ice', 'gas_giant', 'lava', 'ocean', 'water'];

// ── Version ──

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});

// ── Galaxy Config ──

describe('CONFIG.galaxy', () => {
  it('has valid star generation params', () => {
    const g = CONFIG.galaxy;
    expect(g.starCount).toBeGreaterThan(0);
    expect(g.fieldRadius).toBeGreaterThan(0);
    expect(g.fieldHeight).toBeGreaterThan(0);
    expect(g.minStarDist).toBeGreaterThan(0);
    expect(g.maxConnections).toBeGreaterThan(0);
    expect(g.connectionRange).toBeGreaterThan(g.minStarDist);
  });
});

// ── Spectral Classes ──

describe('CONFIG.spectral', () => {
  it('has all 7 spectral classes', () => {
    for (const cls of SPECTRAL_CLASSES) {
      expect(CONFIG.spectral).toHaveProperty(cls);
    }
  });

  it.each(SPECTRAL_CLASSES)('class %s has required fields', (cls) => {
    const s = CONFIG.spectral[cls];
    expect(s.color).toBeTypeOf('number');
    expect(s.tempK).toBeGreaterThan(0);
    expect(s.tempLabel).toBeTypeOf('string');
    expect(s.starScale).toBeGreaterThan(0);
    expect(s.spriteSize).toBeGreaterThan(0);
    expect(s.minPlanets).toBeGreaterThanOrEqual(0);
    expect(s.maxPlanets).toBeGreaterThanOrEqual(s.minPlanets);
  });

  it('temperatures decrease from O to M', () => {
    for (let i = 0; i < SPECTRAL_CLASSES.length - 1; i++) {
      const a = CONFIG.spectral[SPECTRAL_CLASSES[i]].tempK;
      const b = CONFIG.spectral[SPECTRAL_CLASSES[i + 1]].tempK;
      expect(a).toBeGreaterThan(b);
    }
  });
});

// ── Planet Types ──

describe('CONFIG.planetTypes', () => {
  it('has all 7 planet types', () => {
    for (const type of PLANET_TYPES) {
      expect(CONFIG.planetTypes).toHaveProperty(type);
    }
  });

  it.each(PLANET_TYPES)('type %s has required fields', (type) => {
    const p = CONFIG.planetTypes[type];
    expect(p.shader).toBeTypeOf('number');
    expect(p.label).toBeTypeOf('string');
    expect(p.sizeRange).toHaveLength(2);
    expect(p.sizeRange[0]).toBeLessThanOrEqual(p.sizeRange[1]);
    expect(p.habRange).toHaveLength(2);
    expect(p.habRange[0]).toBeLessThanOrEqual(p.habRange[1]);
    expect(p.metalRange).toHaveLength(2);
    expect(p.metalRange[0]).toBeLessThanOrEqual(p.metalRange[1]);
    expect(p.atmOptions.length).toBeGreaterThan(0);
    expect(p.textures.length).toBeGreaterThan(0);
    expect(p.atmosCol).toHaveLength(3);
    expect(p.atmosStr).toBeTypeOf('number');
    expect(p.scatter).toBeDefined();
  });

  it('each shader ID is unique per type', () => {
    const shaders = PLANET_TYPES.map(t => CONFIG.planetTypes[t].shader);
    expect(new Set(shaders).size).toBe(PLANET_TYPES.length);
  });
});

// ── Gameplay Config ──

describe('CONFIG.gameplay', () => {
  it('has valid fuel economy values', () => {
    const g = CONFIG.gameplay;
    expect(g.baseFuel).toBeGreaterThan(0);
    expect(g.baseMaxFuel).toBeGreaterThan(0);
    expect(g.fuelPerLy).toBeGreaterThan(0);
    expect(g.baseRegenRate).toBeGreaterThan(0);
    expect(g.lowFuelThreshold).toBeGreaterThan(0);
    expect(g.lowFuelThreshold).toBeLessThan(g.baseMaxFuel);
  });

  it('has fuel ranges for every planet type', () => {
    for (const type of PLANET_TYPES) {
      const range = CONFIG.gameplay.fuelByPlanetType[type];
      expect(range).toBeDefined();
      expect(range).toHaveLength(2);
      expect(range[0]).toBeLessThanOrEqual(range[1]);
      expect(range[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('event chance is between 0 and 1', () => {
    expect(CONFIG.gameplay.eventChance).toBeGreaterThan(0);
    expect(CONFIG.gameplay.eventChance).toBeLessThanOrEqual(1);
  });

  it('scan data reward is a valid range', () => {
    const r = CONFIG.gameplay.scanDataReward;
    expect(r).toHaveLength(2);
    expect(r[0]).toBeLessThanOrEqual(r[1]);
    expect(r[0]).toBeGreaterThan(0);
  });
});

// ── Camera Config ──

describe('CONFIG.camera', () => {
  for (const view of ['galaxy', 'system']) {
    it(`${view} view has valid camera params`, () => {
      const c = CONFIG.camera[view];
      expect(c.near).toBeLessThan(c.far);
      expect(c.fov).toBeGreaterThan(0);
      expect(c.fov).toBeLessThan(180);
      expect(c.minDist).toBeLessThan(c.maxDist);
    });
  }
});

// ── Bloom Config ──

describe('CONFIG.bloom', () => {
  it('has valid bloom parameters', () => {
    expect(CONFIG.bloom.threshold).toBeGreaterThanOrEqual(0);
    expect(CONFIG.bloom.threshold).toBeLessThanOrEqual(1);
    expect(CONFIG.bloom.strength).toBeGreaterThan(0);
    expect(CONFIG.bloom.radius).toBeGreaterThan(0);
  });
});

// ── Remnant Config ──

describe('CONFIG.remnants', () => {
  it('black hole count range is valid', () => {
    const [min, max] = CONFIG.remnants.blackHoleCount;
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeGreaterThanOrEqual(min);
  });

  it('neutron star count range is valid', () => {
    const [min, max] = CONFIG.remnants.neutronStarCount;
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeGreaterThanOrEqual(min);
  });

  it('white dwarf count range is valid', () => {
    const [min, max] = CONFIG.remnants.whiteDwarfCount;
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeGreaterThanOrEqual(min);
  });
});

// ── Upgrade Tree Config ──

describe('UPGRADE_TREE', () => {
  const CATEGORIES = ['engines', 'sensors', 'fuel_systems', 'comms'];

  it('has exactly 4 categories', () => {
    expect(Object.keys(UPGRADE_TREE)).toHaveLength(4);
  });

  it.each(CATEGORIES)('category %s has 3 tiers with increasing costs', (cat) => {
    const category = UPGRADE_TREE[cat];
    expect(category.label).toBeTypeOf('string');
    expect(category.icon).toBeTypeOf('string');
    expect(category.tiers).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const tier = category.tiers[i];
      expect(tier.id).toBeTypeOf('string');
      expect(tier.label).toBeTypeOf('string');
      expect(tier.description).toBeTypeOf('string');
      expect(tier.cost).toBeGreaterThan(0);
    }
    // Costs should increase across tiers
    expect(category.tiers[0].cost).toBeLessThan(category.tiers[1].cost);
    expect(category.tiers[1].cost).toBeLessThan(category.tiers[2].cost);
  });
});

// ── Ship Config ──

describe('CONFIG.ship', () => {
  it('has valid ship parameters', () => {
    const s = CONFIG.ship;
    expect(s.meshScale).toBeGreaterThan(0);
    expect(s.thrusterParticleCount).toBeGreaterThan(0);
    expect(s.thrusterLifetime).toBeGreaterThan(0);
    expect(s.parkingOrbitBuffer).toBeGreaterThan(0);
    expect(s.burnDuration).toBeGreaterThan(0);
    expect(s.dockedOrbitMult).toBeGreaterThan(1);
  });
});

// ── Asteroid Belt Config ──

describe('CONFIG.asteroidBelt', () => {
  it('has valid asteroid belt parameters', () => {
    const ab = CONFIG.asteroidBelt;
    expect(ab.chance).toBeGreaterThan(0);
    expect(ab.chance).toBeLessThanOrEqual(1);
    expect(ab.rockCount).toBeGreaterThan(0);
    expect(ab.largeRockCount).toBeGreaterThan(0);
    expect(ab.collisionInterval).toBeGreaterThan(0);
  });
});

// ── Comet Config ──

describe('CONFIG.comets', () => {
  it('has valid comet parameters', () => {
    const c = CONFIG.comets;
    expect(c.chance).toBeGreaterThan(0);
    expect(c.chance).toBeLessThanOrEqual(1);
    expect(c.minPerSystem).toBeGreaterThanOrEqual(0);
    expect(c.maxPerSystem).toBeGreaterThanOrEqual(c.minPerSystem);
    expect(c.semiMajorMin).toBeLessThan(c.semiMajorMax);
    expect(c.eccentricity[0]).toBeLessThan(c.eccentricity[1]);
  });
});
