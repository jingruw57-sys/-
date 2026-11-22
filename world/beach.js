// 文件职责：东岸沙滩的缓坡、伞椅与边桌，以及与行走和海岸共用的数据。
import * as THREE from 'three';
import { makeToonMaterial } from '../toon/materials.js';
import { WATER_Y } from './constants.js';

const SAND_Y = -0.185;
const FLAT_RATIO = 0.52;
const WATERLINE_RATIO = 0.80;
const EDGE_DROP = (SAND_Y - WATER_Y) / THREE.MathUtils.smoothstep(WATERLINE_RATIO, FLAT_RATIO, 1);
export const BEACH = { x: 28.8, z: 5.2, radius: 8.15, sandColor: '#F9E7BD' };
export const BEACH_WATERLINE_RADIUS = BEACH.radius * WATERLINE_RATIO;

const COLORS = {
  wood: '#B07848',
  pole: '#6B4530',
  fabric: '#F6F1E7',
  canvasWarm: '#F08A5D',
  canvasCool: '#5BAEC4',
  cap: '#2B2A3A',
};

// 躺椅面朝东岸海湾，两套伞椅沿岸并排。
const facing = 0.32;
const shoreX = Math.sin(facing);
const shoreZ = -Math.cos(facing);
const spots = [
  { offset: -2.5, color: COLORS.canvasWarm, twist: 0.31 },
  { offset: 2.5, color: COLORS.canvasCool, twist: -0.17 },
].map(({ offset, color, twist }) => {
  const x = BEACH.x - shoreZ * offset;
  const z = BEACH.z + shoreX * offset;
  return { x, z, umbrellaX: x - shoreX * 1.15, umbrellaZ: z - shoreZ * 1.15, color, twist };
});
const table = { x: BEACH.x - shoreX * 1.5, z: BEACH.z - shoreZ * 1.5 };
export const BEACH_OBSTACLES = [
  ...spots.flatMap(({ x, z, umbrellaX, umbrellaZ }) => [[x, z, 1.05], [umbrellaX, umbrellaZ, 0.12]]),
  [table.x, table.z, 0.42],
];

function sandElevation(ratio) {
  return SAND_Y - THREE.MathUtils.smoothstep(ratio, FLAT_RATIO, 1) * EDGE_DROP;
}

export function beachHeightAt(x, z) {
  const ratio = Math.hypot(x - BEACH.x, z - BEACH.z) / BEACH.radius;
  return ratio <= 1 ? sandElevation(ratio) : null;
}

// 沙丘：内圈水平，外缘按 smoothstep 沉到水面以下，形成缓坡。
function addSand(scene) {
  const geometry = new THREE.RingGeometry(0, 1, 72, 24);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const r = Math.min(1, Math.hypot(x, y));
    // 局部 z 经 rotateX(-π/2) 后成为世界 Y。
    position.setZ(i, sandElevation(r) - SAND_Y);
  }
  position.needsUpdate = true;
  geometry.scale(BEACH.radius, BEACH.radius, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const sand = new THREE.Mesh(geometry, makeToonMaterial(BEACH.sandColor));
  sand.position.set(BEACH.x, SAND_Y, BEACH.z);
  sand.receiveShadow = true;
  // 地形不描边，也不参与合并：避免草地边缘被一圈黑线切开。
  sand.userData.noMerge = true;
  scene.add(sand);
}

