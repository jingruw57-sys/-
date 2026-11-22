// 文件职责：可操控渔港人物、地形行走判定、碰撞与触屏摇杆；游戏地图扩展。
import * as THREE from 'three';
import { createWhaleCharacter } from './whale-character.js';
import { ISLAND_R, WATER_Y } from '../world/constants.js';
import { shoreZ } from '../world/water.js?v=map-9';
import { BEACH_OBSTACLES, beachHeightAt } from '../world/beach.js';
import { HOUSE_FLOOR_Y, houseLocalPosition } from '../world/houses.js?v=map-8';
import { TREE_LAYOUT } from '../world/props.js';

const GROUND_Y = -0.29;
const HOUSE_CLEARANCE = 0.20;
const CHARACTER_SCALE = 0.60;
const UP = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const movement = new THREE.Vector3();
const obstacles = [
  ...TREE_LAYOUT.map(([x, z, scale]) => [x, z, scale * 0.65 + 0.25]),
  ...BEACH_OBSTACLES,
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
  const land = z >= shoreZ(x) + 0.28;
  const sand = beachHeightAt(x, z);
  if (sand !== null && sand >= (land ? GROUND_Y : WATER_Y + 0.016)) {
    return { height: sand, name: '东岸沙滩' };
  }
  if (land) return { height: GROUND_Y, name: '渔村草地' };
  return null;
}

function hitsBox(x, z, boxX, boxZ, halfW, halfD) {
  const dx = Math.max(0, Math.abs(x - boxX) - halfW);
  const dz = Math.max(0, Math.abs(z - boxZ) - halfD);
  return dx * dx + dz * dz < HOUSE_CLEARANCE * HOUSE_CLEARANCE;
}

function canStand(x, z, houses) {
  const surface = surfaceAt(x, z);
  if (!surface) return null;
  for (const [ox, oz, radius] of obstacles) {
    if (Math.hypot(x - ox, z - oz) < radius + 0.34) return null;
  }
  for (const house of houses) {
    const { x: localX, z: localZ } = houseLocalPosition(house, x, z);
    if (Math.abs(localX) >= house.halfW + HOUSE_CLEARANCE || Math.abs(localZ) >= house.halfD + HOUSE_CLEARANCE) continue;
    if (house.solids.some((box) => hitsBox(localX, localZ, ...box))) return null;
    if (house.door) {
      const { leaf, width } = house.door;
      const dx = localX - leaf.position.x;
      const dz = localZ - leaf.position.z;
      const cos = Math.cos(leaf.rotation.y);
      const sin = Math.sin(leaf.rotation.y);
      if (hitsBox(cos * dx - sin * dz, sin * dx + cos * dz, width / 2, 0, width / 2, 0.035)) return null;
      if (Math.abs(localX) < house.halfW && localZ < house.halfD && localZ > -house.halfD) {
        return { height: HOUSE_FLOOR_Y, name: house.name, house };
      }
    }
  }
  return surface;
}

function findDoor(houses, position) {
  for (const house of houses) {
    if (!house.door) continue;
    const { x, z } = houseLocalPosition(house, position.x, position.z);
    const front = z - house.halfD;
    if (Math.abs(x) < 1.05 && Math.abs(front) < 1.65) {
      return { door: house.door, occupied: Math.abs(x) < 0.75 && front > -1.18 && front < 0.18 };
    }
  }
  return null;
}

function createCharacter(scene) {
  const player = new THREE.Group();
  player.position.set(-3.2, GROUND_Y, 8.8);
  player.userData.dynamic = true;
  scene.add(player);

  const figure = new THREE.Group();
  figure.scale.setScalar(CHARACTER_SCALE);
  player.add(figure);
  return { root: player, figure, ...createWhaleCharacter(figure) };
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

export function createPlayerController(scene, camera, houses = []) {
  const character = createCharacter(scene);
  const joystick = setupJoystick();
  const keys = new Set();
  let active = true;
  let stride = 0;
  let jumpVelocity = 0;
  let jumpHeight = 0;
  let walkSurface = canStand(character.root.position.x, character.root.position.z, houses);

  function canJump() {
    return active && !walkSurface?.house && !findDoor(houses, character.root.position) && jumpHeight <= 0.001;
  }
  window.addEventListener('keydown', (event) => {
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
    keys.add(code);
    if (code === 'Space' && !event.repeat && canJump()) jumpVelocity = 5.0;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  document.querySelector('#jump-btn').addEventListener('pointerdown', (event) => {
    if (canJump()) jumpVelocity = 5.0;
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
      const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = walkSurface?.house ? 2.45 : running ? 7.2 : 4.7;
      const step = speed * delta;
      const root = character.root;
      const nextX = root.position.x + movement.x * step;
      const nextZ = root.position.z + movement.z * step;
      const full = canStand(nextX, nextZ, houses);
      if (full) {
        root.position.x = nextX; root.position.z = nextZ; walkSurface = full;
      } else {
        const xOnly = canStand(nextX, root.position.z, houses);
        if (xOnly) { root.position.x = nextX; walkSurface = xOnly; }
        const zOnly = canStand(root.position.x, nextZ, houses);
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
    const time = performance.now() * 0.002;
    character.figure.position.y = moving ? Math.abs(Math.sin(stride)) * 0.04 : Math.sin(time) * 0.015;
    character.hair.rotation.z = (moving ? Math.sin(stride) : Math.sin(time)) * 0.045;
    character.tail.rotation.y = moving ? Math.sin(stride - 0.7) * 0.15 : Math.sin(time * 0.8) * 0.065;
  }

  return {
    player: character.root,
    update,
    setActive(value) { active = value; keys.clear(); joystick.x = 0; joystick.y = 0; },
    get active() { return active; },
    groundAt(x, z) { return canStand(x, z, houses)?.height; },
    get surfaceName() { return walkSurface?.name ?? '渔村草地'; },
    get indoorHouse() { return walkSurface?.house ?? null; },
    get nearbyDoor() { return active ? findDoor(houses, character.root.position) : null; },
    toggleDoor() {
      const target = this.nearbyDoor;
      if (target && !target.occupied) target.door.open = !target.door.open;
    },
  };
}
