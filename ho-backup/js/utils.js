export function mulberry32(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function hashInt(a, b) { let h = (a * 2654435761) ^ (b * 340573321); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^ (h >>> 16)) >>> 0; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export const STAR_PREFIXES = ['Alph','Bet','Cep','Dra','Eri','For','Gem','Hyd','Ind','Kep','Lyr','Mir','Nex','Ori','Pol','Rig','Sig','Tau','Vel','Xen','Zet'];
export const STAR_SUFFIXES = ['a','ar','ax','ei','en','ia','is','on','or','um','us','ix'];
export const CLUSTER_ADJ = ['Crimson','Azure','Golden','Silver','Obsidian','Verdant','Amber','Cobalt','Ivory','Scarlet','Violet','Ashen'];
export const CLUSTER_NOUN = ['Reach','Expanse','Drift','Veil','Crown','Deep','Haven','Nexus','Rift','Gate','Abyss','Arc'];
export const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
export const SPECIALS = ['Ancient Ruins Detected','Rare Element Deposits','Anomalous Signals','Crystalline Formations','Subterranean Caverns','Magnetic Anomaly'];

function genName(seed, prefixes, suffixes) {
  const rng = mulberry32(seed);
  return prefixes[Math.floor(rng() * prefixes.length)] + suffixes[Math.floor(rng() * suffixes.length)];
}

export function genStarName(seed) { return genName(seed, STAR_PREFIXES, STAR_SUFFIXES); }

export function genClusterName(seed) {
  const rng = mulberry32(seed);
  return CLUSTER_ADJ[Math.floor(rng() * CLUSTER_ADJ.length)] + ' ' + CLUSTER_NOUN[Math.floor(rng() * CLUSTER_NOUN.length)];
}

export function pickSpectralClass(rng) {
  const r = rng();
  if (r < 0.55) return 'M'; if (r < 0.73) return 'K'; if (r < 0.85) return 'G';
  if (r < 0.92) return 'F'; if (r < 0.96) return 'A'; if (r < 0.99) return 'B'; return 'O';
}
