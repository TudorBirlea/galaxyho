import { mulberry32, hashInt, lerp } from './utils.js?v=5.0';
import { CONFIG } from './config.js?v=5.0';
import { getUpgradeEffects } from './gameplay.js?v=5.0';

// ── Event Templates ──
// Each template: { id, title, description, planetTypes (null=universal), rarity, choices[] }
// Choice: { label, risk, outcomes: { success: {fuel, data, lore}, failure?: {fuel, data, lore} }, successRate }
// fuel/data values are [min, max] ranges resolved by seeded RNG

const TEMPLATES = [
  // ═══════════════ UNIVERSAL (any planet type) ═══════════════
  {
    id: 'distress_beacon',
    title: 'Distress Beacon',
    description: 'A faint distress signal pulses from the surface of {planetName}. The signal is old — perhaps decades — but the pattern is unmistakably human-made.',
    planetTypes: null, rarity: 'common',
    choices: [
      { label: 'Investigate the source', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [5, 15], data: [8, 20], lore: 'Found a damaged survey probe with valuable star charts stored in its memory banks.' },
                    failure: { fuel: [-8, -4], data: [2, 5], lore: 'The signal was a trap — an automated decoy protecting a collapsed structure. Minor hull damage from debris.' } } },
      { label: 'Scan from orbit', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [4, 10], lore: 'Remote scans reveal the beacon belongs to a long-lost survey vessel. Location logged.' } } },
      { label: 'Mark and move on', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [1, 3], lore: null } } },
    ],
  },
  {
    id: 'derelict_ship',
    title: 'Derelict Vessel',
    description: 'Sensors detect a drifting ship hull in orbit around {planetName}. No life signs. The vessel\'s design doesn\'t match any known registry.',
    planetTypes: null, rarity: 'common',
    choices: [
      { label: 'Board and salvage', risk: 'medium', successRate: 0.55,
        outcomes: { success: { fuel: [10, 25], data: [10, 25], lore: 'The ship\'s cargo hold still contains sealed fuel canisters and encrypted data cores.' },
                    failure: { fuel: [-5, -2], data: [3, 8], lore: 'Structural collapse during salvage. Managed to grab a few data chips before evacuating.' } } },
      { label: 'Scan the hull remotely', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 14], lore: 'External analysis reveals an unknown alloy composition. Valuable metallurgical data recorded.' } } },
    ],
  },
  {
    id: 'cosmic_anomaly',
    title: 'Cosmic Anomaly',
    description: 'Instruments are registering impossible readings near {planetName}. Space-time appears to be subtly warped in a localized region.',
    planetTypes: null, rarity: 'uncommon',
    choices: [
      { label: 'Approach cautiously', risk: 'high', successRate: 0.45,
        outcomes: { success: { fuel: [0, 0], data: [20, 40], lore: 'The anomaly is a natural wormhole echo. The readings rewrite several chapters of theoretical physics.' },
                    failure: { fuel: [-15, -8], data: [5, 10], lore: 'Gravitational shear nearly tears the hull apart. Emergency retreat — but some sensor data was captured.' } } },
      { label: 'Deploy remote probe', risk: 'low', successRate: 0.85,
        outcomes: { success: { fuel: [0, 0], data: [10, 18], lore: 'The probe transmits stunning data before dissolving into the anomaly.' },
                    failure: { fuel: [0, 0], data: [3, 6], lore: 'Probe lost immediately. Only baseline telemetry recovered.' } } },
      { label: 'Log coordinates and leave', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [2, 5], lore: null } } },
    ],
  },
  {
    id: 'pirate_cache',
    title: 'Hidden Cache',
    description: 'A concealed signal leads to a camouflaged supply depot in the shadow of {planetName}. Someone went to great lengths to hide this.',
    planetTypes: null, rarity: 'uncommon',
    choices: [
      { label: 'Crack the locks', risk: 'medium', successRate: 0.65,
        outcomes: { success: { fuel: [15, 30], data: [5, 12], lore: 'Fuel cells, spare parts, and a cryptic star map. Someone was planning a long journey.' },
                    failure: { fuel: [-5, -2], data: [2, 5], lore: 'Anti-tamper charges destroyed most of the contents. Recovered fragments of a navigation log.' } } },
      { label: 'Take what\'s accessible', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [5, 12], data: [3, 7], lore: 'External containers yield modest supplies. The main vault remains sealed.' } } },
    ],
  },
  {
    id: 'ancient_probe',
    title: 'Ancient Probe',
    description: 'An object of clearly artificial origin drifts near {planetName}. Its design is alien — geometric, precise, and impossibly old.',
    planetTypes: null, rarity: 'rare',
    choices: [
      { label: 'Attempt to interface', risk: 'high', successRate: 0.40,
        outcomes: { success: { fuel: [0, 0], data: [30, 50], lore: 'The probe accepts your signal and transmits a burst of data in an unknown format. Your computers will need years to decode it all.' },
                    failure: { fuel: [-10, -5], data: [8, 15], lore: 'The probe emits an electromagnetic pulse before going dark. Some peripheral data was captured, but ship systems took damage.' } } },
      { label: 'Observe and document', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [10, 20], lore: 'High-resolution imaging and spectral analysis of the probe\'s surface. A remarkable discovery.' } } },
    ],
  },
  {
    id: 'radiation_storm',
    title: 'Radiation Storm',
    description: 'A wave of intense radiation is sweeping across {planetName}. The storm is interfering with sensors but may reveal hidden planetary features.',
    planetTypes: null, rarity: 'common',
    choices: [
      { label: 'Ride it out and scan', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [0, 0], data: [12, 22], lore: 'The radiation illuminates subsurface structures normally invisible to scanners. Extraordinary geological data.' },
                    failure: { fuel: [-6, -3], data: [3, 7], lore: 'Sensor overload. The storm was more intense than predicted. Partial data recovered.' } } },
      { label: 'Shield and wait', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [-2, -1], data: [4, 8], lore: 'Passive readings from behind shields still yield useful atmospheric data.' } } },
    ],
  },
  {
    id: 'micro_singularity',
    title: 'Micro-Singularity',
    description: 'A pinpoint gravitational anomaly orbits {planetName}. It\'s too small to be a black hole, but too strong to be natural debris.',
    planetTypes: null, rarity: 'rare',
    choices: [
      { label: 'Attempt capture with tractor beam', risk: 'extreme', successRate: 0.30,
        outcomes: { success: { fuel: [0, 0], data: [40, 60], lore: 'The singularity is stabilized in a containment field. This could revolutionize energy research.' },
                    failure: { fuel: [-20, -12], data: [5, 12], lore: 'The singularity evaporates in a burst of Hawking radiation. Significant damage to external arrays.' } } },
      { label: 'Study from safe distance', risk: 'low', successRate: 0.90,
        outcomes: { success: { fuel: [0, 0], data: [15, 25], lore: 'Detailed gravitational mapping of the singularity. Its quantum properties defy standard models.' },
                    failure: { fuel: [0, 0], data: [5, 8], lore: 'The singularity decayed before measurements could complete.' } } },
    ],
  },
  {
    id: 'communication_fragment',
    title: 'Signal Fragment',
    description: 'A repeating transmission is bouncing off {planetName}\'s atmosphere. The signal appears to originate from outside this galaxy cluster.',
    planetTypes: null, rarity: 'uncommon',
    choices: [
      { label: 'Decode the signal', risk: 'low', successRate: 0.75,
        outcomes: { success: { fuel: [0, 0], data: [12, 22], lore: 'The signal contains a mathematical sequence — a prime number progression. This is not natural.' },
                    failure: { fuel: [0, 0], data: [4, 8], lore: 'Decoding fails — the signal degrades too quickly. Partial frequency analysis stored.' } } },
      { label: 'Record raw transmission', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Raw waveform captured for later analysis.' } } },
    ],
  },
  {
    id: 'space_whale',
    title: 'Void Leviathan',
    description: 'Something immense is moving through the void near {planetName}. Bio-luminescent, kilometers long, and absolutely alive.',
    planetTypes: null, rarity: 'rare',
    choices: [
      { label: 'Follow at a distance', risk: 'medium', successRate: 0.70,
        outcomes: { success: { fuel: [-5, -2], data: [20, 35], lore: 'The creature leads you through a region rich in exotic particles. Its migration route is now charted.' },
                    failure: { fuel: [-10, -5], data: [5, 10], lore: 'The creature takes notice and emits a powerful electromagnetic burst. Systems scrambled.' } } },
      { label: 'Observe and catalog', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [10, 18], lore: 'High-resolution holographic recording of a spacefaring organism. A biological impossibility, now proven real.' } } },
    ],
  },
  {
    id: 'smuggler_stash',
    title: 'Smuggler\'s Stash',
    description: 'Tucked in a crater on {planetName}, a cleverly disguised cargo pod sits waiting. Its transponder pings with an obsolete merchant code.',
    planetTypes: null, rarity: 'common',
    choices: [
      { label: 'Open it', risk: 'low', successRate: 0.80,
        outcomes: { success: { fuel: [8, 18], data: [3, 8], lore: 'Fuel reserves and processed minerals. Whoever stashed this never came back.' },
                    failure: { fuel: [-3, -1], data: [1, 3], lore: 'The pod is rigged with a corrosive agent. Minor damage, minimal contents.' } } },
      { label: 'Scan contents first', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [4, 8], data: [2, 5], lore: 'Non-invasive scans identify useful materials. Safe extraction.' } } },
    ],
  },
  {
    id: 'temporal_echo',
    title: 'Temporal Echo',
    description: 'For a brief moment, sensors detect a duplicate of your own ship near {planetName} — same transponder code, same energy signature. Then it vanishes.',
    planetTypes: null, rarity: 'rare',
    choices: [
      { label: 'Investigate the coordinates', risk: 'high', successRate: 0.50,
        outcomes: { success: { fuel: [0, 0], data: [25, 45], lore: 'Temporal residue at the location contains information from a possible future. The implications are staggering.' },
                    failure: { fuel: [-12, -6], data: [5, 12], lore: 'The temporal field collapses violently. Systems damaged but the chronal data is preserved.' } } },
      { label: 'Log it as an anomaly', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'The echo is documented. Perhaps future visits will shed more light.' } } },
    ],
  },
  {
    id: 'mineral_vein',
    title: 'Exposed Mineral Vein',
    description: 'Surface scans of {planetName} reveal a massive mineral deposit exposed by recent geological activity. Rich in rare elements.',
    planetTypes: null, rarity: 'common',
    choices: [
      { label: 'Extract samples', risk: 'low', successRate: 0.80,
        outcomes: { success: { fuel: [5, 12], data: [8, 16], lore: 'High-purity mineral samples collected. The deposit contains several elements not in standard databases.' },
                    failure: { fuel: [-3, -1], data: [3, 6], lore: 'Extraction disturbs the geological formation. Limited samples recovered before retreating.' } } },
      { label: 'Spectral analysis only', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Detailed compositional data logged from orbit.' } } },
    ],
  },

  // ═══════════════ TERRAN ═══════════════
  {
    id: 'colony_ruins',
    title: 'Colony Ruins',
    description: 'Overgrown structures on {planetName} tell the story of a failed settlement. Nature has reclaimed most of it, but central buildings remain intact.',
    planetTypes: ['terran'], rarity: 'common',
    choices: [
      { label: 'Explore the structures', risk: 'medium', successRate: 0.65,
        outcomes: { success: { fuel: [5, 12], data: [12, 25], lore: 'Personal logs reveal the colony was abandoned due to seismic instability. Their research data is invaluable.' },
                    failure: { fuel: [-5, -2], data: [4, 8], lore: 'A floor gives way. Emergency extraction needed, but some records were recovered.' } } },
      { label: 'Aerial survey', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 12], lore: 'Mapping the ruins from above reveals a settlement pattern suggesting advanced urban planning.' } } },
    ],
  },
  {
    id: 'primitive_life',
    title: 'Primitive Life Signs',
    description: 'Bioscanners detect complex organic molecules and possible microbial colonies on {planetName}\'s surface. This could be first-contact territory.',
    planetTypes: ['terran'], rarity: 'uncommon',
    choices: [
      { label: 'Collect samples', risk: 'medium', successRate: 0.70,
        outcomes: { success: { fuel: [0, 0], data: [15, 30], lore: 'Confirmed: multicellular organisms with a unique amino acid structure. This changes everything.' },
                    failure: { fuel: [-4, -2], data: [5, 10], lore: 'Contamination protocols triggered. Samples compromised, but spectral data preserved.' } } },
      { label: 'Non-invasive observation', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [8, 16], lore: 'Detailed recordings of possible biological activity. Inconclusive but promising.' } } },
    ],
  },
  {
    id: 'breathable_atm',
    title: 'Breathable Pocket',
    description: 'A sheltered valley on {planetName} maintains atmospheric conditions within human tolerance. Temperature, pressure, oxygen — all viable.',
    planetTypes: ['terran'], rarity: 'uncommon',
    choices: [
      { label: 'Land and explore on foot', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [-3, -1], data: [12, 22], lore: 'Walking on alien soil under an alien sky. Soil and air samples will be studied for decades.' },
                    failure: { fuel: [-8, -4], data: [5, 10], lore: 'Unexpected weather system forced emergency liftoff. Limited ground data collected.' } } },
      { label: 'Drop atmospheric probes', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 14], lore: 'Probes confirm stable conditions. This location is flagged as a potential settlement site.' } } },
    ],
  },
  {
    id: 'tectonic_readings',
    title: 'Tectonic Activity',
    description: 'Seismic sensors detect unusual periodic tremors on {planetName}. The pattern is too regular to be natural plate tectonics.',
    planetTypes: ['terran'], rarity: 'common',
    choices: [
      { label: 'Deploy deep-core probe', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [0, 0], data: [10, 20], lore: 'The tremors originate from a massive subsurface cavity. Something resonates down there.' },
                    failure: { fuel: [-4, -2], data: [3, 7], lore: 'Probe crushed by tectonic pressure. Partial data transmitted before loss.' } } },
      { label: 'Record surface data', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Seismic waveform analysis cataloged.' } } },
    ],
  },

  // ═══════════════ DESERT ═══════════════
  {
    id: 'buried_vault',
    title: 'Buried Vault',
    description: 'Ground-penetrating radar reveals a sealed chamber beneath the dunes of {planetName}. The structure is far older than any known civilization.',
    planetTypes: ['desert'], rarity: 'uncommon',
    choices: [
      { label: 'Excavate the entrance', risk: 'high', successRate: 0.50,
        outcomes: { success: { fuel: [0, 0], data: [20, 35], lore: 'Inside: preserved artifacts of unknown origin. Crystal tablets covered in mathematical notation.' },
                    failure: { fuel: [-8, -4], data: [5, 12], lore: 'The vault\'s internal atmosphere ignites on contact with outside air. Explosion damages equipment.' } } },
      { label: 'Scan through the walls', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [8, 15], lore: 'Non-invasive scans map the vault\'s interior. Multiple chambers with metallic objects detected.' } } },
    ],
  },
  {
    id: 'heat_minerals',
    title: 'Heat-Forged Minerals',
    description: 'Extreme surface temperatures on {planetName} have created crystals of extraordinary purity. They gleam through the heat haze like scattered stars.',
    planetTypes: ['desert'], rarity: 'common',
    choices: [
      { label: 'Surface collection run', risk: 'medium', successRate: 0.65,
        outcomes: { success: { fuel: [8, 15], data: [5, 12], lore: 'Crystals collected. Their lattice structure could improve fuel cell efficiency.' },
                    failure: { fuel: [-5, -2], data: [2, 5], lore: 'Heat damage to collection equipment. Minimal samples secured.' } } },
      { label: 'Remote analysis', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [4, 9], lore: 'Spectral data on the crystal formations logged.' } } },
    ],
  },
  {
    id: 'sandstorm_data',
    title: 'Megastorm',
    description: 'A planet-wide sandstorm on {planetName} generates massive electrical discharges. The storm\'s electromagnetic signature contains structured patterns.',
    planetTypes: ['desert'], rarity: 'common',
    choices: [
      { label: 'Fly into the storm edge', risk: 'high', successRate: 0.45,
        outcomes: { success: { fuel: [-5, -2], data: [15, 28], lore: 'Lightning-created glass formations on the surface contain frozen electromagnetic memories. Unprecedented.' },
                    failure: { fuel: [-12, -6], data: [3, 8], lore: 'The storm was stronger than models predicted. Emergency ascent. Ship battered but intact.' } } },
      { label: 'Monitor from orbit', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 12], lore: 'Storm dynamics recorded. The electrical patterns suggest a self-organizing system.' } } },
    ],
  },
  {
    id: 'fossilized_life',
    title: 'Fossil Field',
    description: 'Erosion on {planetName} has exposed a vast bed of fossilized organisms. These creatures lived millions of years ago in a now-vanished ocean.',
    planetTypes: ['desert'], rarity: 'uncommon',
    choices: [
      { label: 'Excavate specimens', risk: 'low', successRate: 0.80,
        outcomes: { success: { fuel: [0, 0], data: [12, 22], lore: 'Pristine fossils of beings that breathed methane. Their biology is unlike anything in known records.' },
                    failure: { fuel: [-2, -1], data: [4, 8], lore: 'Specimens crumble on extraction. Imaging data preserved.' } } },
      { label: 'Photograph and scan', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 12], lore: 'Detailed 3D models of fossil structures compiled.' } } },
    ],
  },

  // ═══════════════ ICE ═══════════════
  {
    id: 'subsurface_ocean',
    title: 'Subsurface Ocean',
    description: 'Thermal imaging reveals liquid water beneath {planetName}\'s ice crust. The ocean is heated by tidal forces and may harbor life.',
    planetTypes: ['ice'], rarity: 'uncommon',
    choices: [
      { label: 'Drill through the ice', risk: 'high', successRate: 0.50,
        outcomes: { success: { fuel: [-5, -2], data: [20, 35], lore: 'Contact with liquid water confirmed. Chemical analysis suggests complex organic chemistry.' },
                    failure: { fuel: [-10, -5], data: [5, 10], lore: 'Drill head lost in a pressurized geyser eruption. Partial water samples recovered from spray.' } } },
      { label: 'Sonar mapping', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [8, 15], lore: 'Ice-penetrating sonar reveals the ocean is 40km deep with thermal vents along the bottom.' } } },
    ],
  },
  {
    id: 'cryo_vault',
    title: 'Cryo-Preserved Data',
    description: 'An artificial structure is encased in {planetName}\'s ice. Inside, temperature-sensitive storage devices have been perfectly preserved.',
    planetTypes: ['ice'], rarity: 'uncommon',
    choices: [
      { label: 'Thaw and extract', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [0, 0], data: [15, 30], lore: 'The storage devices contain navigational data from a civilization that mapped stars we haven\'t reached yet.' },
                    failure: { fuel: [-4, -2], data: [5, 10], lore: 'Thermal shock destroys some devices. Partial data recovered from the most resilient cores.' } } },
      { label: 'Scan through the ice', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 12], lore: 'Non-invasive imaging captures the external structure. Data patterns visible but unreadable.' } } },
    ],
  },
  {
    id: 'crystal_formations',
    title: 'Crystal Caverns',
    description: 'Crevasses on {planetName} lead to vast underground caverns lined with luminescent ice crystals. They pulse with an inner light.',
    planetTypes: ['ice'], rarity: 'common',
    choices: [
      { label: 'Descend into the caverns', risk: 'medium', successRate: 0.65,
        outcomes: { success: { fuel: [3, 8], data: [10, 20], lore: 'The crystals are natural energy capacitors. They store and release photons over millennia.' },
                    failure: { fuel: [-6, -3], data: [3, 7], lore: 'An ice shelf collapses, trapping the probe. Remote-detonated charges free it with some crystal samples.' } } },
      { label: 'Sample from the rim', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Surface crystal samples collected. Their optical properties are remarkable.' } } },
    ],
  },

  // ═══════════════ GAS GIANT ═══════════════
  {
    id: 'cloud_harvesting',
    title: 'Cloud Harvesting',
    description: 'The upper atmosphere of {planetName} is rich in hydrogen-3 and other fusion-grade fuels. A skimming run could replenish your tanks.',
    planetTypes: ['gas_giant'], rarity: 'common',
    choices: [
      { label: 'Deep atmospheric dive', risk: 'high', successRate: 0.50,
        outcomes: { success: { fuel: [20, 40], data: [5, 10], lore: 'Tanks filled to capacity. The dive also captured exotic atmospheric compounds.' },
                    failure: { fuel: [-10, -5], data: [3, 6], lore: 'Unexpected pressure spike forces emergency ascent. Fuel spent exceeds fuel collected.' } } },
      { label: 'Upper atmosphere skim', risk: 'low', successRate: 0.85,
        outcomes: { success: { fuel: [10, 20], data: [3, 6], lore: 'Conservative skim yields solid fuel reserves.' },
                    failure: { fuel: [2, 5], data: [1, 3], lore: 'Turbulence limits collection time. Modest reserves gathered.' } } },
    ],
  },
  {
    id: 'storm_dive',
    title: 'Storm Formation',
    description: 'A cyclone the size of a continent is forming on {planetName}. Wind speeds exceed 800 km/h. The storm\'s eye contains unusual readings.',
    planetTypes: ['gas_giant'], rarity: 'uncommon',
    choices: [
      { label: 'Dive into the eye', risk: 'extreme', successRate: 0.35,
        outcomes: { success: { fuel: [0, 0], data: [25, 45], lore: 'The eye contains a stable anti-cyclone with exotic particles. A phenomenon never before documented.' },
                    failure: { fuel: [-15, -8], data: [5, 12], lore: 'Caught by a wind shear. Emergency thrusters drain fuel reserves escaping the vortex.' } } },
      { label: 'Observe from above', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [8, 15], lore: 'Storm dynamics recorded in detail. The formation pattern suggests deep atmospheric convection.' } } },
    ],
  },
  {
    id: 'atmospheric_life',
    title: 'Atmospheric Life',
    description: 'Bio-luminescent organisms drift through {planetName}\'s cloud bands. Vast colonies of gas-dwelling creatures, each kilometers across.',
    planetTypes: ['gas_giant'], rarity: 'rare',
    choices: [
      { label: 'Fly through a colony', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [0, 0], data: [20, 35], lore: 'The organisms communicate via bioluminescent pulses. You\'ve captured a complete vocabulary of light patterns.' },
                    failure: { fuel: [-8, -4], data: [8, 15], lore: 'The colony reacts defensively — acidic secretions damage external sensors. Partial data recovered.' } } },
      { label: 'Observe at distance', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [10, 18], lore: 'Hours of footage documenting gas-giant biology. An entirely new branch of life.' } } },
    ],
  },
  {
    id: 'magnetic_anomaly',
    title: 'Magnetic Anomaly',
    description: '{planetName}\'s magnetic field has a localized inversion. Compass readings spin wildly near the equator. Something is causing this.',
    planetTypes: ['gas_giant'], rarity: 'common',
    choices: [
      { label: 'Deploy magnetometer array', risk: 'low', successRate: 0.80,
        outcomes: { success: { fuel: [0, 0], data: [10, 18], lore: 'The inversion is caused by a metallic asteroid core suspended deep in the atmosphere. Fascinating.' },
                    failure: { fuel: [-2, -1], data: [3, 6], lore: 'Array scrambled by the magnetic field. Baseline measurements preserved.' } } },
      { label: 'Record from orbit', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Magnetic field topology mapped from safe distance.' } } },
    ],
  },

  // ═══════════════ LAVA ═══════════════
  {
    id: 'geothermal_energy',
    title: 'Geothermal Source',
    description: 'Intense geothermal vents on {planetName} radiate enough energy to power a small city. The heat could be converted to fuel.',
    planetTypes: ['lava'], rarity: 'common',
    choices: [
      { label: 'Deploy thermal collectors', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [12, 22], data: [5, 10], lore: 'Thermal conversion successful. The vent composition suggests a deep mantle rich in rare earths.' },
                    failure: { fuel: [-5, -2], data: [2, 5], lore: 'An eruption destroys the collectors. Heat damage to ship\'s undercarriage.' } } },
      { label: 'Thermal imaging scan', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Vent system mapped. The heat patterns reveal the planet\'s internal structure.' } } },
    ],
  },
  {
    id: 'heat_artifact',
    title: 'Heat-Shielded Artifact',
    description: 'Something metallic glints in a lava flow on {planetName}. It should have melted, but it\'s structurally intact at 1,200°C.',
    planetTypes: ['lava'], rarity: 'rare',
    choices: [
      { label: 'Retrieve with shielded drone', risk: 'high', successRate: 0.45,
        outcomes: { success: { fuel: [0, 0], data: [25, 40], lore: 'The artifact is a perfect sphere of unknown alloy. It\'s warm to the touch but contains intricate internal structures.' },
                    failure: { fuel: [-8, -4], data: [5, 12], lore: 'Drone lost in a lava surge. Telemetry before loss suggests the artifact was artificially placed.' } } },
      { label: 'Spectrometric analysis from orbit', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [8, 15], lore: 'The alloy has a melting point beyond any known material. Composition logged for further study.' } } },
    ],
  },
  {
    id: 'volcanic_minerals',
    title: 'Volcanic Deposits',
    description: 'Recent eruptions on {planetName} have brought rare heavy elements to the surface. The cooling flows shimmer with metallic veins.',
    planetTypes: ['lava'], rarity: 'common',
    choices: [
      { label: 'Mine the cooling flows', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [6, 14], data: [8, 16], lore: 'Heavy element extraction successful. Platinum-group metals in abundance.' },
                    failure: { fuel: [-4, -2], data: [3, 6], lore: 'The flow reignites unexpectedly. Partial collection before retreat.' } } },
      { label: 'Orbital spectrometry', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [4, 9], lore: 'Surface composition mapped in detail.' } } },
    ],
  },

  // ═══════════════ OCEAN ═══════════════
  {
    id: 'deep_dive',
    title: 'Abyssal Discovery',
    description: '{planetName}\'s oceans are kilometers deep. Sonar pings return echoes that suggest massive structures on the ocean floor.',
    planetTypes: ['ocean'], rarity: 'uncommon',
    choices: [
      { label: 'Deploy deep submersible', risk: 'high', successRate: 0.50,
        outcomes: { success: { fuel: [0, 0], data: [20, 35], lore: 'Crystalline spires rise from the ocean floor — a natural formation that concentrates thermal energy like a living city.' },
                    failure: { fuel: [-8, -4], data: [5, 12], lore: 'Submersible crushed by pressure at depth. Black box data recovered from surface debris.' } } },
      { label: 'Sonar mapping only', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [8, 15], lore: 'Detailed bathymetric map of the ocean floor. Multiple anomalous structures identified.' } } },
    ],
  },
  {
    id: 'aquatic_signals',
    title: 'Aquatic Intelligence',
    description: 'Hydrophone arrays detect complex acoustic patterns in {planetName}\'s oceans. The sounds have grammar-like structure.',
    planetTypes: ['ocean'], rarity: 'rare',
    choices: [
      { label: 'Attempt acoustic contact', risk: 'medium', successRate: 0.55,
        outcomes: { success: { fuel: [0, 0], data: [25, 40], lore: 'The ocean responds to your transmission with new patterns. A dialogue begins. The implications are world-changing.' },
                    failure: { fuel: [-5, -2], data: [8, 15], lore: 'The ocean goes silent after your transmission. Perhaps it was startled. Recording of pre-contact sounds preserved.' } } },
      { label: 'Listen and record', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [12, 20], lore: 'Hours of acoustic data captured. Linguists will study this for years.' } } },
    ],
  },
  {
    id: 'tidal_energy',
    title: 'Tidal Resonance',
    description: '{planetName}\'s tidal forces create standing waves of extraordinary power. The energy is rhythmic, predictable, and immense.',
    planetTypes: ['ocean'], rarity: 'common',
    choices: [
      { label: 'Tidal energy harvest', risk: 'medium', successRate: 0.65,
        outcomes: { success: { fuel: [10, 20], data: [5, 10], lore: 'Energy conversion yields significant fuel reserves. The tidal dynamics are beautifully complex.' },
                    failure: { fuel: [-4, -2], data: [2, 5], lore: 'A rogue wave damages the collection array. Modest energy captured before retrieval.' } } },
      { label: 'Tidal pattern analysis', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'The tidal model reveals this planet has three gravitational influences — there may be a hidden moon.' } } },
    ],
  },

  // ═══════════════ WATER (SUB-NEPTUNE) ═══════════════
  {
    id: 'cloud_city',
    title: 'Cloud Formations',
    description: 'Enormous convective cells in {planetName}\'s atmosphere create cathedral-like cloud structures. Stable enough to land on — theoretically.',
    planetTypes: ['water'], rarity: 'uncommon',
    choices: [
      { label: 'Atmospheric insertion', risk: 'high', successRate: 0.45,
        outcomes: { success: { fuel: [5, 12], data: [15, 28], lore: 'Inside the cloud structure: ice crystals arranged in fractal patterns, a natural computer of sorts.' },
                    failure: { fuel: [-10, -5], data: [5, 10], lore: 'Turbulence overwhelms stabilizers. Emergency ascent with partial atmospheric samples.' } } },
      { label: 'Spectral cloud analysis', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [6, 12], lore: 'Cloud composition analysis reveals exotic chemistry. Water-ammonia gradients create natural distilleries.' } } },
    ],
  },
  {
    id: 'atm_harvesting',
    title: 'Atmospheric Harvesting',
    description: '{planetName}\'s dense atmosphere contains hydrogen compounds that can be processed into fuel. The concentration is unusually high.',
    planetTypes: ['water'], rarity: 'common',
    choices: [
      { label: 'Extended harvesting run', risk: 'medium', successRate: 0.65,
        outcomes: { success: { fuel: [15, 25], data: [3, 8], lore: 'Fuel tanks topped off. The atmospheric chemistry suggests recent cometary bombardment.' },
                    failure: { fuel: [2, 5], data: [2, 4], lore: 'Pressure fluctuations cut the run short. Partial harvest completed.' } } },
      { label: 'Quick surface skim', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [6, 12], data: [2, 5], lore: 'Conservative skim. Safe and efficient.' } } },
    ],
  },
  {
    id: 'pressure_anomaly',
    title: 'Pressure Anomaly',
    description: 'A region of {planetName}\'s atmosphere maintains impossibly low pressure — a bubble of near-vacuum in an otherwise dense world.',
    planetTypes: ['water'], rarity: 'uncommon',
    choices: [
      { label: 'Enter the bubble', risk: 'medium', successRate: 0.60,
        outcomes: { success: { fuel: [0, 0], data: [12, 22], lore: 'Inside the bubble: perfect clarity. The low pressure zone is maintained by some kind of energy field of unknown origin.' },
                    failure: { fuel: [-6, -3], data: [4, 8], lore: 'The bubble collapses as you enter. Rapid pressure equalization damages hull plating.' } } },
      { label: 'Probe from outside', risk: 'safe', successRate: 1.0,
        outcomes: { success: { fuel: [0, 0], data: [5, 10], lore: 'Measurements of the bubble\'s boundary suggest it\'s artificially maintained. By what?' } } },
    ],
  },
];

