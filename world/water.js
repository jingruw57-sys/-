// 文件职责：程序化卡通海面、多层水色、岸线泡沫、碎金反射与统一波函数。
import * as THREE from 'three';
import { WATER_Y, ISLAND_R } from './constants.js';
import { BEACH, BEACH_WATERLINE_RADIUS } from './beach.js';

export const WATER_COLORS = {
  shallow: '#73E3D2',
  mid: '#45BCD2',
  deep: '#3095BE',
  abyss: '#257FAC',
};
const WAVE_EDGE_START = ISLAND_R - 1.2;

// 同一组海岸控制点供陆地几何和水面 shader 使用，避免接缝错位。
export const COAST = [
  [-(ISLAND_R - 1), 0], [-33, -2], [-29, -4], [-25, -3], [-22, -2],
  [-20, -2], [20, -2], [22, -3], [25, -1], [28, 1.8], [31, 3], [34, 2.8], [ISLAND_R - 1, 0],
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
const coastGLSL = `
  float shoreZ(float x) { ${coastSegments} return 0.0; }
  float shoreDistance(vec2 p) {
    float mainland = shoreZ(p.x) - p.y;
    float beach = length(p - vec2(${BEACH.x.toFixed(3)}, ${BEACH.z.toFixed(3)}))
      - ${BEACH_WATERLINE_RADIUS.toFixed(3)};
    return min(mainland, beach);
  }
`;

export function createWater(scene, weather, contactShadow) {
  // 没传接触阴影时用 1×1 透明纹理兜底，避免 sampler 为空导致整片水面编译失败。
  let shadowTexture = contactShadow?.texture;
  if (!shadowTexture) {
    shadowTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    shadowTexture.needsUpdate = true;
  }

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog,
    {
      uTime: weather.uTime,
      uRainDensity: weather.uRainDensity,
      uSunDir: weather.uSunDir,
      uSunColor: weather.uSunColor,
      uShallow: { value: new THREE.Color(WATER_COLORS.shallow) },
      uMid: { value: new THREE.Color(WATER_COLORS.mid) },
      uDeep: { value: new THREE.Color(WATER_COLORS.deep) },
      uAbyss: { value: new THREE.Color(WATER_COLORS.abyss) },
      uSky: { value: new THREE.Color('#BFE6FF') },
      uFoam: { value: new THREE.Color('#F6F1E7') },
      uReef: { value: new THREE.Color('#96E8C6') },
      uRainTint: { value: new THREE.Color('#7899BC') },
    },
  ]);
  // merge 会克隆 uniform；重新接回共享引用，便于天气系统统一更新。
  for (const name of ['uTime', 'uRainDensity', 'uSunDir', 'uSunColor']) uniforms[name] = weather[name];
  uniforms.uContactShadow = { value: shadowTexture };
  uniforms.uContactDiameter = { value: contactShadow?.diameter ?? 1 };

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
        float offshore = smoothstep(0.22, 2.5, shoreDistance(position.xz));
        // 圆盘边缘收平，让起伏的水面自然接到外圈侧壁。
        float edgeWave = 1.0 - smoothstep(${WAVE_EDGE_START.toFixed(2)}, ${ISLAND_R.toFixed(1)}, length(position.xz));
        transformed.y += waveHeight(position.xz, uTime) * offshore * edgeWave;
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
      uniform vec3 uMid;
      uniform vec3 uDeep;
      uniform vec3 uAbyss;
      uniform vec3 uSky;
      uniform vec3 uFoam;
      uniform vec3 uReef;
      uniform vec3 uRainTint;
      uniform float uRainDensity;
      uniform sampler2D uContactShadow;
      uniform float uContactDiameter;
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
        float radius = length(p);
        if (radius > ${ISLAND_R.toFixed(1)}) discard;
        float offshore = max(shoreDistance(p), 0.0);

        // 用离岸距离混合四层水色。外圈轻微反射天空。
        vec3 color = mix(uShallow, uMid, smoothstep(0.8, 4.5, offshore));
        color = mix(color, uDeep, smoothstep(4.5, 12.0, offshore));
        color = mix(color, uAbyss, smoothstep(12.0, 24.0, offshore));
        float rim = smoothstep(30.0, ${ISLAND_R.toFixed(1)}, radius);
        color = mix(color, uSky, rim * 0.14);

        // 礁盘的位置固定，洋流的明暗变化轻而缓慢。
        float reefPattern = sin(p.x * 0.42 + 1.7) * sin(p.y * 0.51 - 0.9)
          + 0.6 * sin(p.x * 0.23 - p.y * 0.31 + 2.3);
        float reefMask = (1.0 - smoothstep(2.0, 11.0, offshore)) * smoothstep(0.05, 0.75, reefPattern);
        color = mix(color, uReef, reefMask * 0.38);
        float flow = sin(p.x * 0.105 + p.y * 0.072 + uTime * 0.07)
          + sin(p.y * 0.128 - p.x * 0.049 - uTime * 0.052);
        color *= 0.97 + flow * 0.035;

        // ---------- 水面法线与天光 ----------
        float hx = waveHeight(p + vec2(0.15, 0.0), uTime) - waveHeight(p - vec2(0.15, 0.0), uTime);
        float hz = waveHeight(p + vec2(0.0, 0.15), uTime) - waveHeight(p - vec2(0.0, 0.15), uTime);
        vec3 normal = normalize(vec3(-hx / 0.3, 1.0, -hz / 0.3));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndv = max(dot(normal, viewDir), 0.0);
        float fresnel = pow(1.0 - ndv, 3.0);
        // 天光里掺一点太阳暖色，掠射角反射不会是死板的纯蓝。
        vec3 skyTone = mix(uSky, uSunColor, 0.16);
        color = mix(color, skyTone, fresnel * 0.52);
        color = mix(color, mix(color * 0.88, uRainTint, 0.22), uRainDensity * 0.28);

        // ---------- 以下为原有的波浪线、碎金、雨滴涟漪、泡沫与阴影 ----------
        float waveLine = sin(p.x * 0.95 + uTime * 0.72 + sin(p.y * 0.5) * 0.9);
        float broken = sin(p.y * 1.55 - uTime * 0.55 + sin(p.x * 0.36));
        float stripe = smoothstep(0.82, 0.98, waveLine) * smoothstep(0.38, 0.84, broken);
        color = mix(color, skyTone, stripe * 0.28);
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
        color *= mix(0.90, 1.0, shadow);
        vec2 contactUV = vec2(p.x, -p.y) / uContactDiameter + 0.5;
        float contact = texture2D(uContactShadow, contactUV).a;
        color *= 1.0 - 0.32 * contact * smoothstep(0.0, 0.45, offshore);
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
