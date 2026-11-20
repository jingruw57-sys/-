// 文件职责：程序化卡通海面、岸线泡沫、碎金反射与统一波函数；对应指导书第 5.5、9 章（M4）。
import * as THREE from 'three';
import { WATER_Y, ISLAND_R } from './constants.js';

// 同一组海岸控制点供陆地几何和水面 shader 使用，避免接缝错位。
export const COAST = [
  [-(ISLAND_R - 1), 0], [-33, -2], [-29, -4], [-25, -3], [-22, -2],
  [-20, -2], [20, -2], [22, -3], [29, -4], [34, -2], [ISLAND_R - 1, 0],
];

export function shoreZ(x) {
  for (let i = 0; i < COAST.length - 1; i++) {
    const [leftX, leftZ] = COAST[i];
    const [rightX, rightZ] = COAST[i + 1];
    if (x <= rightX) return THREE.MathUtils.lerp(leftZ, rightZ, THREE.MathUtils.clamp((x - leftX) / (rightX - leftX), 0, 1));
  }
  return COAST.at(-1)[1];
}

// CPU 与 GPU 使用完全相同的频率、相位和振幅，船只不会在水面上滑动。
export function waveHeight(x, z, time) {
  return 0.06 * Math.sin(x * 0.4 + time * 1.5)
    + 0.04 * Math.sin(z * 0.55 - time * 1.2)
    + 0.025 * Math.sin((x + z) * 0.31 + time * 0.8);
}

const waveGLSL = `
  float waveHeight(vec2 p, float t) {
    return 0.06 * sin(p.x * 0.4 + t * 1.5)
      + 0.04 * sin(p.y * 0.55 - t * 1.2)
      + 0.025 * sin((p.x + p.y) * 0.31 + t * 0.8);
  }
`;

const coastSegments = COAST.slice(0, -1).map(([x, z], i) => {
  const [nextX, nextZ] = COAST[i + 1];
  return `if (x <= ${nextX.toFixed(1)}) return mix(${z.toFixed(1)}, ${nextZ.toFixed(1)}, clamp((x - ${x.toFixed(1)}) / ${(nextX - x).toFixed(1)}, 0.0, 1.0));`;
}).join('\n');
const coastGLSL = `float shoreZ(float x) { ${coastSegments} return 0.0; }`;

