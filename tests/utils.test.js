import { describe, it, expect } from 'vitest';
import {
  mulberry32, hashInt, lerp, clamp,
  genStarName, genClusterName, pickSpectralClass, easeInOutCubic,
  STAR_PREFIXES, STAR_SUFFIXES, CLUSTER_ADJ, CLUSTER_NOUN,
} from '../ho/js/utils.js';

// ── mulberry32 PRNG ──

describe('mulberry32', () => {
  it('returns a function', () => {
    expect(typeof mulberry32(1)).toBe('function');
  });

  it('is deterministic (same seed → same sequence)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('has reasonable distribution (no extreme clustering)', () => {
    const rng = mulberry32(999);
    const buckets = new Array(10).fill(0);
    const N = 10000;
    for (let i = 0; i < N; i++) {
      buckets[Math.floor(rng() * 10)]++;
    }
    // Each bucket should have roughly N/10 = 1000 entries (±30%)
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });
});

// ── hashInt ──

describe('hashInt', () => {
  it('is deterministic', () => {
    expect(hashInt(10, 20)).toBe(hashInt(10, 20));
    expect(hashInt(0, 0)).toBe(hashInt(0, 0));
  });

  it('returns a non-negative integer', () => {
    for (let a = 0; a < 50; a++) {
      for (let b = 0; b < 50; b++) {
        const h = hashInt(a, b);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(h)).toBe(true);
      }
    }
  });

  it('is not symmetric (hashInt(a,b) !== hashInt(b,a) in general)', () => {
    let asymmetric = 0;
    for (let i = 1; i < 20; i++) {
      if (hashInt(i, i + 1) !== hashInt(i + 1, i)) asymmetric++;
    }
    expect(asymmetric).toBeGreaterThan(0);
  });

  it('produces different values for sequential inputs', () => {
    const values = new Set();
    for (let i = 0; i < 100; i++) {
      values.add(hashInt(42, i));
    }
    // At least 95 unique values out of 100
    expect(values.size).toBeGreaterThan(95);
  });
});

// ── lerp ──

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b at t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it('extrapolates beyond [0,1]', () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

// ── clamp ──

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to lo when below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to hi when above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles equal lo and hi', () => {
    expect(clamp(5, 7, 7)).toBe(7);
  });
});

// ── genStarName ──

describe('genStarName', () => {
  it('is deterministic', () => {
    expect(genStarName(42)).toBe(genStarName(42));
  });

  it('returns a non-empty string', () => {
    for (let i = 0; i < 50; i++) {
      const name = genStarName(i);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('combines prefix and suffix from known arrays', () => {
    for (let i = 0; i < 50; i++) {
      const name = genStarName(i);
      const hasValidPrefix = STAR_PREFIXES.some(p => name.startsWith(p));
      const hasValidSuffix = STAR_SUFFIXES.some(s => name.endsWith(s));
      expect(hasValidPrefix).toBe(true);
      expect(hasValidSuffix).toBe(true);
    }
  });

  it('different seeds can produce different names', () => {
    const names = new Set();
    for (let i = 0; i < 100; i++) names.add(genStarName(i));
    expect(names.size).toBeGreaterThan(10);
  });
});

// ── genClusterName ──

describe('genClusterName', () => {
  it('is deterministic', () => {
    expect(genClusterName(7)).toBe(genClusterName(7));
  });

  it('returns a two-word name', () => {
    for (let i = 0; i < 50; i++) {
      const name = genClusterName(i);
      const parts = name.split(' ');
      expect(parts.length).toBe(2);
      expect(CLUSTER_ADJ).toContain(parts[0]);
      expect(CLUSTER_NOUN).toContain(parts[1]);
    }
  });
});

// ── pickSpectralClass ──

describe('pickSpectralClass', () => {
  const VALID_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

  it('returns a valid spectral class', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      expect(VALID_CLASSES).toContain(pickSpectralClass(rng));
    }
  });

  it('is deterministic with the same RNG state', () => {
    const a = pickSpectralClass(mulberry32(42));
    const b = pickSpectralClass(mulberry32(42));
    expect(a).toBe(b);
  });

  it('M class is most common (~55%)', () => {
    const counts = {};
    for (const c of VALID_CLASSES) counts[c] = 0;
    const rng = mulberry32(123);
    const N = 10000;
    for (let i = 0; i < N; i++) counts[pickSpectralClass(rng)]++;
    // M should be the most frequent
    expect(counts['M']).toBeGreaterThan(counts['K']);
    expect(counts['M']).toBeGreaterThan(counts['G']);
    // M should be roughly 50-60%
    expect(counts['M'] / N).toBeGreaterThan(0.45);
    expect(counts['M'] / N).toBeLessThan(0.65);
    // O should be rarest
    expect(counts['O']).toBeLessThan(counts['M']);
  });
});

// ── easeInOutCubic ──

describe('easeInOutCubic', () => {
  it('maps 0 → 0', () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it('maps 1 → 1', () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('maps 0.5 → 0.5', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it('is monotonically increasing', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.01) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('is symmetric around 0.5', () => {
    for (let t = 0; t < 0.5; t += 0.05) {
      const lo = easeInOutCubic(t);
      const hi = easeInOutCubic(1 - t);
      expect(lo + hi).toBeCloseTo(1, 10);
    }
  });
});
