// 文件职责：树、码头道具、动态浮标与海鸥；对应指导书第 5.2 章及 M3 审查清单。
import * as THREE from 'three';
import { makeToonMaterial as toon } from '../toon/materials.js';
import { WATER_Y, assertInside } from './constants.js';
import { waveHeight } from './water.js';

const mat = {
  grass: toon('#8CC65A'), grassDark: toon('#4E8A4A'),
  wood: toon('#B07848'), woodDark: toon('#6B4530'),
  red: toon('#D9574A'), white: toon('#F6F1E7'),
  dark: toon('#2B2A3A'), yellow: toon('#FFE8B0'), blue: toon('#4A7FB5'),
};

function part(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function groundGroup(scene, x, z, name, radius) {
  assertInside(name, x, z, radius);
  const group = new THREE.Group();
  group.position.set(x, -0.29, z);
  scene.add(group);
  return group;
}

function tree(scene, x, z, scale, index) {
  const group = groundGroup(scene, x, z, `树 ${index}`, 2 * scale);
  group.scale.setScalar(scale);
  part(group, new THREE.CylinderGeometry(0.19, 0.27, 1.8, 7), mat.woodDark, 0, 0.9, 0);
  const leaf = new THREE.IcosahedronGeometry(1.05, 0);
  part(group, leaf, index % 2 ? mat.grassDark : mat.grass, 0, 2.15, 0);
  part(group, leaf, mat.grass, -0.55, 1.9, 0.18);
  part(group, leaf, mat.grassDark, 0.5, 2.0, -0.2);
}

function crate(scene, x, z, yaw = 0) {
  const group = groundGroup(scene, x, z, '木箱', 0.65);
  group.rotation.y = yaw;
  part(group, new THREE.BoxGeometry(0.8, 0.7, 0.8), mat.wood, 0, 0.35, 0);
  for (const side of [-1, 1]) {
    part(group, new THREE.BoxGeometry(0.08, 0.72, 0.82), mat.woodDark, side * 0.29, 0.35, 0);
  }
}

function dryingRack(scene, x, z) {
  const group = groundGroup(scene, x, z, '晾鱼架', 1.4);
  for (const side of [-1, 1]) part(group, new THREE.CylinderGeometry(0.07, 0.08, 2.1, 6), mat.woodDark, side * 1.1, 1.05, 0);
  part(group, new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), mat.woodDark, 0, 2.07, 0).rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const xFish = -0.8 + i * 0.4;
    part(group, new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), mat.dark, xFish, 1.96, 0);
    part(group, new THREE.ConeGeometry(0.15, 0.42, 5), mat.white, xFish, 1.69, 0).rotation.x = Math.PI;
  }
}

function netFrame(scene, x, z) {
  const group = groundGroup(scene, x, z, '渔网架', 1.4);
  for (const side of [-1, 1]) part(group, new THREE.CylinderGeometry(0.07, 0.08, 1.9, 6), mat.woodDark, side * 1.2, 0.95, 0);
  part(group, new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), mat.woodDark, 0, 1.9, 0).rotation.z = Math.PI / 2;
  const points = [];
  for (let i = 0; i <= 8; i++) {
    const xLine = -1.1 + i * 0.275;
    points.push(xLine, 0.35, 0, xLine, 1.8, 0);
  }
  for (let i = 0; i <= 5; i++) {
    const yLine = 0.35 + i * 0.29;
    points.push(-1.1, yLine, 0, 1.1, yLine, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#6B4530' })));
}

function dockCrane(scene) {
  const group = groundGroup(scene, 23, 4, '吊杆', 2.8);
  part(group, new THREE.CylinderGeometry(0.16, 0.2, 3.4, 8), mat.woodDark, 0, 1.7, 0);
  const arm = part(group, new THREE.BoxGeometry(0.16, 0.18, 2.6), mat.wood, 0, 3.3, -1.1);
  arm.rotation.x = -0.17;
  const tip = new THREE.Vector3(0, 0, -1.3).applyEuler(arm.rotation).add(arm.position);
  const hookY = 1.32;
  part(group, new THREE.CylinderGeometry(0.025, 0.025, tip.y - hookY, 6), mat.dark,
    tip.x, (tip.y + hookY) / 2, tip.z);
  part(group, new THREE.TorusGeometry(0.18, 0.045, 5, 8), mat.dark, tip.x, hookY, tip.z);
}

function dockExtras(scene) {
  const group = groundGroup(scene, -22, 4, '码头杂物', 2.2);
  for (const x of [-0.8, 0.1]) {
    part(group, new THREE.CylinderGeometry(0.33, 0.33, 0.8, 10), mat.blue, x, 0.4, 0);
    part(group, new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10), mat.dark, x, 0.73, 0);
  }
  part(group, new THREE.TorusGeometry(0.35, 0.1, 8, 14), mat.red, 1.0, 0.55, 0).rotation.y = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    part(group, new THREE.TorusGeometry(0.34 - i * 0.04, 0.045, 6, 16), mat.wood,
      0.7, 0.07 + i * 0.1, 1.0).rotation.x = Math.PI / 2;
  }
}

