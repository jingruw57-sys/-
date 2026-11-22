// 文件职责：坡屋顶渔村小屋（可开启的门、室内陈设）、鱼市棚和鸟居；对应指导书第 5.1、5.2、9 章（M3）。
import * as THREE from 'three';
import { makeToonMaterial, addOutline } from '../toon/materials.js';
import { assertInside } from './constants.js';
import { mergeToonMeshes } from './merge.js?v=map-7';

const WALL_COLORS = ['#F6F1E7', '#F2E3C8', '#DDE9F2', '#E4EDE6', '#F0D8C4'];
const ROOF_COLORS = ['#D9574A', '#4A7FB5', '#709A8D'];
const C = {
  wood: '#B07848',
  woodDark: '#8A5A34',
  woodLight: '#D2A473',
  dark: '#2B2A3A',
  red: '#D9574A',
  linen: '#FFF8EC',
  quiltWarm: '#E4746A',
  quiltCool: '#6FA8C9',
  rugWarm: '#D9A441',
  rugCool: '#7E9E82',
  metal: '#8B8E98',
  pot: '#C4763F',
  leaf: '#5F9E5A',
  lamp: '#FFE7A8',
  fish: '#C9D4DC',
};

// 墙厚与墙底高度（相对房屋 group 原点，group 落在 -0.15）。
const T = 0.16;
const WALL_BOTTOM = -0.14;

const mat = makeToonMaterial;
const ROOM_NAMES = { bed: '卧室', dining: '餐厅', living: '起居室', storage: '储物间' };
const OPEN_ANGLE = 1.75;
export const HOUSE_FLOOR_Y = -0.15;

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

function part(parent, geometry, material, x, y, z, outline = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (outline) addOutline(mesh);
  return mesh;
}

function roofGeometry(w, d, overhang = 0.22, rise = 0.9) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - overhang, 0);
  shape.lineTo(0, rise);
  shape.lineTo(w / 2 + overhang, 0);
  shape.closePath();
  const depth = d + overhang * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// 窗：外框 + 深色玻璃；几何先绕 Y 转到朝向，再平移到墙外表面。
function addWindow(group, x, y, z, faceYaw, frameColor, w = 0.58, h = 0.54) {
  const nx = Math.sin(faceYaw);
  const nz = Math.cos(faceYaw);

  const frameG = box(w + 0.16, h + 0.16, 0.05);
  frameG.rotateY(faceYaw);
  frameG.translate(x + nx * 0.025, y, z + nz * 0.025);
  const frame = new THREE.Mesh(frameG, mat(frameColor));
  frame.receiveShadow = true;
  group.add(frame);

  const paneG = box(w, h, 0.05);
  paneG.rotateY(faceYaw);
  paneG.translate(x + nx * 0.05, y, z + nz * 0.05);
  const pane = new THREE.Mesh(paneG, mat(C.dark));
  pane.receiveShadow = true;
  group.add(pane);
}

function addShutters(group, x, y, z, faceYaw, color, w = 0.58, h = 0.54) {
  const nx = Math.sin(faceYaw);
  const nz = Math.cos(faceYaw);
  const tx = Math.cos(faceYaw);
  const tz = -Math.sin(faceYaw);
  const sw = w * 0.5;
  for (const s of [-1, 1]) {
    const offset = w / 2 + sw / 2 + 0.03;
    const g = box(sw, h + 0.1, 0.05);
    g.rotateY(faceYaw);
    g.translate(x + tx * s * offset + nx * 0.06, y, z + tz * s * offset + nz * 0.06);
    const m = new THREE.Mesh(g, mat(color));
    m.receiveShadow = true;
    group.add(m);
  }
}

// ---------------- 室内家具 ----------------

function addTable(group, x, z, size, color) {
  part(group, box(size, 0.08, size), mat(color), x, 0.7, z);
  const o = size / 2 - 0.06;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    part(group, box(0.07, 0.7, 0.07), mat(C.wood), x + dx * o, 0.35, z + dz * o);
  }
}

function addChair(group, x, z, axis, sign) {
  const s = 0.34;
  part(group, box(s, 0.07, s), mat(C.wood), x, 0.42, z);
  const o = s / 2 - 0.05;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    part(group, box(0.055, 0.42, 0.055), mat(C.wood), x + dx * o, 0.21, z + dz * o);
  }
  if (axis === 'x') {
    part(group, box(0.06, 0.44, s), mat(C.wood), x + sign * (s / 2 - 0.03), 0.63, z);
  } else {
    part(group, box(s, 0.44, 0.06), mat(C.wood), x, 0.63, z + sign * (s / 2 - 0.03));
  }
}

