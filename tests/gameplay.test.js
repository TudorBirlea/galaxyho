import { describe, it, expect } from 'vitest';
import {
  getUpgradeEffects, getMaxFuel, calculateJumpFuelCost, canJump,
  consumeFuel, addFuel, addData, updateSolarRegen,
  getFuelForPlanetType, rollPlanetFuel, rollScanData, rollMiningYield, rollExploreData,
} from '../ho/js/gameplay.js';
import { CONFIG } from '../ho/js/config.js';
import { generateGalaxy, generatePlanets } from '../ho/js/data.js';

function makeState(overrides = {}) {
  return {
    fuel: 100,
    data: 0,
    upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 },
    ...overrides,
  };
}

// ── getUpgradeEffects ──

describe('getUpgradeEffects', () => {
  it('returns base effects with no upgrades', () => {
    const e = getUpgradeEffects(makeState());
    expect(e.fuelCostMult).toBe(1.0);
    expect(e.jumpRange).toBe(1);
    expect(e.systemSpeedMult).toBe(1.0);
    expect(e.revealEvents).toBe(false);
    expect(e.successRateBonus).toBe(0);
    expect(e.orbitalScan).toBe(false);
    expect(e.maxFuelMult).toBe(1.0);
    expect(e.fuelGainMult).toBe(1.0);
    expect(e.solarRegen).toBe(false);
    expect(e.diplomacy).toBe(false);
    expect(e.dataGainMult).toBe(1.0);
    expect(e.beaconNetwork).toBe(false);
  });

  it('handles null upgrades gracefully', () => {
    const e = getUpgradeEffects({ upgrades: null });
    expect(e.fuelCostMult).toBe(1.0);
  });

  it('engines tier 1: 25% fuel cost reduction', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 1, sensors: 0, fuel_systems: 0, comms: 0 } }));
    expect(e.fuelCostMult).toBeCloseTo(0.75);
  });

  it('engines tier 2: extended jump range', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 2, sensors: 0, fuel_systems: 0, comms: 0 } }));
    expect(e.jumpRange).toBe(2);
    expect(e.fuelCostMult).toBeCloseTo(0.75); // tier 1 still applies
  });

  it('engines tier 3: cumulative fuel reduction + speed', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 3, sensors: 0, fuel_systems: 0, comms: 0 } }));
    expect(e.fuelCostMult).toBeCloseTo(0.75 * 0.67, 2); // ~0.5025
    expect(e.systemSpeedMult).toBe(1.5);
  });

  it('sensors tier 1: reveal events', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 1, fuel_systems: 0, comms: 0 } }));
    expect(e.revealEvents).toBe(true);
  });

  it('sensors tier 2: +10% success rate', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 2, fuel_systems: 0, comms: 0 } }));
    expect(e.successRateBonus).toBeCloseTo(0.10);
  });

  it('sensors tier 3: orbital scan', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 3, fuel_systems: 0, comms: 0 } }));
    expect(e.orbitalScan).toBe(true);
  });

  it('fuel_systems tier 1: +50% max fuel', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 1, comms: 0 } }));
    expect(e.maxFuelMult).toBe(1.5);
  });

  it('fuel_systems tier 2: +50% fuel gain', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 2, comms: 0 } }));
    expect(e.fuelGainMult).toBe(1.5);
  });

  it('fuel_systems tier 3: solar regen', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 3, comms: 0 } }));
    expect(e.solarRegen).toBe(true);
    expect(e.regenRate).toBe(0.5);
  });

  it('comms tier 1: diplomacy', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 1 } }));
    expect(e.diplomacy).toBe(true);
  });

  it('comms tier 2: +30% data', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 2 } }));
    expect(e.dataGainMult).toBe(1.3);
  });

  it('comms tier 3: beacon network', () => {
    const e = getUpgradeEffects(makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 3 } }));
    expect(e.beaconNetwork).toBe(true);
  });
});

// ── getMaxFuel ──

describe('getMaxFuel', () => {
  it('returns base max fuel with no upgrades', () => {
    expect(getMaxFuel(makeState())).toBe(CONFIG.gameplay.baseMaxFuel);
  });

  it('returns 150 with Tank Expansion', () => {
    const state = makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 1, comms: 0 } });
    expect(getMaxFuel(state)).toBe(Math.round(CONFIG.gameplay.baseMaxFuel * 1.5));
  });
});

// ── calculateJumpFuelCost ──

describe('calculateJumpFuelCost', () => {
  const starA = { position: { x: 0, y: 0, z: 0 } };
  const starB = { position: { x: 10, y: 0, z: 0 } };

  it('is proportional to distance', () => {
    const state = makeState();
    const cost = calculateJumpFuelCost(starA, starB, state);
    expect(cost).toBe(Math.round(10 * CONFIG.gameplay.fuelPerLy));
  });

  it('is reduced by fuel efficiency upgrade', () => {
    const base = calculateJumpFuelCost(starA, starB, makeState());
    const upgraded = calculateJumpFuelCost(starA, starB,
      makeState({ upgrades: { engines: 1, sensors: 0, fuel_systems: 0, comms: 0 } }));
    expect(upgraded).toBeLessThan(base);
  });

  it('is further reduced by tier 3 engines', () => {
    const tier1 = calculateJumpFuelCost(starA, starB,
      makeState({ upgrades: { engines: 1, sensors: 0, fuel_systems: 0, comms: 0 } }));
    const tier3 = calculateJumpFuelCost(starA, starB,
      makeState({ upgrades: { engines: 3, sensors: 0, fuel_systems: 0, comms: 0 } }));
    expect(tier3).toBeLessThan(tier1);
  });
});

// ── canJump ──

