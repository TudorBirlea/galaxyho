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
    journal: [],
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
    if (!s.reachableStars || s.shipStarId === undefined) return null; // incompatible format, fresh start
    s.visitedStars = new Set(s.visitedStars);
    s.reachableStars = new Set(s.reachableStars);
    s.scannedPlanets = new Set(s.scannedPlanets || []);
    s.journal = s.journal || [];
    s.currentView = 'galaxy'; // always start in galaxy view
    s.currentStarId = null;
    return s;
  } catch { return null; }
}
