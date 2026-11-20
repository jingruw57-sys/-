// 文件职责：码头石岸上的程序化水洼与雨滴圆环；对应指导书第 5.3、9 章（M5）。
import * as THREE from 'three';
import { WATER_Y } from './constants.js';

function puddleGeometry(radius, seed) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 28; i++) {
    const angle = i / 28 * Math.PI * 2;
    const edge = radius * (1 + 0.12 * Math.sin(angle * 5 + seed) + 0.07 * Math.cos(angle * 8 - seed));
    const x = Math.cos(angle) * edge, y = Math.sin(angle) * edge * 0.7;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function createPuddles(scene, weather) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: weather.uTime,
      uRainDensity: weather.uRainDensity,
      uSkyTop: { value: new THREE.Color('#4FA3E8') },
      uSkyHorizon: { value: new THREE.Color('#BFE6FF') },
    },
    transparent: true, depthWrite: false, depthTest: true,
    polygonOffset: true, polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 vLocal;
      varying vec3 vWorld;
      void main() {
        vLocal = position.xz;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `uniform float uTime;
      uniform float uRainDensity;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyHorizon;
      varying vec2 vLocal;
      varying vec3 vWorld;
      float circle(vec2 p, vec2 c, float phase) {
        float radius = fract(uTime * 0.6 + phase) * 0.55;
        float age = fract(uTime * 0.6 + phase);
        return (1.0 - smoothstep(0.012, 0.045, abs(length(p - c) - radius))) * (1.0 - age);
      }
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 2.0);
        vec3 color = mix(uSkyTop, uSkyHorizon, 0.4 + 0.6 * fresnel);
        float ring = circle(vLocal, vec2(-0.15, 0.08), 0.2)
          + circle(vLocal, vec2(0.21, -0.12), 0.65);
        color = mix(color, vec3(1.0), clamp(ring * uRainDensity * 0.65, 0.0, 0.8));
        gl_FragColor = vec4(color, 0.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const locations = [[-16, -1.65, 0.52], [-7.4, -1.65, 0.42], [7.8, -1.65, 0.55], [17, -1.65, 0.48], [2.4, -1.65, 0.37]];
  const puddles = [];
  locations.forEach(([x, z, radius], i) => {
    const mesh = new THREE.Mesh(puddleGeometry(radius, i * 1.8), material);
    mesh.position.set(x, WATER_Y + 0.72, z);
    mesh.renderOrder = 3;
    mesh.castShadow = false;
    scene.add(mesh);
    puddles.push(mesh);
  });
  return puddles;
}
