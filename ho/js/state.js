import { CONFIG } from './config.js?v=5.0';

const SAVE_KEY = 'galaxyho_save';

export function createState(seed) {
  return {
    galaxySeed: seed,
    visitedStars: new Set(),
    reachableStars: new Set([0]),
    currentView: 'galaxy',
    currentStarId: null,
    shipStarId: 0,
    shipPlanetId: null,
    scannedPlanets: new Set(),
    planetActions: {}, // "starId-planetId": { scanned, mined, explored }
    journal: [],
    // v5 gameplay
    fuel: CONFIG.gameplay.baseFuel,
    data: CONFIG.gameplay.startingData,
    upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 },
    resolvedEvents: {},
    totalScans: 0,
    totalJumps: 0,
  };
}

export function saveState(state) {
  const s = {
    ...state,
    visitedStars: [...state.visitedStars],
    reachableStars: [...state.reachableStars],
    scannedPlanets: [...state.scannedPlanets],
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.reachableStars || s.shipStarId === undefined) return null;
    s.visitedStars = new Set(s.visitedStars);
    s.reachableStars = new Set(s.reachableStars);
    s.scannedPlanets = new Set(s.scannedPlanets || []);
    s.journal = s.journal || [];
    s.currentView = 'galaxy';
    s.currentStarId = null;
    // v5 migration: add gameplay fields for old saves
    if (s.fuel === undefined) {
      s.fuel = CONFIG.gameplay.baseFuel;
      s.data = 0;
      s.upgrades = { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 };
      s.resolvedEvents = {};
      s.totalScans = 0;
      s.totalJumps = 0;
    }
    // v5.2 migration: planetActions
    if (!s.planetActions) {
      s.planetActions = {};
      // Convert old scannedPlanets to planetActions
      for (const key of s.scannedPlanets) {
        s.planetActions[key] = { scanned: true, mined: false, explored: false };
      }
    }
    return s;
  } catch { return null; }
}
