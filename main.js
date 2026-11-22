// 文件职责：微缩渔港、太阳雨与可步行探索的游戏镜头；对应指导书第 1～6、8、9 章及游戏扩展。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeToonMaterial, addOutline } from './toon/materials.js';
import { addBoats, updateBoats } from './world/boats.js';
import { addHarbor } from './world/harbor.js?v=map-11';
import { addHouses, updateHouses } from './world/houses.js?v=map-8';
import { addProps, updateProps } from './world/props.js';
import { createWater, COAST, WATER_COLORS } from './world/water.js?v=map-9';
import { createWeatherUniforms } from './weather/shared.js?v=map-3';
import { createRain } from './weather/rain.js';
import { createSplashes } from './weather/splashes.js';
import { createPuddles } from './world/puddles.js';
import { ISLAND_R, SAFE_R, WATER_Y } from './world/constants.js';
import { mergeToonMeshes } from './world/merge.js?v=map-7';
import { createPlayerController } from './game/player.js?v=map-11';
import { addRoutes } from './world/routes.js?v=map-4';
import { createMinimap } from './game/minimap.js?v=map-9';
import { addBeach, BEACH, BEACH_WATERLINE_RADIUS } from './world/beach.js';
import { createInteractions } from './game/interactions.js?v=map-11';
import { createAmbience } from './weather/audio.js?v=map-11';
import { createDynamicWeather } from './weather/dynamic.js?v=map-11';

const app = document.querySelector('#app');
const loading = document.querySelector('#loading');
const perf = document.querySelector('#perf');
const gameStatus = document.querySelector('#game-status');
const gameCoords = document.querySelector('#game-coords');

// 系统开启「减弱动效」时压低雨量、湿润度与风力，避免长时间高频运动引起不适。
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();
const clock = new THREE.Clock();
const STATE = {
  sunDir: new THREE.Vector3(0.52, 0.72, -0.46).normalize(),
  sunColor: new THREE.Color('#FFF1C9'),
  time: 0,
  rain: reduceMotion ? 0.28 : 0.7,
  wetness: reduceMotion ? 0.45 : 0.7,
  windAngle: 0.6,
  windStrength: reduceMotion ? 0.07 : 0.14,
};

// 第 3.1 节：较硬的阴影与亮度设置；像素比限制有利于集显。
function setupRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // 柔和阴影更贴近插画感；描边仍在，不会糊掉轮廓。
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);
  return renderer;
}

const renderer = setupRenderer();

