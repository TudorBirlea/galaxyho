import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CONFIG } from '../ho/js/config.js';

// Mock localStorage before importing state module
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, value) => { store[key] = value; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

const { createState, saveState, loadState } = await import('../ho/js/state.js');

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// ── createState ──

describe('createState', () => {
  it('returns an object with all required fields', () => {
    const state = createState(42);
    expect(state.galaxySeed).toBe(42);
    expect(state.visitedStars).toBeInstanceOf(Set);
    expect(state.reachableStars).toBeInstanceOf(Set);
    expect(state.reachableStars.has(0)).toBe(true);
    expect(state.currentView).toBe('galaxy');
    expect(state.currentStarId).toBeNull();
    expect(state.shipStarId).toBe(0);
    expect(state.shipPlanetId).toBeNull();
    expect(state.scannedPlanets).toBeInstanceOf(Set);
    expect(state.planetActions).toEqual({});
    expect(state.journal).toEqual([]);
    expect(state.fuel).toBe(CONFIG.gameplay.baseFuel);
    expect(state.data).toBe(CONFIG.gameplay.startingData);
    expect(state.upgrades).toEqual({ engines: 0, sensors: 0, fuel_systems: 0, comms: 0 });
    expect(state.resolvedEvents).toEqual({});
    expect(state.totalScans).toBe(0);
    expect(state.totalJumps).toBe(0);
  });

  it('starts with empty visited stars and star 0 reachable', () => {
    const state = createState(99);
    expect(state.visitedStars.size).toBe(0);
    expect(state.reachableStars.size).toBe(1);
    expect(state.reachableStars.has(0)).toBe(true);
  });

  it('uses different seeds correctly', () => {
    const s1 = createState(1);
    const s2 = createState(2);
    expect(s1.galaxySeed).toBe(1);
    expect(s2.galaxySeed).toBe(2);
  });
});

// ── saveState + loadState round-trip ──

describe('save/load round-trip', () => {
  it('preserves all fields through serialization', () => {
    const original = createState(42);
    original.visitedStars.add(0);
    original.visitedStars.add(5);
    original.reachableStars.add(1);
    original.reachableStars.add(2);
    original.fuel = 75;
    original.data = 42;
    original.totalJumps = 3;
    original.totalScans = 7;
    original.upgrades.engines = 2;
    original.resolvedEvents['0-1'] = true;
    original.planetActions['0-0'] = { scanned: true, mined: false, explored: false };
    original.journal.push('Visited Alphax');

    saveState(original);
    const loaded = loadState();

    expect(loaded).not.toBeNull();
    expect(loaded.galaxySeed).toBe(42);
    expect(loaded.visitedStars).toBeInstanceOf(Set);
    expect(loaded.visitedStars.has(0)).toBe(true);
    expect(loaded.visitedStars.has(5)).toBe(true);
    expect(loaded.reachableStars).toBeInstanceOf(Set);
    expect(loaded.reachableStars.has(0)).toBe(true);
    expect(loaded.reachableStars.has(1)).toBe(true);
    expect(loaded.fuel).toBe(75);
    expect(loaded.data).toBe(42);
    expect(loaded.totalJumps).toBe(3);
    expect(loaded.totalScans).toBe(7);
    expect(loaded.upgrades.engines).toBe(2);
    expect(loaded.resolvedEvents['0-1']).toBe(true);
    expect(loaded.planetActions['0-0']).toEqual({ scanned: true, mined: false, explored: false });
    expect(loaded.journal).toEqual(['Visited Alphax']);
  });

  it('resets currentView to galaxy and currentStarId to null on load', () => {
    const state = createState(42);
    state.currentView = 'system';
    state.currentStarId = 5;
    saveState(state);
    const loaded = loadState();
    expect(loaded.currentView).toBe('galaxy');
    expect(loaded.currentStarId).toBeNull();
  });
});

// ── loadState error handling ──

describe('loadState error handling', () => {
  it('returns null when no save exists', () => {
    expect(loadState()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    localStorageMock.setItem('galaxyho_save', 'not json{{{');
    expect(loadState()).toBeNull();
  });

  it('returns null for save missing required fields', () => {
    localStorageMock.setItem('galaxyho_save', JSON.stringify({ foo: 'bar' }));
    expect(loadState()).toBeNull();
  });
});

// ── v5 migration ──

describe('v5 migration', () => {
  it('adds gameplay fields to old saves without fuel', () => {
    const oldSave = {
      galaxySeed: 42,
      visitedStars: [0, 1],
      reachableStars: [0, 1, 2],
      shipStarId: 0,
      scannedPlanets: ['0-0', '1-1'],
    };
    localStorageMock.setItem('galaxyho_save', JSON.stringify(oldSave));
    const loaded = loadState();

    expect(loaded).not.toBeNull();
    expect(loaded.fuel).toBe(CONFIG.gameplay.baseFuel);
    expect(loaded.data).toBe(0);
    expect(loaded.upgrades).toEqual({ engines: 0, sensors: 0, fuel_systems: 0, comms: 0 });
    expect(loaded.resolvedEvents).toEqual({});
    expect(loaded.totalScans).toBe(0);
    expect(loaded.totalJumps).toBe(0);
  });
});

// ── v5.2 migration ──

describe('v5.2 migration', () => {
  it('converts scannedPlanets to planetActions', () => {
    const oldSave = {
      galaxySeed: 42,
      visitedStars: [0],
      reachableStars: [0, 1],
      shipStarId: 0,
      scannedPlanets: ['0-0', '0-1', '1-2'],
      fuel: 80,
      data: 10,
      upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 },
      resolvedEvents: {},
      totalScans: 3,
      totalJumps: 1,
      // No planetActions field — triggers migration
    };
    localStorageMock.setItem('galaxyho_save', JSON.stringify(oldSave));
    const loaded = loadState();

    expect(loaded).not.toBeNull();
    expect(loaded.planetActions).toBeDefined();
    expect(loaded.planetActions['0-0']).toEqual({ scanned: true, mined: false, explored: false });
    expect(loaded.planetActions['0-1']).toEqual({ scanned: true, mined: false, explored: false });
    expect(loaded.planetActions['1-2']).toEqual({ scanned: true, mined: false, explored: false });
  });

  it('does not overwrite existing planetActions', () => {
    const save = {
      galaxySeed: 42,
      visitedStars: [0],
      reachableStars: [0],
      shipStarId: 0,
      scannedPlanets: [],
      fuel: 80,
      data: 10,
      upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 },
      resolvedEvents: {},
      totalScans: 0,
      totalJumps: 0,
      planetActions: { '0-0': { scanned: true, mined: true, explored: true } },
    };
    localStorageMock.setItem('galaxyho_save', JSON.stringify(save));
    const loaded = loadState();

    expect(loaded.planetActions['0-0']).toEqual({ scanned: true, mined: true, explored: true });
  });
});