// ── Event generation (seeded per planet) ──

export function generatePlanetEvent(planet, star, state) {
  const key = star.id + '-' + planet.id;
  // Already resolved?
  if (state.resolvedEvents && state.resolvedEvents[key]) return null;

  const rng = mulberry32(hashInt(planet.seed, 9999));

  // Event chance
  if (rng() > CONFIG.gameplay.eventChance) return null;

  // Filter templates by planet type
  const eligible = TEMPLATES.filter(t =>
    t.planetTypes === null || t.planetTypes.includes(planet.type)
  );

  // Weight by rarity
  const weighted = [];
  for (const t of eligible) {
    const w = t.rarity === 'common' ? 6 : t.rarity === 'uncommon' ? 3 : 1;
    for (let i = 0; i < w; i++) weighted.push(t);
  }
  if (weighted.length === 0) return null;

  const template = weighted[Math.floor(rng() * weighted.length)];

  // Interpolate description
  const desc = template.description
    .replace(/\{planetName\}/g, planet.name)
    .replace(/\{planetType\}/g, planet.label || planet.type)
    .replace(/\{starName\}/g, star.name)
    .replace(/\{starClass\}/g, star.spectralClass);

  // Add diplomacy choice if upgrade is active
  const effects = getUpgradeEffects(state);
  let choices = [...template.choices];
  if (effects.diplomacy && template.id !== 'mineral_vein') {
    // Add a diplomatic option with good success rate and moderate rewards
    choices.push({
      label: 'Diplomatic approach',
      risk: 'low',
      successRate: 0.80,
      outcomes: {
        success: { fuel: [3, 8], data: [8, 16], lore: 'A measured diplomatic approach yields cooperative results.' },
      },
    });
  }

  return {
    templateId: template.id,
    title: template.title,
    description: desc,
    choices,
    planetKey: key,
    planetSeed: planet.seed,
  };
}

// ── Resolve a player's choice ──

export function resolveChoice(eventInstance, choiceIndex, state) {
  const choice = eventInstance.choices[choiceIndex];
  if (!choice) return { success: false, fuel: 0, data: 0, lore: null };

  const rng = mulberry32(hashInt(eventInstance.planetSeed, choiceIndex * 1000 + 7777));

  // Success roll
  const effects = getUpgradeEffects(state);
  const effectiveRate = Math.min(choice.successRate + effects.successRateBonus, 0.98);
  const roll = rng();
  const success = roll < effectiveRate;

  const outcomeSet = success ? choice.outcomes.success : (choice.outcomes.failure || choice.outcomes.success);

  // Resolve ranges
  const fuel = Math.round(lerp(outcomeSet.fuel[0], outcomeSet.fuel[1], rng()));
  const dataRaw = Math.round(lerp(outcomeSet.data[0], outcomeSet.data[1], rng()));
  const data = Math.round(dataRaw * effects.dataGainMult);
  const lore = outcomeSet.lore || null;

  return { success, fuel, data, lore };
}

export { TEMPLATES as EVENT_TEMPLATES };
