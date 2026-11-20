// 文件职责：约 300 个 GPU 驱动的小皇冠溅射；对应指导书第 6.4、9 章（M5）。
import * as THREE from 'three';
import { shoreZ } from '../world/water.js';
import { SAFE_R, WATER_Y } from '../world/constants.js';

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createSplashes(scene, weather, count = 300) {
  const random = mulberry32(80214);
  const positions = [];
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade / 5 * Math.PI * 2;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const px = -dz, pz = dx;
    positions.push(
      dx * 0.04 + px * 0.035, 0, dz * 0.04 + pz * 0.035,
      dx * 0.04 - px * 0.035, 0, dz * 0.04 - pz * 0.035,
      dx * 0.18, 1, dz * 0.18,
    );
  }
  const origins = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const radius = Math.sqrt(random()) * (SAFE_R - 1);
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    origins[i * 3] = x;
    origins[i * 3 + 1] = z > shoreZ(x) ? -0.25 : WATER_Y + 0.08;
    origins[i * 3 + 2] = z;
    phases[i] = random();
    seeds[i] = random();
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origins, 3));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: weather.uTime, uRainDensity: weather.uRainDensity },
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aOrigin;
      attribute float aPhase;
      attribute float aSeed;
      uniform float uTime;
      uniform float uRainDensity;
      varying float vAlpha;
      void main() {
        float life = fract(uTime / 0.35 + aPhase);
        float rise = sin(life * 3.14159) * 0.20;
        vec3 world = aOrigin + vec3(position.x * (0.55 + life), position.y * rise, position.z * (0.55 + life));
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        vAlpha = (1.0 - life) * step(aSeed, uRainDensity) * 0.65;
      }
    `,
    fragmentShader: `varying float vAlpha;
      void main() {
        if (vAlpha < 0.02) discard;
        gl_FragColor = vec4(0.94, 0.98, 1.0, vAlpha);
        #include <colorspace_fragment>
      }`,
  });
  const splashes = new THREE.Mesh(geometry, material);
  splashes.frustumCulled = false;
  splashes.renderOrder = 6;
  scene.add(splashes);
  return splashes;
}
