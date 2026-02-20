// Shared mutable runtime state — all modules read/write through this object
export const app = {
  state: null,              // SaveState { visitedStars, reachableStars, ... }
  galaxy: null,             // Generated galaxy data { seed, stars[] }
  selectedStar: null,       // Currently selected star in galaxy view
  starSprites: [],          // Parallel to Points vertex order [{star}]
  galaxyStarsMat: null,     // ShaderMaterial ref for time uniform updates
  systemPlanets: [],        // [{mesh, ring, data, orbitLine}]
  systemStarMesh: null,     // Current system star mesh
};
