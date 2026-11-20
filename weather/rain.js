// 文件职责：GPU 实例化细雨与逆光增亮；对应指导书第 6.3、9 章（M5）。
import * as THREE from 'three';
import { ISLAND_R } from '../world/constants.js';

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createRain(scene, target, weather, count = 10000) {
  const random = mulberry32(65023);
  const starts = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const radius = Math.sqrt(random()) * (ISLAND_R + 7);
    const angle = random() * Math.PI * 2;
    starts[i * 3] = Math.cos(angle) * radius;
    starts[i * 3 + 1] = random() * 40;
    starts[i * 3 + 2] = Math.sin(angle) * radius;
    speeds[i] = 18 + random() * 14;
    seeds[i] = random();
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0,  0.5, 0, 0,  -0.5, 1, 0,
    -0.5, 1, 0,  0.5, 0, 0,   0.5, 1, 0,
  ], 3));
  geometry.setAttribute('aStart', new THREE.InstancedBufferAttribute(starts, 3));
  geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: weather.uTime,
      uRainDensity: weather.uRainDensity,
      uSunDir: weather.uSunDir,
      uSunColor: weather.uSunColor,
      uWindAngle: weather.uWindAngle,
      uWindStrength: weather.uWindStrength,
      uCenter: { value: target },
    },
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.NormalBlending, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aStart;
      attribute float aSpeed;
      attribute float aSeed;
      uniform float uTime;
      uniform float uRainDensity;
      uniform float uWindAngle;
      uniform float uWindStrength;
      uniform vec3 uSunDir;
      uniform vec3 uCenter;
      varying float vAlong;
      varying float vAlpha;
      varying float vBack;
      void main() {
        float y = mod(aStart.y - uTime * aSpeed, 40.0);
        vec3 center = vec3(uCenter.x + aStart.x, y, uCenter.z + aStart.z);
        vec3 wind = vec3(sin(uWindAngle), 0.0, cos(uWindAngle)) * uWindStrength;
        vec3 up = normalize(vec3(-wind.x, 1.0, -wind.z));
        vec3 right = normalize(cross(up, cameraPosition - center));
        float distanceToCamera = length(cameraPosition - center);
        float width = mix(0.055, 0.15, clamp(distanceToCamera / 130.0, 0.0, 1.0));
        float lengthDrop = mix(1.0, 1.6, aSeed);
        vec3 world = center + up * ((position.y - 0.5) * lengthDrop) + right * position.x * width;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        vAlong = position.y;
        // uSunDir 指向太阳；相机朝太阳看时，视线与 -uSunDir 同向。
        vBack = pow(max(dot(normalize(center - cameraPosition), -normalize(uSunDir)), 0.0), 6.0);
        float nearFade = smoothstep(3.0, 6.0, distanceToCamera);
        float farFade = 1.0 - smoothstep(125.0, 180.0, distanceToCamera);
        float groundFade = smoothstep(0.3, 1.5, y);
        vAlpha = step(aSeed, uRainDensity) * nearFade * farFade * groundFade;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunColor;
      varying float vAlong;
      varying float vAlpha;
      varying float vBack;
      void main() {
        float taper = smoothstep(0.0, 0.15, vAlong) * (1.0 - smoothstep(0.85, 1.0, vAlong));
        vec3 color = mix(vec3(0.85, 0.92, 1.0), uSunColor * 1.6, vBack);
        float alpha = mix(0.34, 0.7, vBack) * taper * vAlpha;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const rain = new THREE.Mesh(geometry, material);
  rain.frustumCulled = false;
  rain.renderOrder = 5;
  rain.castShadow = false;
  rain.receiveShadow = false;
  scene.add(rain);
  return rain;
}
