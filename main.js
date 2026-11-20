// 文件职责：微缩渔港、太阳雨与可步行探索的游戏镜头；对应指导书第 1～6、8、9 章及游戏扩展。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeToonMaterial, addOutline } from './toon/materials.js';
import { addBoats, updateBoats } from './world/boats.js';
import { addHarbor } from './world/harbor.js';
import { addHouses } from './world/houses.js';
import { addProps, updateProps } from './world/props.js';
import { createWater, COAST } from './world/water.js';
import { createWeatherUniforms } from './weather/shared.js';
import { createRain } from './weather/rain.js';
import { createSplashes } from './weather/splashes.js';
import { createPuddles } from './world/puddles.js';
import { ISLAND_R, SAFE_R, WATER_Y } from './world/constants.js';
import { mergeToonMeshes } from './world/merge.js';
import { createPlayerController } from './game/player.js?v=map-2';
import { addRoutes } from './world/routes.js';
import { createMinimap } from './game/minimap.js';

const app = document.querySelector('#app');
const loading = document.querySelector('#loading');
const perf = document.querySelector('#perf');
const scene = new THREE.Scene();
const clock = new THREE.Clock();
const STATE = {
  sunDir: new THREE.Vector3(0.52, 0.72, -0.46).normalize(),
  sunColor: new THREE.Color('#FFF1C9'),
  time: 0,
  rain: 0.7,
  wetness: 0.7,
  windAngle: 0.6,
  windStrength: 0.14,
};

// 第 3.1 节：较硬的阴影与亮度设置；像素比限制有利于集显。
function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  app.appendChild(renderer.domElement);
  return renderer;
}

const renderer = setupRenderer();

// 第 3.2 节：25° FOV、阻尼、极角限制与双击平滑复位。
function setupCamera() {
  const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 800);
  let walking = false;
  let followPlayer = null;
  // 观景模式保持微缩取景；步行模式使用近距离的游戏镜头。
  const fitNarrowScreen = () => {
    camera.zoom = walking ? 1 : Math.min(1, Math.max(0.35, camera.aspect / 1.6));
    camera.updateProjectionMatrix();
  };
  fitNarrowScreen();
  const initialPosition = new THREE.Vector3(64, 70, 90);
  const initialTarget = new THREE.Vector3(0, 1, 0);
  camera.position.copy(initialPosition);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(initialTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 25;
  controls.maxDistance = 180;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.enablePan = true;
  controls.autoRotate = false;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.update();

  let resetElapsed = -1;
  const resetFromPosition = new THREE.Vector3();
  const resetFromTarget = new THREE.Vector3();
  const resetToPosition = initialPosition.clone();
  const resetToTarget = initialTarget.clone();
  renderer.domElement.addEventListener('dblclick', () => {
    resetFromPosition.copy(camera.position);
    resetFromTarget.copy(controls.target);
    if (walking && followPlayer) {
      resetToPosition.copy(followPlayer.position).add(new THREE.Vector3(0, 7, 12));
      resetToTarget.copy(followPlayer.position).add(new THREE.Vector3(0, 1.2, 0));
    } else {
      resetToPosition.copy(initialPosition);
      resetToTarget.copy(initialTarget);
    }
    resetElapsed = 0;
  });
  function update(delta) {
    if (walking && followPlayer && resetElapsed < 0) {
      const wanted = new THREE.Vector3(followPlayer.position.x, followPlayer.position.y + 1.2, followPlayer.position.z);
      const before = controls.target.clone();
      controls.target.lerp(wanted, Math.min(1, delta * 7));
      camera.position.add(controls.target.clone().sub(before));
    }
    if (resetElapsed >= 0) {
      resetElapsed = Math.min(0.8, resetElapsed + delta);
      const t = 1 - Math.pow(1 - resetElapsed / 0.8, 3);
      camera.position.lerpVectors(resetFromPosition, resetToPosition, t);
      controls.target.lerpVectors(resetFromTarget, resetToTarget, t);
      if (resetElapsed >= 0.8) resetElapsed = -1;
    }
    if (!walking) {
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -SAFE_R + 7, SAFE_R - 7);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 6);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -SAFE_R + 7, SAFE_R - 7);
    }
    controls.update();
  }
  function setWalking(enabled, player) {
    walking = enabled;
    followPlayer = enabled ? player : null;
    resetElapsed = -1;
    camera.fov = enabled ? 38 : 25;
    controls.minDistance = enabled ? 6 : 25;
    controls.maxDistance = enabled ? 26 : 180;
    controls.minPolarAngle = enabled ? 0.35 : 0.25;
    controls.maxPolarAngle = enabled ? 1.35 : Math.PI * 0.46;
    controls.enablePan = !enabled;
    if (enabled) {
      camera.position.copy(player.position).add(new THREE.Vector3(0, 7, 12));
      controls.target.copy(player.position).add(new THREE.Vector3(0, 1.2, 0));
    } else {
      camera.position.copy(initialPosition);
      controls.target.copy(initialTarget);
    }
    fitNarrowScreen();
    controls.update();
  }
  return { camera, controls, update, fitNarrowScreen, setWalking };
}

const view = setupCamera();