function addRug(group, x, z, w, d, color) {
  part(group, box(w, 0.025, d), mat(color), x, 0.013, z);
}

function addCupboard(group, x, z, faceSign) {
  part(group, box(0.8, 0.95, 0.4), mat(C.wood), x, 0.475, z, true);
  part(group, box(0.72, 0.03, 0.03), mat(C.woodDark), x, 0.62, z + faceSign * 0.2);
  part(group, box(0.03, 0.16, 0.03), mat(C.metal), x + 0.26, 0.6, z + faceSign * 0.21);
}

function addBarrel(group, x, z) {
  part(group, new THREE.CylinderGeometry(0.19, 0.21, 0.52, 10), mat(C.wood), x, 0.26, z, true);
  part(group, new THREE.CylinderGeometry(0.21, 0.21, 0.05, 10), mat(C.metal), x, 0.36, z);
}

function addCrate(group, x, z, s = 0.38) {
  part(group, box(s, s, s), mat(C.woodLight), x, s / 2, z);
}

function addPlant(group, x, z) {
  part(group, new THREE.CylinderGeometry(0.14, 0.11, 0.26, 8), mat(C.pot), x, 0.13, z);
  part(group, new THREE.SphereGeometry(0.2, 7, 6), mat(C.leaf), x, 0.38, z);
}

function addInterior(group, w, d, style) {
  const ix = w / 2 - T - 0.05;
  const iz = d / 2 - T - 0.05;
  const quilt = style.quilt ?? C.quiltWarm;
  const rugColor = style.rug ?? C.rugWarm;

  // 门口脚垫，让门内有个落点。
  part(group, box(0.92, 0.02, 0.4), mat(C.rugCool), 0, 0.012, iz - 0.26);

  if (style.interior === 'bed') {
    const bw = Math.min(0.95, ix * 1.15);
    const bl = Math.min(1.65, iz * 1.25);
    const bx = -ix + bw / 2;
    const bz = -iz + bl / 2;
    part(group, box(bw, 0.2, bl), mat(C.wood), bx, 0.1, bz);
    part(group, box(bw - 0.08, 0.16, bl - 0.06), mat(C.linen), bx, 0.28, bz);
    part(group, box(bw - 0.26, 0.13, 0.3), mat(C.linen), bx, 0.4, bz - bl / 2 + 0.24);
    part(group, box(bw - 0.06, 0.11, bl * 0.5), mat(quilt), bx, 0.37, bz + bl * 0.22);

    // 床头柜 + 台灯
    const nz = -iz + bl + 0.26;
    part(group, box(0.34, 0.4, 0.34), mat(C.wood), bx, 0.2, nz);
    part(group, new THREE.CylinderGeometry(0.045, 0.055, 0.16, 6), mat(C.metal), bx, 0.48, nz);
    part(group, new THREE.SphereGeometry(0.1, 7, 6), mat(C.lamp), bx, 0.62, nz);

    const tx = ix - 0.55;
    addTable(group, tx, 0.15, 0.78, C.woodLight);
    addChair(group, tx - 0.62, 0.15, 'x', 1);
    addRug(group, 0.15, -iz + 0.6, 1.0, 0.6, rugColor);
  } else if (style.interior === 'dining') {
    addRug(group, 0, 0, Math.min(1.6, ix * 1.6), Math.min(1.3, iz * 1.4), rugColor);
    addTable(group, 0, 0, 0.92, C.woodLight);
    addChair(group, 0, -0.8, 'z', -1);
    addChair(group, 0, 0.8, 'z', 1);
    addChair(group, -0.8, 0, 'x', -1);
    addCupboard(group, ix - 0.42, -iz + 0.22, 1);
    part(group, new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6), mat(C.metal), 0, 0.82, 0);
    part(group, new THREE.SphereGeometry(0.1, 7, 6), mat(C.lamp), 0, 0.96, 0);
  } else if (style.interior === 'living') {
    addRug(group, 0.1, 0.1, Math.min(1.5, ix * 1.5), Math.min(1.1, iz * 1.2), rugColor);
    addChair(group, -0.72, 0.42, 'z', 1);
    addChair(group, 0.72, 0.42, 'z', 1);
    addTable(group, 0, 0.02, 0.6, C.woodLight);
    addCupboard(group, -ix + 0.42, -iz + 0.22, 1);
    addPlant(group, ix - 0.36, -iz + 0.36);
    part(group, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), mat(C.dark), 0, 1.08, 0.02);
    part(group, new THREE.SphereGeometry(0.1, 7, 6), mat(C.lamp), 0, 0.9, 0.02);
  } else if (style.interior === 'storage') {
    addCrate(group, -ix + 0.32, -iz + 0.32, 0.42);
    addCrate(group, -ix + 0.3, -iz + 0.86, 0.34);
    addBarrel(group, ix - 0.36, -iz + 0.4);
    addBarrel(group, ix - 0.36, -iz + 1.02);
    part(group, box(0.9, 0.9, 0.35), mat(C.wood), 0, 0.45, -iz + 0.2);
    addPlant(group, ix - 0.38, iz - 0.4);
  }
}

