export const CONFIG = {
  galaxy: {
    seed: 42,
    starCount: 100,
    fieldRadius: 80,
    fieldHeight: 12,
    minStarDist: 8,
    maxConnections: 5,
    connectionRange: 28,
  },
  spectral: {
    O: { color: 0x2244ff, tempK: 35000, tempLabel: '30,000K+',  spots: 0.02, granuleScale: 1.8, starScale: 1.8, spriteSize: 3.5, minPlanets: 2, maxPlanets: 4 },
    B: { color: 0x22ccff, tempK: 18000, tempLabel: '10-30,000K', spots: 0.05, granuleScale: 1.6, starScale: 1.5, spriteSize: 3.0, minPlanets: 3, maxPlanets: 5 },
    A: { color: 0x33eebb, tempK: 8500,  tempLabel: '7,500-10,000K', spots: 0.1, granuleScale: 1.4, starScale: 1.3, spriteSize: 2.6, minPlanets: 3, maxPlanets: 6 },
    F: { color: 0xeedd44, tempK: 6500,  tempLabel: '6,000-7,500K', spots: 0.5, granuleScale: 1.1, starScale: 1.1, spriteSize: 2.3, minPlanets: 4, maxPlanets: 7 },
    G: { color: 0xffbb00, tempK: 5778,  tempLabel: '5,200-6,000K', spots: 1.0, granuleScale: 1.0, starScale: 1.0, spriteSize: 2.0, minPlanets: 3, maxPlanets: 7 },
    K: { color: 0xff7700, tempK: 4300,  tempLabel: '3,700-5,200K', spots: 0.5, granuleScale: 0.8, starScale: 0.85, spriteSize: 1.7, minPlanets: 3, maxPlanets: 6 },
    M: { color: 0xff2200, tempK: 3100,  tempLabel: '2,400-3,700K', spots: 1.5, granuleScale: 0.5, starScale: 0.65, spriteSize: 1.4, minPlanets: 2, maxPlanets: 5 },
  },
  planetTypes: {
    terran:    { shader: 0, label: 'Terran World',  sizeRange: [4,7], habRange: [55,95], metalRange: [20,60], atmOptions: ['standard','dense'] },
    desert:    { shader: 1, label: 'Desert World',  sizeRange: [3,6], habRange: [5,30],  metalRange: [50,90], atmOptions: ['thin','none'] },
    ice:       { shader: 2, label: 'Ice World',     sizeRange: [2,5], habRange: [0,15],  metalRange: [15,45], atmOptions: ['thin','none'] },
    gas_giant: { shader: 3, label: 'Gas Giant',     sizeRange: [7,10],habRange: [0,0],   metalRange: [0,5],   atmOptions: ['dense'] },
    lava:      { shader: 4, label: 'Lava World',    sizeRange: [2,5], habRange: [0,5],   metalRange: [70,100],atmOptions: ['toxic','thin'] },
    ocean:     { shader: 5, label: 'Ocean World',   sizeRange: [4,8], habRange: [40,85], metalRange: [5,25],  atmOptions: ['standard','dense'] },
  },
  bloom: { strength: 1.0, radius: 0.45, threshold: 0.45 },
  camera: {
    galaxy: { pos: [0, 70, 100], target: [0, 0, 0], fov: 60, near: 1, far: 2000, minDist: 40, maxDist: 200 },
    system: { pos: [0, 10, 30], target: [0, 0, 0], fov: 50, near: 0.1, far: 500, minDist: 5, maxDist: 80 },
  },
};