export function createWater(scene, weather) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog,
    {
      uTime: weather.uTime,
      uRainDensity: weather.uRainDensity,
      uSunDir: weather.uSunDir,
      uSunColor: weather.uSunColor,
      uShallow: { value: new THREE.Color('#4CC4C9') },
      uDeep: { value: new THREE.Color('#1F6E9C') },
      uSky: { value: new THREE.Color('#BFE6FF') },
      uFoam: { value: new THREE.Color('#F6F1E7') },
    },
  ]);
  // merge 会克隆 uniform；重新接回共享引用，便于天气系统统一更新。
  for (const name of ['uTime', 'uRainDensity', 'uSunDir', 'uSunColor']) uniforms[name] = weather[name];
  const material = new THREE.ShaderMaterial({
    uniforms, lights: true, fog: true, side: THREE.FrontSide,
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec3 vWorldPos;
      ${waveGLSL}
      ${coastGLSL}
      void main() {
        vec3 transformed = position;
        float offshore = smoothstep(0.0, 2.5, shoreZ(position.x) - position.z);
        transformed.y += waveHeight(position.xz, uTime) * offshore;
        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
          vDirectionalShadowCoord[0] = directionalShadowMatrix[0] * (worldPosition + vec4(0.0, 0.02, 0.0, 0.0));
        #endif
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <shadowmap_pars_fragment>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSky;
      uniform vec3 uFoam;
      uniform float uRainDensity;
      varying vec3 vWorldPos;
      ${waveGLSL}
      ${coastGLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ripple(vec2 p, float scale, float speed) {
        vec2 cell = floor(p * scale);
        vec2 local = fract(p * scale);
        vec2 center = vec2(0.2 + 0.6 * hash(cell + 3.1), 0.2 + 0.6 * hash(cell + 7.7));
        float age = fract(uTime * speed + hash(cell + 12.4));
        float radius = age * 0.55;
        float ring = 1.0 - smoothstep(0.012, 0.05, abs(length(local - center) - radius));
        return ring * (1.0 - age);
      }
      void main() {
        vec2 p = vWorldPos.xz;
        if (length(p) > ${ISLAND_R.toFixed(1)}) discard;
        float offshore = max(shoreZ(p.x) - p.y, 0.0);
        float depthBand = step(4.0, offshore) * 0.45 + step(10.0, offshore) * 0.55;
        vec3 color = mix(uShallow, uDeep, depthBand * 0.78);
        float hx = waveHeight(p + vec2(0.15, 0.0), uTime) - waveHeight(p - vec2(0.15, 0.0), uTime);
        float hz = waveHeight(p + vec2(0.0, 0.15), uTime) - waveHeight(p - vec2(0.0, 0.15), uTime);
        vec3 normal = normalize(vec3(-hx / 0.3, 1.0, -hz / 0.3));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        color = mix(color, uSky, fresnel * 0.24);
        float waveLine = sin(p.x * 0.95 + uTime * 0.72 + sin(p.y * 0.5) * 0.9);
        float broken = sin(p.y * 1.55 - uTime * 0.55 + sin(p.x * 0.36));
        float stripe = smoothstep(0.82, 0.98, waveLine) * smoothstep(0.38, 0.84, broken);
        color = mix(color, uSky, stripe * 0.28);
        vec3 reflected = reflect(-normalize(uSunDir), normal);
        float sunReflection = pow(max(dot(reflected, viewDir), 0.0), 8.0);
        float fleck = stripe
          * smoothstep(0.05, 0.68, sin(p.x * 2.6 - p.y * 1.4 + sin(p.y * 3.0 + uTime * 0.4)))
          * smoothstep(-0.2, 0.6, sin(p.y * 2.8 + uTime * 0.9));
        vec2 sunAxis = normalize(reflected.xz);
        vec2 projectedCamera = vec2(0.0, -12.0) + cameraPosition.xz * 0.05;
        float crossSun = abs(dot(p - projectedCamera, vec2(-sunAxis.y, sunAxis.x)));
        float goldPath = exp(-crossSun * crossSun / 150.0);
        vec3 gold = uSunColor * vec3(1.0, 0.76, 0.5) * 1.45;
        float goldStreak = goldPath
          * smoothstep(0.67, 0.94, sin(p.x * 1.35 + sin(p.y * 0.8) + uTime * 0.8))
          * smoothstep(0.15, 0.72, sin(p.y * 2.4 - uTime * 0.5));
        color = mix(color, gold, clamp(fleck * (0.18 + 0.9 * goldPath + sunReflection) + goldStreak * 0.56, 0.0, 0.85));
        float rainRings = ripple(p, 0.55, 0.55) + 0.65 * ripple(p + 13.7, 1.35, 0.78);
        color = mix(color, uFoam, clamp(rainRings * uRainDensity * 0.48, 0.0, 0.62));
        float foamLine = 1.0 - smoothstep(0.12, 0.55, offshore);
        float foamNoise = 0.75 + 0.25 * sin(p.x * 2.5 + uTime * 1.2);
        color = mix(color, uFoam, foamLine * foamNoise * 0.85);
        float shadow = 1.0;
        #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
          DirectionalLightShadow s = directionalLightShadows[0];
          shadow = getShadow(directionalShadowMap[0], s.shadowMapSize, s.shadowBias, s.shadowRadius, vDirectionalShadowCoord[0]);
        #endif
        color *= mix(0.86, 1.0, shadow);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(ISLAND_R * 2, ISLAND_R * 2, 144, 144);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = WATER_Y;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return { mesh, uniforms };
}