// ---------------- 房屋 ----------------

function house(scene, x, z, w, d, roofIndex, yaw = 0, chimney = false, style = {}) {
  assertInside('渔村小屋', x, z, Math.hypot(w, d) / 2 + 0.2);

  const group = new THREE.Group();
  group.position.set(x, HOUSE_FLOOR_Y, z);
  group.rotation.y = yaw;
  scene.add(group);

  const h = style.height ?? 2.2;
  const wallColor = WALL_COLORS[style.wall ?? 0];
  const wallMat = mat(wallColor);
  const trimMat = mat('#FFFFFF');
  const roofMat = mat(ROOF_COLORS[roofIndex]);

  const halfW = w / 2;
  const halfD = d / 2;
  const wallCenterY = h / 2 + WALL_BOTTOM;
  const roofY = h - 0.13;

  const visitable = Boolean(style.interior);
  const dw = visitable ? 0.98 : 0.84;
  const dh = Math.min(1.62, h - 0.55);
  const segW = (w - dw) / 2;
  const frontZ = halfD - T / 2;
  const shell = visitable ? new THREE.Group() : group;
  if (visitable) {
    shell.userData.dynamic = true;
    group.add(shell);
  }

  // 地板：室内可见，颜色比墙面深。
  part(group, box(w - 0.02, 0.14, d - 0.02), mat(C.woodDark), 0, WALL_BOTTOM + 0.07, 0);

  // 后墙 + 两侧墙
  part(shell, box(w, h, T), wallMat, 0, wallCenterY, -halfD + T / 2, true);
  part(shell, box(T, h, d - T * 2), wallMat, -halfW + T / 2, wallCenterY, 0, true);
  part(shell, box(T, h, d - T * 2), wallMat, halfW - T / 2, wallCenterY, 0, true);

  // 前墙：门洞两侧 + 门楣
  part(shell, box(segW, h, T), wallMat, -(dw / 2 + segW / 2), wallCenterY, frontZ, true);
  part(shell, box(segW, h, T), wallMat, (dw / 2 + segW / 2), wallCenterY, frontZ, true);
  part(shell, box(dw, h - dh, T), wallMat, 0, WALL_BOTTOM + dh + (h - dh) / 2, frontZ, true);

  // 门框压条
  for (const s of [-1, 1]) {
    part(shell, box(0.07, dh, T + 0.05), trimMat, s * (dw / 2 + 0.035), WALL_BOTTOM + dh / 2, frontZ);
  }
  part(shell, box(dw + 0.14, 0.07, T + 0.05), trimMat, 0, WALL_BOTTOM + dh + 0.035, frontZ);

  let door = null;
  if (visitable) {
    // 门扇绕左侧铰链转动，保留为独立网格。
    const leafW = dw - 0.1;
    const leafH = dh - 0.06;
    const g = box(leafW, leafH, 0.07);
    g.translate(leafW / 2, 0, 0);
    const leaf = part(group, g, mat(C.wood), -dw / 2 + 0.05, WALL_BOTTOM + leafH / 2, frontZ + 0.02, true);
    leaf.userData.dynamic = true;
    const open = style.door === 'open';
    leaf.rotation.y = open ? OPEN_ANGLE : 0;
    part(leaf, new THREE.SphereGeometry(0.045, 6, 5), mat(C.metal), leafW - 0.13, 0.05, 0.07);
    door = { leaf, width: leafW, open };
  } else {
    part(group, box(dw - 0.1, dh - 0.06, 0.08), mat(C.wood),
      0, WALL_BOTTOM + (dh - 0.06) / 2, frontZ + 0.03, true);
    part(group, new THREE.SphereGeometry(0.045, 6, 5), mat(C.metal),
      dw / 2 - 0.18, WALL_BOTTOM + 0.84, frontZ + 0.09);
  }

  // 窗：正面两扇、两侧各一扇、背面一扇。
  const winY = WALL_BOTTOM + h * 0.62;
  addWindow(shell, -(dw / 2 + segW / 2), winY, halfD, 0, wallColor);
  addWindow(shell, (dw / 2 + segW / 2), winY, halfD, 0, wallColor);
  addWindow(shell, -halfW, winY, 0, -Math.PI / 2, wallColor);
  addWindow(shell, halfW, winY, 0, Math.PI / 2, wallColor);
  addWindow(shell, 0, winY, -halfD, Math.PI, wallColor);

  if (style.shutters) {
    addShutters(shell, (dw / 2 + segW / 2), winY, halfD, 0, style.shutters);
  }

  if (style.flowers) {
    const fx = dw / 2 + segW / 2;
    const fy = winY - 0.42;
    part(shell, box(0.74, 0.16, 0.22), mat(C.woodDark), fx, fy, halfD + 0.12);
    for (let i = 0; i < 3; i++) {
      part(shell, new THREE.SphereGeometry(0.09, 6, 5), mat(C.leaf), fx - 0.24 + i * 0.24, fy + 0.14, halfD + 0.12);
    }
  }

  if (style.awning) {
    const g = box(dw + 0.55, 0.06, 0.62);
    g.rotateX(-0.34);
    g.translate(0, WALL_BOTTOM + dh + 0.34, halfD + 0.27);
    const awning = new THREE.Mesh(g, mat(style.awning));
    awning.castShadow = true;
    awning.receiveShadow = true;
    shell.add(awning);
    addOutline(awning);
  }

  part(shell, roofGeometry(w, d), roofMat, 0, roofY, 0, true);
  if (chimney) {
    part(shell, box(0.42, 1.0, 0.42), mat(style.chimneyColor ?? C.wood), -w * 0.26, roofY + 0.76, -d * 0.2, true);
  }

  let interior = null;
  let cutaway = null;
  let solids = [[0, 0, halfW, halfD]];
  if (visitable) {
    const sideX = halfW - T / 2;
    const frontX = dw / 2 + segW / 2;
    solids = [
      [0, -frontZ, halfW, T / 2],
      [-sideX, 0, T / 2, halfD - T],
      [sideX, 0, T / 2, halfD - T],
      [-frontX, frontZ, segW / 2, T / 2],
      [frontX, frontZ, segW / 2, T / 2],
    ];
    // 保留低墙与门洞作为边界标记，让第三人称镜头看清室内。
    mergeToonMeshes(shell, { bakeColors: true });
    cutaway = new THREE.Group();
    cutaway.userData.dynamic = true;
    cutaway.visible = false;
    group.add(cutaway);
    const lowWallHeight = 0.24;
    for (const [wallX, wallZ, halfWidth, halfDepth] of solids) {
      part(cutaway, box(halfWidth * 2, lowWallHeight, halfDepth * 2), wallMat, wallX, lowWallHeight / 2, wallZ);
    }
    mergeToonMeshes(cutaway, { outlines: false });
    interior = new THREE.Group();
    interior.userData.dynamic = true;
    group.add(interior);
    addInterior(interior, w, d, style);
    const bbox = new THREE.Box3();
    for (const mesh of interior.children) {
      mesh.geometry.computeBoundingBox();
      bbox.copy(mesh.geometry.boundingBox).translate(mesh.position);
      // 地毯和桌上的物品不占用行走空间。
      if (bbox.max.y <= 0.05 || bbox.min.y > 0.72) continue;
      solids.push([mesh.position.x, mesh.position.z, (bbox.max.x - bbox.min.x) / 2, (bbox.max.z - bbox.min.z) / 2]);
    }
    mergeToonMeshes(interior, { outlines: false, bakeColors: true });
    interior.visible = false;
  }
  return { x, z, halfW, halfD, door, shell, cutaway, interior, solids, sin: Math.sin(yaw), cos: Math.cos(yaw), name: ROOM_NAMES[style.interior] };
}

