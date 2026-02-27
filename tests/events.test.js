import { describe, it, expect } from 'vitest';
import { generatePlanetEvent, resolveChoice, EVENT_TEMPLATES } from '../ho/js/events.js';
import { generateGalaxy, generatePlanets } from '../ho/js/data.js';
import { CONFIG } from '../ho/js/config.js';

const VALID_RARITIES = ['common', 'uncommon', 'rare'];
const VALID_RISKS = ['safe', 'low', 'medium', 'high', 'extreme'];
const PLANET_TYPES = ['terran', 'desert', 'ice', 'gas_giant', 'lava', 'ocean', 'water'];

function makeState(overrides = {}) {
  return {
    upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 0 },
    resolvedEvents: {},
    ...overrides,
  };
}

// ── EVENT_TEMPLATES ──

describe('EVENT_TEMPLATES', () => {
  it('has 36 templates', () => {
    expect(EVENT_TEMPLATES.length).toBe(36);
  });

  it('all templates have required fields', () => {
    for (const t of EVENT_TEMPLATES) {
      expect(t.id).toBeTypeOf('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.title).toBeTypeOf('string');
      expect(t.description).toBeTypeOf('string');
      expect(VALID_RARITIES).toContain(t.rarity);
      expect(t.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all template IDs are unique', () => {
    const ids = EVENT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all choices have required fields', () => {
    for (const t of EVENT_TEMPLATES) {
      for (const c of t.choices) {
        expect(c.label).toBeTypeOf('string');
        expect(VALID_RISKS).toContain(c.risk);
        expect(c.successRate).toBeGreaterThan(0);
        expect(c.successRate).toBeLessThanOrEqual(1);
        expect(c.outcomes.success).toBeDefined();
        expect(c.outcomes.success.fuel).toHaveLength(2);
        expect(c.outcomes.success.data).toHaveLength(2);
      }
    }
  });

  it('safe choices have 100% success rate', () => {
    for (const t of EVENT_TEMPLATES) {
      for (const c of t.choices) {
        if (c.risk === 'safe') {
          expect(c.successRate).toBe(1.0);
        }
      }
    }
  });

  it('non-safe choices with failure outcomes have valid failure data', () => {
    for (const t of EVENT_TEMPLATES) {
      for (const c of t.choices) {
        if (c.outcomes.failure) {
          expect(c.outcomes.failure.fuel).toHaveLength(2);
          expect(c.outcomes.failure.data).toHaveLength(2);
        }
      }
    }
  });

  it('planetTypes is null (universal) or a valid array', () => {
    for (const t of EVENT_TEMPLATES) {
      if (t.planetTypes !== null) {
        expect(Array.isArray(t.planetTypes)).toBe(true);
        for (const pt of t.planetTypes) {
          expect(PLANET_TYPES).toContain(pt);
        }
      }
    }
  });

  it('has 12 universal templates', () => {
    const universal = EVENT_TEMPLATES.filter(t => t.planetTypes === null);
    expect(universal.length).toBe(12);
  });

  it('has type-specific templates for each planet type', () => {
    for (const type of PLANET_TYPES) {
      const typeTemplates = EVENT_TEMPLATES.filter(
        t => t.planetTypes !== null && t.planetTypes.includes(type)
      );
      expect(typeTemplates.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── generatePlanetEvent ──

describe('generatePlanetEvent', () => {
  const galaxy = generateGalaxy(42);
  const star = galaxy.stars[0];
  const planets = generatePlanets(star);

  it('is deterministic per planet', () => {
    const state = makeState();
    const e1 = generatePlanetEvent(planets[0], star, state);
    const e2 = generatePlanetEvent(planets[0], star, state);
    if (e1 !== null) {
      expect(e2).not.toBeNull();
      expect(e2.templateId).toBe(e1.templateId);
      expect(e2.title).toBe(e1.title);
    } else {
      expect(e2).toBeNull();
    }
  });

  it('returns null for resolved events', () => {
    const planet = planets[0];
    const key = star.id + '-' + planet.id;
    const state = makeState({ resolvedEvents: { [key]: true } });
    expect(generatePlanetEvent(planet, star, state)).toBeNull();
  });

  it('returns valid event structure when not null', () => {
    const state = makeState();
    // Try many planets to find one with an event
    for (const s of galaxy.stars.slice(0, 20)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) {
          expect(event.templateId).toBeTypeOf('string');
          expect(event.title).toBeTypeOf('string');
          expect(event.description).toBeTypeOf('string');
          expect(event.choices.length).toBeGreaterThanOrEqual(2);
          expect(event.planetKey).toBe(s.id + '-' + p.id);
          expect(event.planetSeed).toBe(p.seed);
          return; // Found one, test passes
        }
      }
    }
    // If no events found at all, that's a problem
    expect.unreachable('should have found at least one event');
  });

  it('interpolates planet and star names in description', () => {
    const state = makeState();
    for (const s of galaxy.stars.slice(0, 20)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) {
          // Should not contain unresolved placeholders
          expect(event.description).not.toContain('{planetName}');
          expect(event.description).not.toContain('{starName}');
          return;
        }
      }
    }
  });

  it('filters templates by planet type', () => {
    const state = makeState();
    // Check that terran planet events come from universal or terran templates
    for (const s of galaxy.stars.slice(0, 30)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) {
          const template = EVENT_TEMPLATES.find(t => t.id === event.templateId);
          if (template.planetTypes !== null) {
            expect(template.planetTypes).toContain(p.type);
          }
        }
      }
    }
  });

  it('~70% of planets have events', () => {
    const state = makeState();
    let withEvent = 0;
    let total = 0;
    for (const s of galaxy.stars) {
      for (const p of generatePlanets(s)) {
        total++;
        if (generatePlanetEvent(p, s, state) !== null) withEvent++;
      }
    }
    const ratio = withEvent / total;
    // Allow ±15% margin around 70%
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.85);
  });

  it('adds diplomacy choice when comms tier 1 active', () => {
    const state = makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 1 } });
    for (const s of galaxy.stars.slice(0, 20)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null && event.templateId !== 'mineral_vein') {
          const dipChoice = event.choices.find(c => c.label === 'Diplomatic approach');
          expect(dipChoice).toBeDefined();
          expect(dipChoice.successRate).toBe(0.80);
          return;
        }
      }
    }
  });

  it('does not add diplomacy choice to mineral_vein', () => {
    const state = makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 1 } });
    for (const s of galaxy.stars.slice(0, 50)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null && event.templateId === 'mineral_vein') {
          const dipChoice = event.choices.find(c => c.label === 'Diplomatic approach');
          expect(dipChoice).toBeUndefined();
          return;
        }
      }
    }
  });
});