describe('canJump', () => {
  const starA = { position: { x: 0, y: 0, z: 0 } };
  const starB = { position: { x: 10, y: 0, z: 0 } };

  it('returns true when fuel is sufficient', () => {
    expect(canJump(starA, starB, makeState({ fuel: 1000 }))).toBe(true);
  });

  it('returns false when fuel is insufficient', () => {
    expect(canJump(starA, starB, makeState({ fuel: 1 }))).toBe(false);
  });

  it('returns true when fuel exactly equals cost', () => {
    const state = makeState();
    const cost = calculateJumpFuelCost(starA, starB, state);
    state.fuel = cost;
    expect(canJump(starA, starB, state)).toBe(true);
  });
});

// ── consumeFuel ──

describe('consumeFuel', () => {
  it('reduces fuel by the given amount', () => {
    const state = makeState({ fuel: 50 });
    consumeFuel(20, state);
    expect(state.fuel).toBe(30);
  });

  it('floors at 0', () => {
    const state = makeState({ fuel: 10 });
    consumeFuel(50, state);
    expect(state.fuel).toBe(0);
  });
});

// ── addFuel ──

describe('addFuel', () => {
  it('increases fuel', () => {
    const state = makeState({ fuel: 50 });
    addFuel(20, state);
    expect(state.fuel).toBe(70);
  });

  it('caps at max fuel', () => {
    const state = makeState({ fuel: 90 });
    addFuel(50, state);
    expect(state.fuel).toBe(getMaxFuel(state));
  });

  it('caps at upgraded max fuel', () => {
    const state = makeState({ fuel: 140, upgrades: { engines: 0, sensors: 0, fuel_systems: 1, comms: 0 } });
    addFuel(50, state);
    expect(state.fuel).toBe(150); // 100 * 1.5
  });
});

// ── addData ──

describe('addData', () => {
  it('increases data', () => {
    const state = makeState({ data: 10 });
    addData(5, state);
    expect(state.data).toBe(15);
  });

  it('applies dataGainMult from comms upgrade', () => {
    const state = makeState({ data: 0, upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 2 } });
    addData(10, state);
    expect(state.data).toBe(13); // 10 * 1.3
  });
});

// ── updateSolarRegen ──

describe('updateSolarRegen', () => {
  it('regenerates at base rate without upgrade', () => {
    const state = makeState({ fuel: 50 });
    updateSolarRegen(1.0, state);
    expect(state.fuel).toBeCloseTo(50 + CONFIG.gameplay.baseRegenRate);
  });

  it('regenerates at higher rate with Solar Collector', () => {
    const state = makeState({ fuel: 50, upgrades: { engines: 0, sensors: 0, fuel_systems: 3, comms: 0 } });
    updateSolarRegen(1.0, state);
    expect(state.fuel).toBeCloseTo(50.5); // rate = 0.5/s
  });

  it('caps at max fuel', () => {
    const state = makeState({ fuel: 99.9 });
    updateSolarRegen(10.0, state);
    expect(state.fuel).toBe(getMaxFuel(state));
  });
});

// ── getFuelForPlanetType ──

describe('getFuelForPlanetType', () => {
  it('returns correct ranges for each planet type', () => {
    for (const [type, range] of Object.entries(CONFIG.gameplay.fuelByPlanetType)) {
      expect(getFuelForPlanetType(type)).toEqual(range);
    }
  });

  it('returns default [2,6] for unknown type', () => {
    expect(getFuelForPlanetType('unicorn')).toEqual([2, 6]);
  });
});

// ── Deterministic Roll Functions ──

describe('roll functions', () => {
  const galaxy = generateGalaxy(42);
  const planets = generatePlanets(galaxy.stars[0]);
  const planet = planets[0];

  describe('rollPlanetFuel', () => {
    it('is deterministic', () => {
      expect(rollPlanetFuel(planet)).toBe(rollPlanetFuel(planet));
    });

    it('returns a positive value', () => {
      expect(rollPlanetFuel(planet)).toBeGreaterThan(0);
    });

    it('falls within the type fuel range', () => {
      const range = getFuelForPlanetType(planet.type);
      const value = rollPlanetFuel(planet);
      expect(value).toBeGreaterThanOrEqual(range[0]);
      expect(value).toBeLessThanOrEqual(range[1]);
    });
  });

  describe('rollScanData', () => {
    it('is deterministic', () => {
      expect(rollScanData(planet)).toBe(rollScanData(planet));
    });

    it('returns value in scan data range', () => {
      const [min, max] = CONFIG.gameplay.scanDataReward;
      const value = rollScanData(planet);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    });
  });

  describe('rollMiningYield', () => {
    it('is deterministic', () => {
      expect(rollMiningYield(planet)).toBe(rollMiningYield(planet));
    });

    it('returns at least 1', () => {
      expect(rollMiningYield(planet)).toBeGreaterThanOrEqual(1);
    });

    it('scales with metalRichness', () => {
      const lowMetal = { ...planet, metalRichness: 10 };
      const highMetal = { ...planet, metalRichness: 90 };
      // Same seed means same base roll, but different scaling
      expect(rollMiningYield(highMetal)).toBeGreaterThanOrEqual(rollMiningYield(lowMetal));
    });
  });

  describe('rollExploreData', () => {
    it('is deterministic', () => {
      expect(rollExploreData(planet)).toBe(rollExploreData(planet));
    });

    it('returns value in [3, 6]', () => {
      const value = rollExploreData(planet);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
    });
  });

  it('different planets produce different roll values', () => {
    const fuels = new Set(planets.map(p => rollPlanetFuel(p)));
    // With multiple planets, we expect at least some variety
    expect(fuels.size).toBeGreaterThan(1);
  });
});
