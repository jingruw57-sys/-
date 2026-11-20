// 文件职责：坡屋顶渔村小屋、鱼市棚和鸟居；对应指导书第 5.1、5.2、9 章（M3）。
import * as THREE from 'three';
import { makeToonMaterial, addOutline } from '../toon/materials.js';
import { assertInside } from './constants.js';

const wall = makeToonMaterial('#F6F1E7');
const roof = ['#D9574A', '#4A7FB5', '#709A8D'].map(makeToonMaterial);
const wood = makeToonMaterial('#B07848');
const dark = makeToonMaterial('#2B2A3A');
const red = makeToonMaterial('#D9574A');

function part(parent, geometry, material, x, y, z, outline = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (outline) addOutline(mesh);
  return mesh;
}

function roofGeometry(w, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.25, 0);
  shape.lineTo(0, 0.9);
  shape.lineTo(w / 2 + 0.25, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d + 0.4, bevelEnabled: false });
  geometry.translate(0, 0, -(d + 0.4) / 2);
  return geometry;
}

function house(scene, x, z, w, d, roofIndex, yaw = 0, chimney = false) {
  assertInside('渔村小屋', x, z, Math.hypot(w, d) / 2 + 0.2);
  const group = new THREE.Group();
  group.position.set(x, -0.15, z);
  group.rotation.y = yaw;
  scene.add(group);
  part(group, new THREE.BoxGeometry(w, 2.2, d), wall, 0, 0.96, 0, true);
  part(group, roofGeometry(w, d), roof[roofIndex], 0, 2.07, 0, true);
  part(group, new THREE.BoxGeometry(0.72, 1.35, 0.07), wood, 0, 0.53, d / 2 + 0.05);
  for (const side of [-1, 1]) {
    part(group, new THREE.BoxGeometry(0.58, 0.58, 0.07), dark,
      side * (w * 0.32), 1.25, d / 2 + 0.055);
    part(group, new THREE.BoxGeometry(0.065, 0.64, 0.08), wall,
      side * (w * 0.32), 1.25, d / 2 + 0.10);
  }
  if (chimney) part(group, new THREE.BoxGeometry(0.42, 1.0, 0.42), wood, -w * 0.26, 3.0, -d * 0.2, true);
}

function fishMarket(scene) {
  assertInside('鱼市棚', 2, 7.7, 3);
  const group = new THREE.Group();
  group.position.set(2, -0.29, 7.7);
  scene.add(group);
  for (const x of [-2.1, 2.1]) for (const z of [-1.3, 1.3]) {
    part(group, new THREE.BoxGeometry(0.2, 2.3, 0.2), wood, x, 1.15, z);
  }
  part(group, new THREE.BoxGeometry(4.8, 0.19, 3.25), roof[1], 0, 2.43, 0, true);
  part(group, new THREE.BoxGeometry(3.7, 0.58, 0.65), wood, 0, 0.85, 0.3, true);
  for (let i = 0; i < 4; i++) {
    part(group, new THREE.BoxGeometry(0.52, 0.18, 0.35), wall, -1.35 + i * 0.9, 1.22, 0.3);
  }
}

function torii(scene) {
  const group = new THREE.Group();
  group.position.set(19, -0.29, 23);
  assertInside('鸟居', 19, 23, 1.6);
  group.rotation.y = -0.35;
  scene.add(group);
  for (const x of [-1.0, 1.0]) part(group, new THREE.CylinderGeometry(0.13, 0.16, 2.6, 8), red, x, 1.3, 0, true);
  part(group, new THREE.BoxGeometry(2.75, 0.26, 0.35), red, 0, 2.48, 0, true);
  part(group, new THREE.BoxGeometry(2.35, 0.13, 0.26), dark, 0, 1.93, 0);
}

function shrineAndPath(scene) {
  // 鸟居后的低矮小庙；连接村道由 routes.js 绘制。
  const group = new THREE.Group();
  group.position.set(19, -0.15, 27.3);
  assertInside('小庙', 19, 27.3, 1.4);
  scene.add(group);
  part(group, new THREE.BoxGeometry(2.2, 1.7, 2.0), wall, 0, 0.75, 0);
  part(group, roofGeometry(2.2, 2.0), roof[0], 0, 1.58, 0);
  part(group, new THREE.BoxGeometry(0.52, 1.0, 0.07), wood, 0, 0.5, 1.05, false);
}

export const HOUSE_LAYOUT = [
    [-19, 9, 3.7, 3.0, 0, 0.10, true], [-12, 8, 3.3, 3.0, 1, -0.18, false],
    [11, 8, 3.7, 3.1, 0, 0.20, true], [18, 9, 3.4, 3.0, 2, -0.12, false],
    [-17, 17, 3.9, 3.2, 2, -0.14, false], [-8, 17, 3.6, 3.0, 0, 0.12, true],
    [5, 17, 3.7, 3.1, 1, -0.18, false], [13, 18, 3.6, 3.0, 0, 0.12, false],
    [-24, 21, 3.4, 3.0, 1, 0.08, false], [0, 26, 3.5, 2.8, 2, -0.12, true],
];

export function addHouses(scene) {
  for (const args of HOUSE_LAYOUT) house(scene, ...args);
  fishMarket(scene);
  torii(scene);
  shrineAndPath(scene);
}
