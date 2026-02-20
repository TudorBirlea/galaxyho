import * as THREE from 'three';
import { CONFIG } from './config.js';
import { STAR_VERT, STAR_FRAG, PLANET_VERT, PLANET_FRAG, RING_VERT, RING_FRAG } from './shaders.js';
import { mulberry32 } from './utils.js';
import { generatePlanets } from './data.js';
import { systemGroup, camera } from './engine.js';
import { app } from './app.js';

export function buildSystemView(star) {
  clearSystemView();
  const sc = CONFIG.spectral[star.spectralClass];

  // Central star
  const starGeo = new THREE.SphereGeometry(4 * sc.starScale, 64, 64);
  app.systemStarMesh = new THREE.Mesh(starGeo, new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    uniforms: {
      u_time: { value: 0 },
      u_highTemp: { value: sc.tempK },
      u_spotAmount: { value: sc.spots },
      u_granuleScale: { value: sc.granuleScale },
      u_euvMix: { value: 0.88 },
      u_starColor: { value: new THREE.Color(sc.color) },
    },
  }));
  systemGroup.add(app.systemStarMesh);

  // Planets
  const planets = generatePlanets(star);
  const orbitLineMat = new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.3, depthWrite: false });

  for (const p of planets) {
    const geo = new THREE.SphereGeometry(1, 48, 48);
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
      uniforms: {
        u_time: { value: 0 }, u_type: { value: p.shaderType }, u_seed: { value: (p.seed % 1000) / 1000 },
        u_atm: { value: p.atmValue },
        u_lightDir: { value: new THREE.Vector3(0, 0, 1) },
      },
    }));
    mesh.scale.setScalar(p.visualSize);
    mesh.userData = { planet: p };
    systemGroup.add(mesh);

    let ring = null;
    if (p.hasRings) {
      const rRng = mulberry32(p.seed + 999);
      const ri = p.visualSize * 1.4, ro = p.visualSize * (2 + rRng() * 0.6);
      ring = new THREE.Mesh(
        new THREE.RingGeometry(ri, ro, 128, 4),
        new THREE.ShaderMaterial({
          vertexShader: RING_VERT, fragmentShader: RING_FRAG,
          uniforms: { u_innerR: { value: ri }, u_outerR: { value: ro }, u_seed: { value: (p.seed % 1000) / 1000 } },
          transparent: true, side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2 + (rRng() - 0.5) * 0.3;
      ring.rotation.z = (rRng() - 0.5) * 0.2;
      systemGroup.add(ring);
    }

    // Orbit line
    const oPts = [];
    for (let k = 0; k <= 128; k++) {
      const a = (k / 128) * Math.PI * 2;
      oPts.push(new THREE.Vector3(Math.cos(a) * p.orbitRadius, 0, Math.sin(a) * p.orbitRadius));
    }
    const oLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(oPts), orbitLineMat);
    systemGroup.add(oLine);

    app.systemPlanets.push({ mesh, ring, data: p, orbitLine: oLine });
  }

  // System starfield (sparser)
  const sN = 2000, sPos = new Float32Array(sN * 3), sSz = new Float32Array(sN);
  for (let i = 0; i < sN; i++) {
    const r = 60 + Math.random() * 300, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    sPos[i*3] = r*Math.sin(ph)*Math.cos(th); sPos[i*3+1] = r*Math.sin(ph)*Math.sin(th); sPos[i*3+2] = r*Math.cos(ph);
    sSz[i] = 0.5 + Math.random() * 1.5;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('size', new THREE.BufferAttribute(sSz, 1));
  systemGroup.add(new THREE.Points(sGeo, new THREE.ShaderMaterial({
    vertexShader: `attribute float size;void main(){vec4 mv=modelViewMatrix*vec4(position,1);gl_PointSize=size*(150./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(vec3(.8,.85,.9),(1.-smoothstep(0.,1.,d))*.5);}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  })));
}

export function clearSystemView() {
  while (systemGroup.children.length) {
    const c = systemGroup.children[0];
    systemGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
  }
  app.systemPlanets = [];
  app.systemStarMesh = null;
}

export function updateSystemView(time) {
  if (app.systemStarMesh) app.systemStarMesh.material.uniforms.u_time.value = time;
  const ld = new THREE.Vector3();
  for (const p of app.systemPlanets) {
    const a = p.data.orbitPhase + time * p.data.orbitSpeed;
    const px = Math.cos(a) * p.data.orbitRadius;
    const pz = Math.sin(a) * p.data.orbitRadius;
    p.mesh.position.set(px, 0, pz);
    p.mesh.material.uniforms.u_time.value = time;
    ld.set(-px, 0, -pz).normalize().transformDirection(camera.matrixWorldInverse);
    p.mesh.material.uniforms.u_lightDir.value.copy(ld);
    if (p.ring) p.ring.position.set(px, 0, pz);
  }
}
