// 文件职责：三阶冷暖卡通材质与背面外扩描边；对应指导书第 2、4、9 章（M2）。
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// 所有卡通材质共用同一批 uniform 引用，后续 GUI 可一次调整全场。
export const sharedUniforms = {
  uSunColor: { value: new THREE.Color('#FFF1C9') },
  uWarmTint: { value: new THREE.Color('#FFE8B0') },
  uShadowTint: { value: new THREE.Color('#6C7BB8') },
  uCoolWarm: { value: 0.7 },
  uWetness: { value: 0.7 },
  uOutlineWidth: { value: 0.045 },
};

const materialCache = new Map();

// 全局缓存同色材质，旗子需双面时直接建对应材质，不使用 clone。
export function makeToonMaterial(color, options = {}) {
  const side = options.side ?? THREE.FrontSide;
  const emissive = options.emissive ?? '#000000';
  const emissiveIntensity = options.emissiveIntensity ?? 1;
  const vertexColors = options.vertexColors ?? false;
  const key = `${color}|${side}|${emissive}|${emissiveIntensity}|${vertexColors}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const material = new THREE.MeshLambertMaterial({ color, side, emissive, emissiveIntensity, vertexColors });
  material.userData.isToon = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms);
    shader.fragmentShader = `
      uniform vec3 uSunColor;
      uniform vec3 uWarmTint;
      uniform vec3 uShadowTint;
      uniform float uCoolWarm;
      uniform float uWetness;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `
      vec3 toonNormal = normalize(normal);
      vec3 toonView = normalize(vViewPosition);
      vec3 toonLight = normalize(directionalLights[0].direction);
      float toonShadow = 1.0;
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow toonShadowData = directionalLightShadows[0];
        toonShadow = receiveShadow ? getShadow(
          directionalShadowMap[0], toonShadowData.shadowMapSize,
          toonShadowData.shadowBias, toonShadowData.shadowRadius,
          vDirectionalShadowCoord[0]
        ) : 1.0;
      #endif
      float toonValue = max(dot(toonNormal, toonLight), 0.0) * toonShadow;
      float middleBand = smoothstep(0.13, 0.17, toonValue);
      float lightBand = smoothstep(0.53, 0.57, toonValue);
      vec3 cool = mix(vec3(0.66), uShadowTint * 1.7, uCoolWarm);
      vec3 warm = mix(vec3(1.0), uWarmTint, uCoolWarm);
      vec3 wetBase = diffuseColor.rgb * mix(1.0, 0.9, uWetness);
      vec3 darkColor = wetBase * cool;
      vec3 midColor = mix(wetBase, darkColor, 0.40) * 1.12;
      float sunIntensity = directionalLights[0].color.r / 3.0;
      vec3 lightColor = wetBase * warm * 1.55 * sunIntensity;
      vec3 toonColor = mix(mix(darkColor, midColor, middleBand), lightColor, lightBand);
      // 色阶着色使用自己的光照计算，显式加入半球光和反向补光。
      #if NUM_HEMI_LIGHTS > 0
        toonColor += wetBase * getHemisphereLightIrradiance(hemisphereLights[0], toonNormal) * 0.18 * (1.0 - lightBand);
      #endif
      #if NUM_DIR_LIGHTS > 1
        float fill = max(dot(toonNormal, directionalLights[1].direction), 0.0);
        toonColor += wetBase * directionalLights[1].color * fill * 0.38 * (1.0 - lightBand);
      #endif
      float rim = smoothstep(0.60, 0.65, pow(1.0 - max(dot(toonNormal, toonView), 0.0), 3.0));
      rim *= step(0.3, dot(-toonView, toonLight));
      toonColor += rim * uSunColor * 0.6;
      vec3 worldNormal = normalize(inverseTransformDirection(toonNormal, viewMatrix));
      vec3 halfVector = normalize(toonLight + toonView);
      float specular = pow(max(dot(toonNormal, halfVector), 0.0), 80.0);
      float hardHighlight = smoothstep(0.48, 0.52, specular);
      float upward = smoothstep(0.5, 0.7, worldNormal.y);
      toonColor += uSunColor * 1.4 * hardHighlight * upward * uWetness * toonShadow * sunIntensity;
      reflectedLight.directDiffuse = toonColor;
    `);
    // 补光已在上面加入，避免用默认光照再计算一次。
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', '');
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', '');
  };
  material.customProgramCacheKey = () => 'solar-rain-toon-v3';
  materialCache.set(key, material);
  return material;
}

export const getToon = makeToonMaterial;

const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { uWidth: sharedUniforms.uOutlineWidth, uColor: { value: new THREE.Color('#2B2A3A') } },
  side: THREE.BackSide,
  depthWrite: true,
  vertexShader: `uniform float uWidth;
    void main() {
      mat4 transform = modelMatrix;
      #ifdef USE_INSTANCING
        transform = modelMatrix * instanceMatrix;
      #endif
      vec4 viewPos = viewMatrix * transform * vec4(position, 1.0);
      float scale = clamp(-viewPos.z / 80.0, 0.55, 1.8);
      vec3 expanded = position + normal * uWidth * scale;
      gl_Position = projectionMatrix * viewMatrix * transform * vec4(expanded, 1.0);
    }`,
  fragmentShader: `uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
      #include <colorspace_fragment>
    }`,
});

// 删除硬边法线和 UV 后合并顶点，使盒子描边在角上连续。
export function addOutline(mesh) {
  const geometry = mesh.geometry.clone();
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const smooth = mergeVertices(geometry);
  smooth.computeVertexNormals();
  geometry.dispose();
  const outline = mesh.isInstancedMesh
    ? new THREE.InstancedMesh(smooth, outlineMaterial, mesh.count)
    : new THREE.Mesh(smooth, outlineMaterial);
  if (mesh.isInstancedMesh) {
    outline.instanceMatrix.array.set(mesh.instanceMatrix.array);
    outline.instanceMatrix.needsUpdate = true;
    outline.frustumCulled = false;
  }
  outline.name = `${mesh.name || 'mesh'}-outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  // 作为原网格的子节点，后续旋转或缩放船体、木箱时轮廓仍与表面重合。
  mesh.add(outline);
  return outline;
}
