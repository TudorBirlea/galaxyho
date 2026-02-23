import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js?v=3.4';
import { FILM_GRAIN_SHADER, BLOOM_TINT_SHADER } from './shaders.js?v=3.4';

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000005);
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(CONFIG.camera.galaxy.fov, window.innerWidth / window.innerHeight, CONFIG.camera.galaxy.near, CONFIG.camera.galaxy.far);
camera.position.set(...CONFIG.camera.galaxy.pos);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = CONFIG.camera.galaxy.minDist;
controls.maxDistance = CONFIG.camera.galaxy.maxDist;

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

export const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold);
composer.addPass(bloomPass);

// v2: Bloom tint pass — re-saturates bloom areas to preserve spectral star colors
export const bloomTintPass = new ShaderPass(BLOOM_TINT_SHADER);
composer.addPass(bloomTintPass);

// v2: Film grain + vignette post-processing
export const grainPass = new ShaderPass(FILM_GRAIN_SHADER);
grainPass.uniforms.u_grainIntensity.value = CONFIG.filmGrain.intensity;
grainPass.uniforms.u_vignetteStrength.value = CONFIG.vignette.strength;
composer.addPass(grainPass);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

export const clock = new THREE.Clock();
export const galaxyGroup = new THREE.Group();
export const systemGroup = new THREE.Group();
scene.add(galaxyGroup);
scene.add(systemGroup);
systemGroup.visible = false;
