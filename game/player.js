// 文件职责：可操控渔港人物、地形行走判定、碰撞与触屏摇杆；游戏地图扩展。
import * as THREE from 'three';
import { makeToonMaterial, addOutline } from '../toon/materials.js';
import { ISLAND_R } from '../world/constants.js';
import { shoreZ } from '../world/water.js';
import { HOUSE_LAYOUT } from '../world/houses.js';
import { TREE_LAYOUT } from '../world/props.js';

const GROUND_Y = -0.29;
const UP = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
const obstacles = [
  ...HOUSE_LAYOUT.map(([x, z, w, d]) => [x, z, Math.hypot(w, d) / 2 + 0.15]),
  ...TREE_LAYOUT.map(([x, z, scale]) => [x, z, scale * 0.65 + 0.25]),
  [2, 7.7, 2.65], [19, 27.3, 1.55],
  [-5.5, 5.2, 1.2], [7, 5.4, 1.2], [-12, 4.7, 1.2], [23, 4, 0.75],
  [-20, 4, 0.6], [-18.8, 4.5, 0.6], [-7, 3.8, 0.6], [5, 4.2, 0.6], [20, 4.5, 0.6],
  [18.05, 23.3, 0.3], [19.95, 22.7, 0.3],
];

function surfaceAt(x, z) {
  if (Math.hypot(x, z) > ISLAND_R - 1.3) return null;
  for (const pierX of [-13, 0, 13]) {
    if (Math.abs(x - pierX) <= 0.78 && z >= -9.35 && z <= -2.05) {
      return { height: 0.36, name: '木栈桥' };
    }
  }
  if (x >= -19.8 && x <= 19.8 && z >= -2.18 && z <= -1.05) {
    return { height: 0.40, name: '石码头' };
  }
  if (z >= shoreZ(x) + 0.28) return { height: GROUND_Y, name: '渔村草地' };
  return null;
}

function canStand(x, z) {
  const surface = surfaceAt(x, z);
  if (!surface) return null;
  for (const [ox, oz, radius] of obstacles) {
    if (Math.hypot(x - ox, z - oz) < radius + 0.34) return null;
  }
  return surface;
}

function part(parent, geometry, material, x, y, z, outline = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (outline) addOutline(mesh);
  return mesh;
}

function createCharacter(scene) {
  const coat = makeToonMaterial('#FFE8B0');
  const pants = makeToonMaterial('#4A7FB5');
  const skin = makeToonMaterial('#F2D9A0');
  const hat = makeToonMaterial('#D9574A');
  const dark = makeToonMaterial('#2B2A3A');
  const boots = makeToonMaterial('#6B4530');
  const player = new THREE.Group();
  player.position.set(-3.2, GROUND_Y, 8.8);
  player.userData.dynamic = true;
  scene.add(player);

  const figure = new THREE.Group();
  player.add(figure);
  part(figure, new THREE.CylinderGeometry(0.31, 0.38, 0.88, 10), coat, 0, 1.19, 0, true);
  part(figure, new THREE.SphereGeometry(0.28, 10, 8), skin, 0, 1.93, 0, true);
  part(figure, new THREE.CylinderGeometry(0.32, 0.27, 0.2, 10), hat, 0, 2.25, 0, true);
  part(figure, new THREE.CylinderGeometry(0.39, 0.39, 0.055, 10), hat, 0, 2.14, 0);
  for (const x of [-0.1, 0.1]) part(figure, new THREE.SphereGeometry(0.025, 5, 4), dark, x, 1.98, -0.255);
  part(figure, new THREE.BoxGeometry(0.5, 0.48, 0.17), boots, 0, 1.18, 0.37);

  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.17, 0.84, 0);
    figure.add(leg);
    part(leg, new THREE.CylinderGeometry(0.13, 0.14, 0.58, 7), pants, 0, -0.30, 0);
    part(leg, new THREE.BoxGeometry(0.28, 0.2, 0.43), boots, 0, -0.64, -0.08);
    legs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 0.42, 1.48, 0);
    figure.add(arm);
    part(arm, new THREE.CylinderGeometry(0.12, 0.11, 0.62, 7), coat, 0, -0.31, 0);
    part(arm, new THREE.SphereGeometry(0.11, 6, 5), skin, 0, -0.66, 0);
    arms.push(arm);
  }
  return { root: player, figure, legs, arms };
}