// 伞面：顶点 → 中间环 → 外环三段，非索引化后算法线得到棱角分明的十边形。
function buildCanopy(radius, height, segments) {
  const positions = [0, height, 0];
  const indices = [];
  const midR = radius * 0.6;
  const midY = height * 0.56;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * midR, midY, Math.sin(a) * midR);
  }
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, height * 0.14, Math.sin(a) * radius);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + next, 1 + i);
    indices.push(1 + i, 1 + segments + next, 1 + segments + i);
    indices.push(1 + i, 1 + next, 1 + segments + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

function addUmbrella(scene, x, y, z, twist, canvasColor) {
  const pole = new THREE.CylinderGeometry(0.048, 0.055, 2.55, 8);
  pole.translate(x, y + 1.275, z);
  const poleMesh = new THREE.Mesh(pole, makeToonMaterial(COLORS.pole));
  poleMesh.castShadow = true;
  poleMesh.receiveShadow = true;
  scene.add(poleMesh);

  const canopy = buildCanopy(1.58, 0.66, 10);
  canopy.rotateY(twist);
  canopy.translate(x, y + 2.55, z);
  const canopyMesh = new THREE.Mesh(canopy, makeToonMaterial(canvasColor, { side: THREE.DoubleSide }));
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  scene.add(canopyMesh);

  const rim = new THREE.TorusGeometry(1.58, 0.052, 5, 10);
  rim.rotateX(-Math.PI / 2);
  rim.rotateY(twist);
  rim.translate(x, y + 2.55 + 0.66 * 0.14, z);
  const rimMesh = new THREE.Mesh(rim, makeToonMaterial(COLORS.fabric));
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  scene.add(rimMesh);

  const cap = new THREE.SphereGeometry(0.085, 8, 6);
  cap.translate(x, y + 2.55 + 0.66, z);
  const capMesh = new THREE.Mesh(cap, makeToonMaterial(COLORS.cap));
  capMesh.castShadow = true;
  scene.add(capMesh);
}

// 躺椅先按局部坐标摆放，再整体朝向海湾。静态合并时统一生成描边。
function addLounger(scene, x, y, z, yaw) {
  const frame = makeToonMaterial(COLORS.wood);
  const fabric = makeToonMaterial(COLORS.fabric);

  const pieces = [
    { g: new THREE.BoxGeometry(0.78, 0.09, 1.26), m: fabric, at: [0, 0.45, 0.3] },
    { g: new THREE.BoxGeometry(0.78, 0.09, 0.94), m: fabric, at: [0, 0.67, -0.74], tilt: 0.55 },
    { g: new THREE.BoxGeometry(0.07, 0.42, 1.36), m: frame, at: [0.37, 0.21, 0.3] },
    { g: new THREE.BoxGeometry(0.07, 0.42, 1.36), m: frame, at: [-0.37, 0.21, 0.3] },
  ];

  for (const piece of pieces) {
    if (piece.tilt) piece.g.rotateX(piece.tilt);
    piece.g.translate(piece.at[0], piece.at[1], piece.at[2]);
    piece.g.rotateY(yaw);
    piece.g.translate(x, y, z);
    const item = new THREE.Mesh(piece.g, piece.m);
    item.castShadow = true;
    item.receiveShadow = true;
    scene.add(item);
  }
}

function addSideTable(scene, x, y, z) {
  const leg = new THREE.CylinderGeometry(0.05, 0.06, 0.58, 8);
  leg.translate(x, y + 0.29, z);
  const legMesh = new THREE.Mesh(leg, makeToonMaterial(COLORS.pole));
  legMesh.castShadow = true;
  legMesh.receiveShadow = true;
  scene.add(legMesh);

  const top = new THREE.CylinderGeometry(0.42, 0.42, 0.07, 12);
  top.translate(x, y + 0.62, z);
  const topMesh = new THREE.Mesh(top, makeToonMaterial(COLORS.wood));
  topMesh.castShadow = true;
  topMesh.receiveShadow = true;
  scene.add(topMesh);
}

export function addBeach(scene) {
  addSand(scene);
  for (const { x, z, umbrellaX, umbrellaZ, color, twist } of spots) {
    addLounger(scene, x, beachHeightAt(x, z), z, Math.PI - facing);
    addUmbrella(scene, umbrellaX, beachHeightAt(umbrellaX, umbrellaZ), umbrellaZ, twist, color);
  }
  addSideTable(scene, table.x, beachHeightAt(table.x, table.z), table.z);
}
