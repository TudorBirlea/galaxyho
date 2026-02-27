export const UPGRADE_TREE = {
  engines: {
    label: 'Engines',
    icon: '>>',
    tiers: [
      { id: 'fuel_efficiency', label: 'Fuel Efficiency', cost: 50, description: 'Reduce fuel cost per jump by 25%' },
      { id: 'jump_range', label: 'Extended Range', cost: 120, description: 'Jump to stars 2 hops away' },
      { id: 'warp_mk2', label: 'Warp Mk II', cost: 250, description: 'Further fuel reduction + faster system travel' },
    ],
  },
  sensors: {
    label: 'Sensors',
    icon: '((',
    tiers: [
      { id: 'event_preview', label: 'Event Scanner', cost: 40, description: 'See event indicators on planets' },
      { id: 'deep_scan', label: 'Deep Scanner', cost: 100, description: '+10% success rate on event choices' },
      { id: 'orbital_scan', label: 'Orbital Scan', cost: 200, description: 'Scan planets without flying to them' },
    ],
  },
  fuel_systems: {
    label: 'Fuel Systems',
    icon: '{}',
    tiers: [
      { id: 'tank_expansion', label: 'Tank Expansion', cost: 60, description: 'Increase max fuel by 50%' },
      { id: 'harvest_bonus', label: 'Fuel Harvester', cost: 130, description: '+50% fuel gained from planets' },
      { id: 'solar_regen', label: 'Solar Collector', cost: 220, description: '3x faster stellar fuel absorption' },
    ],
  },
  comms: {
    label: 'Communications',
    icon: '~=',
    tiers: [
      { id: 'diplomacy', label: 'Diplomacy Suite', cost: 45, description: 'Unlock diplomatic choices in alien events' },
      { id: 'trade_bonus', label: 'Trade Protocols', cost: 110, description: '+30% data rewards from events and scans' },
      { id: 'beacon_network', label: 'Beacon Network', cost: 240, description: 'Reveal all stars within 2 jumps of visited' },
    ],
  },
};

export function purchaseUpgrade(categoryId, tier, state) {
  const cat = UPGRADE_TREE[categoryId];
  if (!cat) return false;
  if (tier < 1 || tier > cat.tiers.length) return false;
  // Must own previous tier
  if (state.upgrades[categoryId] < tier - 1) return false;
  // Already owned
  if (state.upgrades[categoryId] >= tier) return false;
  const cost = cat.tiers[tier - 1].cost;
  if (state.data < cost) return false;
  state.data -= cost;
  state.upgrades[categoryId] = tier;
  return true;
}