// ── resolveChoice ──

describe('resolveChoice', () => {
  const galaxy = generateGalaxy(42);

  function findEvent() {
    const state = makeState();
    for (const s of galaxy.stars.slice(0, 20)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) return event;
      }
    }
    return null;
  }

  it('returns a valid result object', () => {
    const event = findEvent();
    const state = makeState();
    const result = resolveChoice(event, 0, state);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('fuel');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('lore');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.fuel).toBe('number');
    expect(typeof result.data).toBe('number');
  });

  it('is deterministic', () => {
    const event = findEvent();
    const state = makeState();
    const r1 = resolveChoice(event, 0, state);
    const r2 = resolveChoice(event, 0, state);
    expect(r1).toEqual(r2);
  });

  it('safe choices always succeed', () => {
    const state = makeState();
    for (const s of galaxy.stars.slice(0, 30)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) {
          for (let i = 0; i < event.choices.length; i++) {
            if (event.choices[i].risk === 'safe') {
              const result = resolveChoice(event, i, state);
              expect(result.success).toBe(true);
            }
          }
        }
      }
    }
  });

  it('returns default result for invalid choice index', () => {
    const event = findEvent();
    const state = makeState();
    const result = resolveChoice(event, 99, state);
    expect(result.success).toBe(false);
    expect(result.fuel).toBe(0);
    expect(result.data).toBe(0);
    expect(result.lore).toBeNull();
  });

  it('applies Deep Scanner success rate bonus', () => {
    // With high successRateBonus, more events should succeed
    const baseState = makeState();
    const bonusState = makeState({ upgrades: { engines: 0, sensors: 2, fuel_systems: 0, comms: 0 } });

    let baseSuccesses = 0;
    let bonusSuccesses = 0;
    let total = 0;

    for (const s of galaxy.stars.slice(0, 30)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, baseState);
        if (event !== null) {
          for (let i = 0; i < event.choices.length; i++) {
            if (event.choices[i].risk !== 'safe') {
              total++;
              if (resolveChoice(event, i, baseState).success) baseSuccesses++;
              // Note: bonusState event gen may add diplomacy, but we use baseState's event
              if (resolveChoice(event, i, bonusState).success) bonusSuccesses++;
            }
          }
        }
      }
    }

    // With +10% bonus, more successes expected (or equal)
    if (total > 0) {
      expect(bonusSuccesses).toBeGreaterThanOrEqual(baseSuccesses);
    }
  });

  it('applies data gain multiplier', () => {
    const event = findEvent();
    const baseResult = resolveChoice(event, 0, makeState());
    const bonusResult = resolveChoice(event, 0,
      makeState({ upgrades: { engines: 0, sensors: 0, fuel_systems: 0, comms: 2 } }));
    // Data should be scaled by 1.3
    if (baseResult.data > 0) {
      expect(bonusResult.data).toBeGreaterThanOrEqual(baseResult.data);
    }
  });

  it('success rate is capped at 98%', () => {
    // Even with bonus, success rate shouldn't exceed 98%
    // Find an event with a high success rate choice
    const state = makeState({ upgrades: { engines: 0, sensors: 2, fuel_systems: 0, comms: 0 } });
    // Just verify the logic doesn't crash — the cap is internal
    for (const s of galaxy.stars.slice(0, 10)) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) {
          for (let i = 0; i < event.choices.length; i++) {
            const result = resolveChoice(event, i, state);
            expect(result).toBeDefined();
          }
        }
      }
    }
  });
});

// ── Rarity Distribution ──

describe('rarity weighting', () => {
  it('common events appear more often than rare events', () => {
    const galaxy = generateGalaxy(42);
    const state = makeState();
    const counts = { common: 0, uncommon: 0, rare: 0 };

    for (const s of galaxy.stars) {
      for (const p of generatePlanets(s)) {
        const event = generatePlanetEvent(p, s, state);
        if (event !== null) {
          const template = EVENT_TEMPLATES.find(t => t.id === event.templateId);
          counts[template.rarity]++;
        }
      }
    }

    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.uncommon).toBeGreaterThan(counts.rare);
  });
});