function buoy(scene, x, z) {
  assertInside('浮标', x, z, 0.5);
  const group = new THREE.Group();
  group.position.set(x, WATER_Y + 0.08, z);
  group.userData.dynamic = true;
  scene.add(group);
  part(group, new THREE.CylinderGeometry(0.3, 0.32, 0.75, 10), mat.red, 0, 0, 0);
  part(group, new THREE.CylinderGeometry(0.31, 0.31, 0.16, 10), mat.white, 0, 0.18, 0);
  part(group, new THREE.ConeGeometry(0.28, 0.3, 10), mat.red, 0, 0.53, 0);
  return group;
}

function gull(scene, radius, height, phase) {
  const group = new THREE.Group();
  group.userData.dynamic = true;
  group.userData.radius = radius;
  group.userData.height = height;
  group.userData.phase = phase;
  scene.add(group);
  part(group, new THREE.SphereGeometry(0.17, 7, 5), mat.white, 0, 0, 0);
  const wings = [];
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(side * 1.2, 0.12); shape.lineTo(side * 0.63, 0.22); shape.closePath();
    wings.push(part(group, new THREE.ShapeGeometry(shape), mat.white, 0, 0, 0));
  }
  part(group, new THREE.ConeGeometry(0.08, 0.25, 5), mat.yellow, 0, -0.02, -0.22).rotation.x = Math.PI / 2;
  group.userData.wings = wings;
  return group;
}

export const TREE_LAYOUT = [[-25, 10, 1], [-22, 16, 0.85], [-17, 24, 1.05], [-4, 24, 0.9],
    [8, 24, 1], [25, 18, 0.85], [2, 29, 0.75], [-26, 17, 0.9], [27, 9, 0.8]];

export function addProps(scene) {
  TREE_LAYOUT.forEach(([x, z, scale], i) => tree(scene, x, z, scale, i));
  [[-20, 4], [-18.8, 4.5], [-7, 3.8], [5, 4.2], [20, 4.5]].forEach(([x, z], i) => crate(scene, x, z, i * 0.3));
  dryingRack(scene, -5.5, 5.2);
  dryingRack(scene, 7, 5.4);
  netFrame(scene, -12, 4.7);
  dockCrane(scene);
  dockExtras(scene);
  const buoys = [buoy(scene, -28, -12), buoy(scene, 30, -8)];
  const gulls = [gull(scene, 4.5, 7, 0), gull(scene, 5.6, 8.2, 2.1), gull(scene, 6.6, 6.8, 4.2)];
  return { buoys, gulls };
}

export function updateProps(props, time) {
  for (const marker of props.buoys) {
    marker.position.y = WATER_Y + 0.08 + waveHeight(marker.position.x, marker.position.z, time);
    marker.rotation.z = 0.04 * Math.sin(time * 1.2 + marker.position.x);
  }
  for (const bird of props.gulls) {
    const { radius, height, phase, wings } = bird.userData;
    const angle = time * 0.35 + phase;
    bird.position.set(9 + Math.cos(angle) * radius, height + 0.25 * Math.sin(angle * 2), -20 + Math.sin(angle) * radius);
    bird.rotation.y = -angle;
    wings[0].rotation.z = -0.12 - 0.5 * Math.sin(time * 6 + phase);
    wings[1].rotation.z = 0.12 + 0.5 * Math.sin(time * 6 + phase);
  }
}