function fishMarket(scene) {
  assertInside('鱼市棚', 2, 7.7, 3);
  const group = new THREE.Group();
  group.position.set(2, -0.29, 7.7);
  scene.add(group);

  for (const x of [-2.1, 2.1]) for (const z of [-1.3, 1.3]) {
    part(group, box(0.2, 2.3, 0.2), mat(C.wood), x, 1.15, z);
  }
  part(group, box(4.8, 0.19, 3.25), mat(ROOF_COLORS[1]), 0, 2.43, 0, true);
  part(group, box(3.7, 0.58, 0.65), mat(C.woodDark), 0, 0.85, 0.3, true);

  // 台面上的鱼箱与鱼
  for (let i = 0; i < 4; i++) {
    const px = -1.35 + i * 0.9;
    part(group, box(0.52, 0.18, 0.35), mat(C.woodLight), px, 1.22, 0.3);
    part(group, box(0.34, 0.08, 0.16), mat(C.fish), px, 1.34, 0.3);
  }

  // 挂灯
  part(group, new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), mat(C.dark), 0, 2.16, -1.0);
  part(group, new THREE.SphereGeometry(0.13, 8, 6), mat(C.lamp), 0, 1.88, -1.0);
}

function torii(scene) {
  const group = new THREE.Group();
  group.position.set(19, -0.29, 23);
  assertInside('鸟居', 19, 23, 1.6);
  group.rotation.y = -0.35;
  scene.add(group);
  for (const x of [-1.0, 1.0]) {
    part(group, new THREE.CylinderGeometry(0.13, 0.16, 2.6, 8), mat(C.red), x, 1.3, 0, true);
  }
  part(group, box(2.75, 0.26, 0.35), mat(C.red), 0, 2.48, 0, true);
  part(group, box(2.35, 0.13, 0.26), mat(C.dark), 0, 1.93, 0);
}