// 第 3.2 节：25° FOV、阻尼、极角限制与双击平滑复位。
function setupCamera() {
  const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 800);
  const CAM_OFFSET = new THREE.Vector3(0, 7, 12);
  const CAM_TARGET_OFFSET = new THREE.Vector3(0, 1.2, 0);
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

  function resetView() {
    resetFromPosition.copy(camera.position);
    resetFromTarget.copy(controls.target);
    if (walking && followPlayer) {
      resetToTarget.copy(followPlayer.position).add(CAM_TARGET_OFFSET);
      resetToPosition.copy(followPlayer.position).add(CAM_OFFSET);
    } else {
      resetToPosition.copy(initialPosition);
      resetToTarget.copy(initialTarget);
    }
    resetElapsed = 0;
  }
  renderer.domElement.addEventListener('dblclick', (event) => {
    if (!event.sourceCapabilities?.firesTouchEvents) resetView();
  });

  // 触屏不会触发 dblclick：用两次轻点补上复位入口，多指手势不计入。
  let touchStart = null;
  let lastTap = null;
  renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
      touchStart = lastTap = null;
      return;
    }
    const { clientX, clientY } = event.touches[0];
    touchStart = { x: clientX, y: clientY, time: performance.now() };
  }, { passive: true });
  renderer.domElement.addEventListener('touchmove', (event) => {
    if (!touchStart) return;
    const { clientX, clientY } = event.touches[0];
    if (Math.hypot(clientX - touchStart.x, clientY - touchStart.y) > 12) {
      touchStart = lastTap = null;
    }
  }, { passive: true });
  renderer.domElement.addEventListener('touchend', (event) => {
    if (event.touches.length > 0) return;
    const start = touchStart;
    touchStart = null;
    const now = performance.now();
    if (!start || now - start.time > 250) { lastTap = null; return; }
    if (lastTap && now - lastTap.time < 320 && Math.hypot(start.x - lastTap.x, start.y - lastTap.y) < 24) {
      lastTap = null;
      resetView();
    } else {
      lastTap = { x: start.x, y: start.y, time: now };
    }
  }, { passive: true });
  renderer.domElement.addEventListener('touchcancel', () => { touchStart = lastTap = null; }, { passive: true });

  const followWanted = new THREE.Vector3();
  const followOffset = new THREE.Vector3();

  function update(delta) {
    if (walking && followPlayer && resetElapsed < 0) {
      followWanted.copy(followPlayer.position).add(CAM_TARGET_OFFSET);
      followOffset.copy(controls.target);
      // 指数衰减：低帧率下不会抖动或滞后。
      controls.target.lerp(followWanted, 1 - Math.exp(-7 * delta));
      followOffset.subVectors(controls.target, followOffset);
      camera.position.add(followOffset);
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
      camera.position.copy(player.position).add(CAM_OFFSET);
      controls.target.copy(player.position).add(CAM_TARGET_OFFSET);
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

// 第 6.1 节：天空渐变 + 太阳方向暖晕，为 M6 的太阳盘与光柱预留同一套方向参数。
function setupSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      topColor: { value: new THREE.Color('#4FA3E8') },
      horizonColor: { value: new THREE.Color('#BFE6FF') },
      sunDir: { value: STATE.sunDir.clone() },
      sunColor: { value: new THREE.Color('#FFE7B8') },
    },
    vertexShader: `varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDirection;
      void main() {
        vec3 dir = normalize(vDirection);
        float height = smoothstep(-0.08, 0.8, dir.y);
        vec3 col = mix(horizonColor, topColor, height);

        // 太阳方向的柔和暖晕，以及贴近地平线时的暖边。
        float sunAmount = max(dot(dir, normalize(sunDir)), 0.0);
        col = mix(col, sunColor, pow(sunAmount, 6.0) * 0.55);
        col = mix(col, sunColor, pow(max(1.0 - abs(dir.y), 0.0), 8.0) * pow(sunAmount, 2.0) * 0.25);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  sky.frustumCulled = false;
  scene.add(sky);
}

// 第 6.2 节：主光压到 2.6，用冷色补光把阴影从灰救回冷调；阴影相机覆盖灯塔与防波堤。
function setupLights() {
  const sun = new THREE.DirectionalLight(STATE.sunColor, 2.6);
  sun.position.copy(STATE.sunDir).multiplyScalar(80);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -54, right: 54, top: 54, bottom: -54, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // 天顶偏冷蓝、地面反弹偏暖沙：阴影里就会带冷调而不是发灰。
  scene.add(new THREE.HemisphereLight('#A8D8FF', '#F2C89A', 0.85));

  // 反向冷色补光，让背光面保留形体转折。
  const rim = new THREE.DirectionalLight('#BFD8FF', 0.45);
  rim.position.set(-STATE.sunDir.x * 40, 20, -STATE.sunDir.z * 40);
  scene.add(rim);
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

// 第 5 节：海水圆盘、分层岛台剖面与前侧陆地轮廓。
function setupIsland() {
  const soilDark = flatMaterial('#6B4530');
  const soil = flatMaterial('#B07848');
  const water = flatMaterial(WATER_COLORS.abyss);
  const grass = flatMaterial('#8CC65A');
  const sand = flatMaterial('#F2D9A0');
  addShadowMesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 0.5, 2.1, 112), soilDark, 0, -2.5, 0);
  addShadowMesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R, 0.85, 112), soil, 0, -1.05, 0);
  // 仅保留侧壁。封顶圆盘在波谷时会盖住真正的水面。
  const seaWall = new THREE.CylinderGeometry(ISLAND_R, ISLAND_R, 0.3, 112, 1, true);
  addShadowMesh(seaWall, water, 0, WATER_Y - 0.155, 0, false).castShadow = false;

  // ShapeGeometry 的纵轴经旋转后映射到世界 Z；海岸线用固定控制点形成弯曲。
  const land = makeLandOutline();
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

function makeLandOutline() {
  const land = new THREE.Shape();
  land.moveTo(COAST[0][0], -COAST[0][1]);
  for (let i = 1; i < COAST.length; i++) land.lineTo(COAST[i][0], -COAST[i][1]);
  for (let i = 0; i <= 48; i++) {
    const angle = Math.PI * i / 48;
    land.lineTo(Math.cos(angle) * (ISLAND_R - 1), -Math.sin(angle) * (ISLAND_R - 1));
  }
  land.closePath();
  return land;
}

// 用陆地的轮廓生成柔和的接触阴影，交给水面着色器随波绘制。
function createWaterShadow() {
  const size = 512;
  const radius = ISLAND_R * 1.2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  makeLandOutline().getPoints().forEach(({ x, y }, index) => {
    const px = size * (x + radius) / (2 * radius);
    const py = size * (radius - y) / (2 * radius);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.moveTo(size * (BEACH.x + BEACH_WATERLINE_RADIUS + radius) / (2 * radius), size * (radius + BEACH.z) / (2 * radius));
  ctx.arc(
    size * (BEACH.x + radius) / (2 * radius),
    size * (radius + BEACH.z) / (2 * radius),
    size * BEACH_WATERLINE_RADIUS / (2 * radius), 0, Math.PI * 2,
  );
  ctx.fill();
  return { texture: new THREE.CanvasTexture(canvas), diameter: 2 * radius };
}

setupSky();
setupLights();
setupIsland();
addBeach(scene);
const weather = createWeatherUniforms(STATE);
createWater(scene, weather, createWaterShadow());
const lighthouseLens = addHarbor(scene);
const houses = addHouses(scene);
addRoutes(scene);
const boats = addBoats(scene);
const props = addProps(scene);
createPuddles(scene, weather);
createRain(scene, view.controls.target, weather);
createSplashes(scene, weather);
mergeToonMeshes(scene, { skipDynamic: true });
const game = createPlayerController(scene, view.camera, houses);
const minimap = createMinimap(game.player);
const ambience = createAmbience();
const dynamicWeather = createDynamicWeather(STATE, weather, {
  steps: reduceMotion ? [0.10, 0.18, 0.26, 0.34] : undefined,
  onChange: ambience.setRain,
});
const interactions = createInteractions(scene, game.player, {
  play: ambience.play,
  groundAt: game.groundAt,
  lighthouseLens,
});

const soundToggle = document.querySelector('#sound-toggle');
soundToggle.addEventListener('click', async () => {
  soundToggle.disabled = true;
  const enabled = !ambience.enabled;
  const ok = await ambience.setEnabled(enabled);
  soundToggle.disabled = false;
  soundToggle.setAttribute('aria-pressed', String(ambience.enabled));
  soundToggle.textContent = ok ? (enabled ? '声音开' : '声音关') : '声音不可用';
});

function placeName(position) {
  if (game.surfaceName !== '渔村草地') return game.surfaceName;
  const { x, z } = position;
  if (Math.hypot(x - 19, z - 23) <= 3.5) return '鸟居';
  return z > 5 ? '渔村' : '港区';
}

// HUD 每 0.25 秒刷新一次，避免每帧写 DOM 触发样式重算。
let hudElapsed = 1;
function updateHud(force = false) {
  if (!force && hudElapsed < 0.25) return;
  hudElapsed = 0;
  perf.textContent = `Draw ${renderer.info.render.calls}`;
  const p = game.player.position;
  gameStatus.textContent = placeName(p);
  gameCoords.textContent = `X ${p.x.toFixed(1)} · Z ${p.z.toFixed(1)}`;
}

const modeToggle = document.querySelector('#mode-toggle');
const caption = document.querySelector('#caption');
const doorButton = document.querySelector('#door-action');
const useButton = document.querySelector('#use-btn');
function updateDoorAction(nearby) {
  const hide = !nearby;
  if (doorButton.hidden !== hide) doorButton.hidden = hide;
  if (!nearby) return;
  if (doorButton.disabled !== nearby.occupied) doorButton.disabled = nearby.occupied;
  const label = nearby.occupied ? '退开门口' : nearby.door.open ? 'E · 关门' : 'E · 开门';
  if (doorButton.textContent !== label) doorButton.textContent = label;
}

function updateGameActions(delta) {
  const nearby = game.nearbyDoor;
  updateDoorAction(nearby);
  interactions.update(delta, game.active, !nearby);
}

function useAction() {
  if (!game.active) return;
  if (game.nearbyDoor) {
    game.toggleDoor();
    updateGameActions(0);
  } else {
    interactions.use();
  }
}

function setMode(walking) {
  game.setActive(walking);
  view.setWalking(walking, game.player);
  document.body.classList.toggle('walking', walking);
  modeToggle.textContent = walking ? '切换观景' : '开始步行';
  caption.innerHTML = walking
    ? '<strong>太阳雨 · 小渔港</strong>WASD / 方向键移动 · Shift 快跑 · 空格跳跃 · E 互动 · 拖动转镜头 · V 观景 · M 地图'
    : '<strong>太阳雨 · 小渔港</strong>拖动旋转 / 滚轮缩放 / 右键平移 / 双击复位 · V 步行 · M 地图';
  updateHud(true);
  updateGameActions(0);
}
modeToggle.addEventListener('click', () => setMode(!game.active));
doorButton.addEventListener('click', useAction);
useButton.addEventListener('click', useAction);
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyV' && !event.repeat) setMode(!game.active);
  if (event.code === 'KeyE' && !event.repeat) useAction();
});
setMode(true);

// 第 8 节：窗口适配与后台暂停；delta 截断以避免恢复页面时的跳变。
window.addEventListener('resize', () => {
  // 换显示器或改系统缩放后像素比会变，必须重算。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

let firstFrame = true;
function animate() {
  if (!running) return;
  const elapsed = clock.getDelta();
  const delta = Math.min(elapsed, 0.05);
  STATE.time += delta;
  weather.uTime.value = STATE.time;
  dynamicWeather.update(elapsed);
  game.update(delta);
  const indoorHouse = game.active ? game.indoorHouse : null;
  updateHouses(houses, game.player.position, indoorHouse, delta);
  updateGameActions(delta);
  minimap.update(delta);
  view.update(delta);
  updateBoats(boats, STATE.time);
  updateProps(props, STATE.time);
  renderer.render(scene, view.camera);
  hudElapsed += delta;
  updateHud();
  // 首帧渲染完成后才收起加载屏，避免出现纯色空屏。
  if (firstFrame) {
    firstFrame = false;
    updateHud(true);
    loading.classList.add('hidden');
  }
}

renderer.setAnimationLoop(animate);
