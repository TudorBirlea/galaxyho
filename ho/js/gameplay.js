import { CONFIG } from './config.js?v=5.0';
import { starDistance } from './data.js?v=5.0';
import { mulberry32, hashInt, lerp } from './utils.js?v=5.0';

export function getUpgradeEffects(state) {
  const e = {
    fuelCostMult: 1.0,
    jumpRange: 1,
    systemSpeedMult: 1.0,
    revealEvents: false,
    successRateBonus: 0,
    orbitalScan: false,
    maxFuelMult: 1.0,
    fuelGainMult: 1.0,
    solarRegen: false,
    regenRate: 0,
    diplomacy: false,
    dataGainMult: 1.0,
    beaconNetwork: false,
  };
  if (!state.upgrades) return e;
  // Effects applied by upgrade tiers (cumulative within a category)
  if (state.upgrades.engines >= 1) e.fuelCostMult *= 0.75;
  if (state.upgrades.engines >= 2) e.jumpRange = 2;
  if (state.upgrades.engines >= 3) { e.fuelCostMult *= 0.67; e.systemSpeedMult = 1.5; }
  if (state.upgrades.sensors >= 1) e.revealEvents = true;
  if (state.upgrades.sensors >= 2) e.successRateBonus += 0.10;
  if (state.upgrades.sensors >= 3) e.orbitalScan = true;
  if (state.upgrades.fuel_systems >= 1) e.maxFuelMult = 1.5;
  if (state.upgrades.fuel_systems >= 2) e.fuelGainMult = 1.5;
  if (state.upgrades.fuel_systems >= 3) { e.solarRegen = true; e.regenRate = 0.5; }
  if (state.upgrades.comms >= 1) e.diplomacy = true;
  if (state.upgrades.comms >= 2) e.dataGainMult = 1.3;
  if (state.upgrades.comms >= 3) e.beaconNetwork = true;
  return e;
}

export function getMaxFuel(state) {
  return Math.round(CONFIG.gameplay.baseMaxFuel * getUpgradeEffects(state).maxFuelMult);
}

export function calculateJumpFuelCost(fromStar, toStar, state) {
  const dist = starDistance(fromStar, toStar);
  const baseCost = dist * CONFIG.gameplay.fuelPerLy;
  return Math.round(baseCost * getUpgradeEffects(state).fuelCostMult);
}

export function canJump(fromStar, toStar, state) {
  const cost = calculateJumpFuelCost(fromStar, toStar, state);
  return state.fuel >= cost;
}

export function consumeFuel(amount, state) {
  state.fuel = Math.max(0, state.fuel - amount);
}

export function addFuel(amount, state) {
  const max = getMaxFuel(state);
  state.fuel = Math.min(max, state.fuel + amount);
}

export function addData(amount, state) {
  const effects = getUpgradeEffects(state);
  state.data += Math.round(amount * effects.dataGainMult);
}

export function updateSolarRegen(deltaTime, state) {
  const effects = getUpgradeEffects(state);
  const baseRate = CONFIG.gameplay.baseRegenRate;
  const rate = effects.solarRegen ? effects.regenRate : baseRate;
  const max = getMaxFuel(state);
  state.fuel = Math.min(max, state.fuel + rate * deltaTime);
}

export function getFuelForPlanetType(planetType) {
  return CONFIG.gameplay.fuelByPlanetType[planetType] || [2, 6];
}

export function rollPlanetFuel(planet) {
  const rng = mulberry32(hashInt(planet.seed, 8888));
  const range = getFuelForPlanetType(planet.type);
  return Math.round(lerp(range[0], range[1], rng()));
}

export function rollScanData(planet) {
  const rng = mulberry32(hashInt(planet.seed, 7777));
  const range = CONFIG.gameplay.scanDataReward;
  return Math.round(lerp(range[0], range[1], rng()));
}
