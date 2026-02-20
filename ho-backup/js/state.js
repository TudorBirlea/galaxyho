const SAVE_KEY = 'galaxyho_save';

export function createState(seed) {
  return { galaxySeed: seed, visitedStars: new Set(), reachableStars: new Set([0]), currentView: 'galaxy', currentStarId: null };
}

export function saveState(state) {
  const s = { ...state, visitedStars: [...state.visitedStars], reachableStars: [...state.reachableStars] };
  localStorage.setItem(SAVE_KEY, JSON.stringify(s));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.reachableStars) return null; // old format, start fresh
    s.visitedStars = new Set(s.visitedStars);
    s.reachableStars = new Set(s.reachableStars);
    return s;
  } catch { return null; }
}
