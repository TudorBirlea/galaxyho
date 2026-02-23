// Shared mutable runtime state — all modules read/write through this object
export const app = {
  state: null,              // SaveState { visitedStars, reachableStars, shipStarId, ... }
  galaxy: null,             // Generated galaxy data { seed, stars[] }
  selectedStar: null,       // Currently selected star in galaxy view
  starSprites: [],          // Parallel to Points vertex order [{star}]
  galaxyStarsMat: null,     // ShaderMaterial ref for time uniform updates
  systemPlanets: [],        // [{mesh, ring, data, orbitLine, atmosMesh}]
  systemStarMesh: null,     // Current system star mesh
  journalVisible: false,    // Journal panel open/closed
  transitioning: false,     // Camera transition in progress
  shipMarkerMat: null,      // Ship marker ShaderMaterial (for u_time)
  // ── v2 additions ──
  nebulaMeshes: [],         // All nebula planes (for billboarding + time updates)
  bgStarLayers: [],         // [{points, drift}] for galaxy BG parallax
  camOrigin: null,          // Camera start position for parallax calc
  // ── v3 additions ──
  dustLaneMeshes: [],       // Dark dust lane planes in galaxy view
  warpTrailEntries: [],     // [{points, material}] particle trails in galaxy view
  asteroidBeltMesh: null,   // InstancedMesh for system asteroid belt
  neutronBeamGroup: null,   // Rotating beam cones for neutron stars
  selectionRing: null,      // Planet selection indicator mesh
  selectedPlanetId: null,   // Currently selected planet id in system view
};
