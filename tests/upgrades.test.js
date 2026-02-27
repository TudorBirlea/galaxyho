import { describe, it, expect } from 'vitest';
import { UPGRADE_TREE, purchaseUpgrade } from '../ho/js/upgrades.js';

function makeState(data = 1000, upgrades = {}) {
  return {
    data,
    upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 0, ...upgrades },
  };
}

describe('purchaseUpgrade', () => {
  it('purchases tier 1 successfully', () => {
    const state = makeState(1000);
    const cost = UPGRADE_TREE.engines.tiers[0].cost; // 50
    const result = purchaseUpgrade('engines', 1, state);
    expect(result).toBe(true);
    expect(state.upgrades.engines).toBe(1);
    expect(state.data).toBe(1000 - cost);
  });

  it('purchases tier 2 after tier 1', () => {
    const state = makeState(1000, { engines: 1 });
    const cost = UPGRADE_TREE.engines.tiers[1].cost; // 120
    const result = purchaseUpgrade('engines', 2, state);
    expect(result).toBe(true);
    expect(state.upgrades.engines).toBe(2);
    expect(state.data).toBe(1000 - cost);
  });

  it('purchases tier 3 after tier 2', () => {
    const state = makeState(1000, { engines: 2 });
    const cost = UPGRADE_TREE.engines.tiers[2].cost; // 250
    const result = purchaseUpgrade('engines', 3, state);
    expect(result).toBe(true);
    expect(state.upgrades.engines).toBe(3);
    expect(state.data).toBe(1000 - cost);
  });

  it('rejects tier 2 without tier 1 (prerequisite)', () => {
    const state = makeState(1000);
    const result = purchaseUpgrade('engines', 2, state);
    expect(result).toBe(false);
    expect(state.upgrades.engines).toBe(0);
    expect(state.data).toBe(1000); // no deduction
  });

  it('rejects tier 3 without tier 2', () => {
    const state = makeState(1000, { sensors: 1 });
    const result = purchaseUpgrade('sensors', 3, state);
    expect(result).toBe(false);
    expect(state.upgrades.sensors).toBe(1);
  });

  it('rejects already-owned tier', () => {
    const state = makeState(1000, { comms: 2 });
    const result = purchaseUpgrade('comms', 2, state);
    expect(result).toBe(false);
    expect(state.data).toBe(1000);
  });

  it('rejects re-purchasing a lower tier', () => {
    const state = makeState(1000, { fuel_systems: 2 });
    const result = purchaseUpgrade('fuel_systems', 1, state);
    expect(result).toBe(false);
  });

  it('rejects insufficient data', () => {
    const state = makeState(10); // only 10 data
    const result = purchaseUpgrade('engines', 1, state);
    expect(result).toBe(false);
    expect(state.data).toBe(10); // unchanged
    expect(state.upgrades.engines).toBe(0);
  });

  it('rejects invalid category', () => {
    const state = makeState(1000);
    const result = purchaseUpgrade('weapons', 1, state);
    expect(result).toBe(false);
  });

  it('rejects tier 0', () => {
    const state = makeState(1000);
    const result = purchaseUpgrade('engines', 0, state);
    expect(result).toBe(false);
  });

  it('rejects tier 4 (beyond max)', () => {
    const state = makeState(1000, { engines: 3 });
    const result = purchaseUpgrade('engines', 4, state);
    expect(result).toBe(false);
  });

  it('works for all 4 categories tier 1', () => {
    for (const cat of ['engines', 'sensors', 'fuel_systems', 'comms']) {
      const state = makeState(1000);
      expect(purchaseUpgrade(cat, 1, state)).toBe(true);
      expect(state.upgrades[cat]).toBe(1);
    }
  });

  it('deducts exact tier cost', () => {
    for (const [cat, catData] of Object.entries(UPGRADE_TREE)) {
      for (let tier = 0; tier < catData.tiers.length; tier++) {
        const prevUpgrades = { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 };
        prevUpgrades[cat] = tier; // owns previous tier
        const state = makeState(5000, prevUpgrades);
        const cost = catData.tiers[tier].cost;
        purchaseUpgrade(cat, tier + 1, state);
        expect(state.data).toBe(5000 - cost);
      }
    }
  });
});
