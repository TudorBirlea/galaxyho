import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GALAXY_STAR_VERT, GALAXY_STAR_FRAG } from './shaders.js';
import { galaxyGroup } from './engine.js';
import { app } from './app.js';

export function buildGalaxyView(galaxy, state) {
  // Clear previous
  while (galaxyGroup.children.length) { const c = galaxyGroup.children[0]; galaxyGroup.remove(c); }
  app.starSprites = [];

  // Background starfield
  const bgN = 4000, bgPos = new Float32Array(bgN * 3), bgCol = new Float32Array(bgN * 3), bgSz = new Float32Array(bgN);
  for (let i = 0; i < bgN; i++) {
    const r = 100 + Math.random() * 500, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    bgPos[i*3] = r*Math.sin(ph)*Math.cos(th); bgPos[i*3+1] = r*Math.sin(ph)*Math.sin(th); bgPos[i*3+2] = r*Math.cos(ph);
    const t = Math.random(); bgCol[i*3] = t<0.3?0.7:1; bgCol[i*3+1] = t<0.3?0.8:t<0.7?1:0.85; bgCol[i*3+2] = t<0.3?1:t<0.7?0.95:0.7;
    bgSz[i] = 0.8 + Math.random() * 2;
  }
  const bgGeo = new THREE.BufferGeometry();
  bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
  bgGeo.setAttribute('color', new THREE.BufferAttribute(bgCol, 3));
  bgGeo.setAttribute('size', new THREE.BufferAttribute(bgSz, 1));
  galaxyGroup.add(new THREE.Points(bgGeo, new THREE.ShaderMaterial({
    vertexShader: `attribute float size;varying vec3 vC;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1);gl_PointSize=size*(200./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vC;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vC,(1.-smoothstep(0.,1.,d))*.7);}`,
    transparent: true, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending
  })));

  // Build galaxy stars as a single Points object
  const stars = galaxy.stars;
  const n = stars.length;
  const sPos = new Float32Array(n * 3), sCol = new Float32Array(n * 3);
  const aSz = new Float32Array(n), aSd = new Float32Array(n), aBr = new Float32Array(n), aVs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const star = stars[i];
    const reachable = state.reachableStars.has(star.id);
    const visited = state.visitedStars.has(star.id);
    const sc = CONFIG.spectral[star.spectralClass];
    const col = new THREE.Color(sc.color);
    sPos[i*3] = star.position.x; sPos[i*3+1] = star.position.y; sPos[i*3+2] = star.position.z;
    sCol[i*3] = col.r; sCol[i*3+1] = col.g; sCol[i*3+2] = col.b;
    aSz[i] = sc.spriteSize * (reachable ? 1.0 : 0.35);
    aSd[i] = (star.seed % 1000) / 1000;
    aBr[i] = reachable ? (visited ? 0.75 : 1.0) : 0.12;
    aVs[i] = visited ? 1.0 : 0.0;
    app.starSprites.push({ star });
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(aSz, 1));
  sGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSd, 1));
  sGeo.setAttribute('aBright', new THREE.BufferAttribute(aBr, 1));
  sGeo.setAttribute('aVisited', new THREE.BufferAttribute(aVs, 1));

  app.galaxyStarsMat = new THREE.ShaderMaterial({
    vertexShader: GALAXY_STAR_VERT, fragmentShader: GALAXY_STAR_FRAG,
    uniforms: { u_time: { value: 0 } },
    transparent: true, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  galaxyGroup.add(new THREE.Points(sGeo, app.galaxyStarsMat));

  // Connection lines between adjacent stars
  const drawn = new Set();
  for (const star of stars) {
    for (const adjId of star.adjacentIds) {
      const key = Math.min(star.id, adjId) + '-' + Math.max(star.id, adjId);
      if (drawn.has(key)) continue;
      drawn.add(key);
      const adj = stars[adjId];
      const bothReachable = state.reachableStars.has(star.id) && state.reachableStars.has(adjId);
      const anyReachable = state.reachableStars.has(star.id) || state.reachableStars.has(adjId);
      const lineMat = new THREE.LineBasicMaterial({
        color: bothReachable ? 0x334466 : 0x111118,
        transparent: true, opacity: anyReachable ? 0.2 : 0.04, depthWrite: false
      });
      const pts = [
        new THREE.Vector3(star.position.x, star.position.y, star.position.z),
        new THREE.Vector3(adj.position.x, adj.position.y, adj.position.z)
      ];
      galaxyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
  }
}