function setupJoystick() {
  const zone = document.querySelector('#joystick');
  const stick = document.querySelector('#stick');
  const value = { x: 0, y: 0 };
  let pointerId = null;
  function position(event) {
    const bounds = zone.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(length, 42) / length;
    value.x = dx * scale / 42;
    value.y = dy * scale / 42;
    stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }
  zone.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    zone.setPointerCapture(pointerId);
    position(event);
    event.preventDefault();
  });
  zone.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    position(event);
    event.preventDefault();
  });
  function release(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    value.x = 0; value.y = 0;
    stick.style.transform = 'translate(0, 0)';
  }
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', release);
  return value;
}

export function createPlayerController(scene, camera) {
  const character = createCharacter(scene);
  const joystick = setupJoystick();
  const keys = new Set();
  let active = true;
  let stride = 0;
  let jumpVelocity = 0;
  let jumpHeight = 0;
  let walkSurface = surfaceAt(character.root.position.x, character.root.position.z);
  window.addEventListener('keydown', (event) => {
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
    keys.add(code);
    if (active && code === 'Space' && !event.repeat && jumpHeight <= 0.001) jumpVelocity = 5.0;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  document.querySelector('#jump-btn').addEventListener('pointerdown', (event) => {
    if (active && jumpHeight <= 0.001) jumpVelocity = 5.0;
    event.preventDefault();
  });

  function update(delta) {
    const horizontal = active ? Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + joystick.x : 0;
    const vertical = active ? Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) - joystick.y : 0;
    camera.getWorldDirection(forward).setY(0).normalize();
    right.crossVectors(forward, UP).normalize();
    movement.copy(forward).multiplyScalar(vertical).addScaledVector(right, horizontal);
    const moving = movement.lengthSq() > 0.0001;
    if (moving) {
      movement.normalize();
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.2 : 4.7;
      const step = speed * delta;
      const root = character.root;
      const nextX = root.position.x + movement.x * step;
      const nextZ = root.position.z + movement.z * step;
      const full = canStand(nextX, nextZ);
      if (full) {
        root.position.x = nextX; root.position.z = nextZ; walkSurface = full;
      } else {
        const xOnly = canStand(nextX, root.position.z);
        const zOnly = canStand(root.position.x, nextZ);
        if (xOnly) { root.position.x = nextX; walkSurface = xOnly; }
        if (zOnly) { root.position.z = nextZ; walkSurface = zOnly; }
      }
      const facing = Math.atan2(-movement.x, -movement.z);
      const turn = THREE.MathUtils.euclideanModulo(facing - root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      root.rotation.y += turn * Math.min(1, delta * 11);
      stride += delta * speed * 2.4;
    }
    jumpVelocity -= 13.0 * delta;
    jumpHeight = Math.max(0, jumpHeight + jumpVelocity * delta);
    if (jumpHeight === 0) jumpVelocity = 0;
    const root = character.root;
    const targetY = (walkSurface?.height ?? GROUND_Y) + jumpHeight;
    root.position.y = THREE.MathUtils.lerp(root.position.y, targetY, Math.min(1, delta * 12));
    const gait = moving ? Math.sin(stride) * 0.55 : 0;
    character.legs[0].rotation.x = gait;
    character.legs[1].rotation.x = -gait;
    character.arms[0].rotation.x = -gait * 0.7;
    character.arms[1].rotation.x = gait * 0.7;
    character.figure.position.y = moving ? Math.abs(Math.sin(stride)) * 0.04 : Math.sin(performance.now() * 0.002) * 0.015;
  }

  return {
    player: character.root,
    update,
    setActive(value) { active = value; keys.clear(); joystick.x = 0; joystick.y = 0; },
    get active() { return active; },
    get surfaceName() { return walkSurface?.name ?? '渔村草地'; },
  };
}