// 第 6.1 节的 M1 部分：天空保持明亮的蓝色渐变，后续里程碑添加云、太阳盘和彩虹。
function setupSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      topColor: { value: new THREE.Color('#4FA3E8') },
      horizonColor: { value: new THREE.Color('#BFE6FF') },
    },
    vertexShader: `varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDirection;
      void main() {
        float height = smoothstep(-0.08, 0.8, normalize(vDirection).y);
        gl_FragColor = vec4(mix(horizonColor, topColor, height), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  sky.frustumCulled = false;
  scene.add(sky);
}

// 第 6.2 节的 M1 部分：日光足够强，阴影相机紧贴岛台范围。
function setupLights() {
  const sun = new THREE.DirectionalLight(STATE.sunColor, 3.0);
  sun.position.copy(STATE.sunDir).multiplyScalar(80);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -47, right: 47, top: 47, bottom: -47, near: 1, far: 190 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#BFE6FF', '#F2D9A0', 0.6));
}

function flatMaterial(color) {
  return makeToonMaterial(color);
}

function addShadowMesh(geometry, material, x, y, z, outline = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (outline) addOutline(mesh);
  else mesh.userData.noMerge = true;
  return mesh;
}

// 第 5 节的 M1 部分：海水圆盘、分层岛台剖面与前侧陆地轮廓。
function setupIsland() {
  const soilDark = flatMaterial('#6B4530');
  const soil = flatMaterial('#B07848');
  const water = flatMaterial('#4CC4C9');
  const grass = flatMaterial('#8CC65A');
  const sand = flatMaterial('#F2D9A0');
  addShadowMesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 0.5, 2.1, 112), soilDark, 0, -2.5, 0);
  addShadowMesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R, 0.85, 112), soil, 0, -1.05, 0);
  const sea = addShadowMesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R, 0.3, 112), water, 0, WATER_Y - 0.155, 0, false);
  sea.castShadow = false;

  // ShapeGeometry 的纵轴经旋转后映射到世界 Z；海岸线用固定控制点形成弯曲。
  const land = new THREE.Shape();
  land.moveTo(COAST[0][0], -COAST[0][1]);
  for (let i = 1; i < COAST.length; i++) land.lineTo(COAST[i][0], -COAST[i][1]);
  for (let i = 0; i <= 48; i++) {
    const angle = Math.PI * i / 48;
    land.lineTo(Math.cos(angle) * (ISLAND_R - 1), -Math.sin(angle) * (ISLAND_R - 1));
  }
  land.closePath();
  const grassMesh = addShadowMesh(new THREE.ShapeGeometry(land, 24), grass, 0, -0.29, 0, false);
  grassMesh.rotation.x = -Math.PI / 2;
  grassMesh.castShadow = false;

  const beach = new THREE.Shape();
  beach.moveTo(COAST[0][0], -COAST[0][1]);
  for (let i = 1; i < COAST.length; i++) beach.lineTo(COAST[i][0], -COAST[i][1]);
  for (let i = COAST.length - 1; i >= 0; i--) beach.lineTo(COAST[i][0], -(COAST[i][1] + 1.5));
  beach.closePath();
  const beachMesh = addShadowMesh(new THREE.ShapeGeometry(beach), sand, 0, -0.275, 0, false);
  beachMesh.rotation.x = -Math.PI / 2;
  beachMesh.castShadow = false;
}

setupSky();
setupLights();
setupIsland();
const weather = createWeatherUniforms(STATE);
const water = createWater(scene, weather);
addHarbor(scene);
addHouses(scene);
addRoutes(scene);
const boats = addBoats(scene);
const props = addProps(scene);
createPuddles(scene, weather);
createRain(scene, view.controls.target, weather);
createSplashes(scene, weather);
mergeToonMeshes(scene, { skipDynamic: true });
const game = createPlayerController(scene, view.camera);
const minimap = createMinimap(game.player);

const modeToggle = document.querySelector('#mode-toggle');
const caption = document.querySelector('#caption');
function setMode(walking) {
  game.setActive(walking);
  view.setWalking(walking, game.player);
  document.body.classList.toggle('walking', walking);
  modeToggle.textContent = walking ? '切换观景' : '开始步行';
  caption.innerHTML = walking
    ? '<strong>太阳雨 · 小渔港</strong>WASD / 方向键移动 · Shift 快跑 · 空格跳跃 · 拖动转镜头 · V 观景 · M 地图'
    : '<strong>太阳雨 · 小渔港</strong>拖动旋转 / 滚轮缩放 / 右键平移 / 双击复位 · V 步行 · M 地图';
}
modeToggle.addEventListener('click', () => setMode(!game.active));
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyV' && !event.repeat) setMode(!game.active);
});
setMode(true);

// 第 8 节：窗口适配与后台暂停；delta 截断以避免恢复页面时的跳变。
window.addEventListener('resize', () => {
  view.camera.aspect = window.innerWidth / window.innerHeight;
  view.fitNarrowScreen();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let running = true;
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running) {
    clock.getDelta();
    renderer.setAnimationLoop(animate);
  } else {
    renderer.setAnimationLoop(null);
  }
});

function animate() {
  if (!running) return;
  const delta = Math.min(clock.getDelta(), 0.05);
  STATE.time += delta;
  weather.uTime.value = STATE.time;
  game.update(delta);
  minimap.update(delta);
  view.update(delta);
  updateBoats(boats, STATE.time);
  updateProps(props, STATE.time);
  renderer.render(scene, view.camera);
  perf.textContent = `Draw Calls: ${renderer.info.render.calls}`;
}

renderer.setAnimationLoop(animate);
requestAnimationFrame(() => loading.classList.add('hidden'));