function shrineAndPath(scene) {
  // 鸟居后的低矮小庙；连接村道由 routes.js 绘制。
  const group = new THREE.Group();
  group.position.set(19, -0.15, 27.3);
  assertInside('小庙', 19, 27.3, 1.4);
  scene.add(group);
  part(group, box(2.2, 1.7, 2.0), mat(WALL_COLORS[0]), 0, 0.75, 0);
  part(group, roofGeometry(2.2, 2.0), mat(ROOF_COLORS[0]), 0, 1.58, 0);
  part(group, box(0.52, 1.0, 0.07), mat(C.wood), 0, 0.5, 1.05);
}

export const HOUSE_LAYOUT = [
  [-19, 9, 3.7, 3.0, 0, 0.10, true], [-12, 8, 3.3, 3.0, 1, -0.18, false],
  [11, 8, 3.7, 3.1, 0, 0.20, true], [18, 9, 3.4, 3.0, 2, -0.12, false],
  [-17, 17, 3.9, 3.2, 2, -0.14, false], [-8, 17, 3.6, 3.0, 0, 0.12, true],
  [5, 17, 3.7, 3.1, 1, -0.18, false], [13, 18, 3.6, 3.0, 0, 0.12, false],
  [-24, 21, 3.4, 3.0, 1, 0.08, false], [0, 26, 3.5, 2.8, 2, -0.12, true],
];

// 与 HOUSE_LAYOUT 一一对应：墙色、层高、门是否开、室内类型、附属件。
export const HOUSE_STYLE = [
  { wall: 0, height: 2.30, door: 'open', interior: 'bed', flowers: true, quilt: C.quiltWarm },
  { wall: 1, height: 2.15, door: 'shut', shutters: '#7E9E82' },
  { wall: 2, height: 2.25, door: 'open', interior: 'dining', awning: '#D9574A' },
  { wall: 3, height: 2.18, door: 'shut', flowers: true },
  { wall: 4, height: 2.35, door: 'open', interior: 'living', shutters: '#4A7FB5' },
  { wall: 1, height: 2.20, door: 'shut', awning: '#4A7FB5' },
  { wall: 0, height: 2.28, door: 'open', interior: 'storage', flowers: true },
  { wall: 2, height: 2.15, door: 'shut' },
  {
    wall: 4, height: 2.32, door: 'open', interior: 'bed', shutters: '#7E9E82',
    quilt: C.quiltCool, rug: C.rugCool, chimneyColor: '#9A6B42',
  },
  { wall: 3, height: 2.40, door: 'shut', flowers: true },
];

export function addHouses(scene) {
  const district = new THREE.Group();
  district.userData.dynamic = true;
  scene.add(district);
  const houses = HOUSE_LAYOUT.map((args, i) => house(district, ...args, HOUSE_STYLE[i] ?? {}));
  fishMarket(district);
  torii(district);
  shrineAndPath(district);
  mergeToonMeshes(district, { skipDynamic: true, bakeColors: true });
  return houses;
}

export function houseLocalPosition(house, x, z) {
  const dx = x - house.x;
  const dz = z - house.z;
  return { x: house.cos * dx - house.sin * dz, z: house.sin * dx + house.cos * dz };
}

export function updateHouses(houses, position, indoorHouse, delta) {
  for (const house of houses) {
    if (!house.door) continue;
    house.shell.visible = indoorHouse !== house;
    house.cutaway.visible = indoorHouse === house;
    house.interior.visible = Math.hypot(position.x - house.x, position.z - house.z) < 5.2;
    const { door } = house;
    door.leaf.rotation.y = THREE.MathUtils.damp(door.leaf.rotation.y, door.open ? OPEN_ANGLE : 0, 12, delta);
  }
}
