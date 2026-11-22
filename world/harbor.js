// 文件职责：贴水石岸、三座栈桥、留航道的防波堤与落地灯塔；对应指导书第 5 章及 M3 审查清单。
import * as THREE from 'three';
import { makeToonMaterial as toon, addOutline } from '../toon/materials.js';
import { WATER_Y, assertInside } from './constants.js';
import { shoreZ } from './water.js';

const stone = toon('#C9C2B4');
const stoneDark = toon('#A8A092');
const wood = toon('#B07848');
const woodDark = toon('#6B4530');
const white = toon('#F6F1E7');
const red = toon('#D9574A');
const glass = toon('#FFE8B0', { emissive: '#FFF1C9', emissiveIntensity: 0.9 });

function part(parent, geometry, material, x, y, z, outline = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (outline) addOutline(mesh);
  return mesh;
}

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function instances(scene, name, geometry, material, placements, boundRadius) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  const dummy = new THREE.Object3D();
  placements.forEach(([x, y, z, rotation = 0, sx = 1, sy = 1, sz = 1], i) => {
    assertInside(`${name} ${i}`, x, z, boundRadius * Math.max(sx, sz));
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  addOutline(mesh);
  return mesh;
}

export function addHarbor(scene) {
  const random = mulberry32(20261119);
  // 人工岸的中心线是 z=-2；石岸外沿抵达水线，顶面高于水位约 0.7。
  const quay = Array.from({ length: 16 }, (_, i) => {
    const x = -18.75 + i * 2.5;
    return [x, -0.05, shoreZ(x) + 0.35, 0, 0.94 + random() * 0.06, 1, 1];
  });
  instances(scene, '石岸', new THREE.BoxGeometry(2.48, 0.9, 1.1), stone, quay, 1.4);
  const planks = [], rails = [], posts = [];
  for (const x of [-13, 0, 13]) {
    for (let i = 0; i < 7; i++) planks.push([x, 0.28, -2.65 - i * 1.1]);
    for (const side of [-1, 1]) {
      rails.push([x + side * 1.03, 0.24, -5.9]);
      for (const z of [-2.7, -5.9, -9.2]) posts.push([x + side * 1.0, -0.48, z]);
    }
  }
  instances(scene, '栈桥木板', new THREE.BoxGeometry(2.25, 0.16, 1.05), wood, planks, 1.3);
  instances(scene, '栈桥边梁', new THREE.BoxGeometry(0.16, 0.17, 7.75), woodDark, rails, 4.0);
  instances(scene, '栈桥桩', new THREE.CylinderGeometry(0.17, 0.20, 1.45, 8), woodDark, posts, 0.25);

  // 堤头停在 x≈8，东岸留出宽阔进港航道。
  const breakwater = [];
  for (let i = 0; i < 11; i++) {
    const x = -22 + i * 3;
    const z = -20.0 - 2.0 * Math.sin(i / 10 * Math.PI);
    breakwater.push([x, -0.05, z, Math.cos(i / 10 * Math.PI) * 0.15,
      0.94 + random() * 0.08, 1, 1]);
  }
  instances(scene, '防波堤', new THREE.BoxGeometry(2.95, 0.9, 1.65), stoneDark, breakwater, 1.75);

  const beaconX = 9.0, beaconZ = -20.0;
  assertInside('灯塔基座', beaconX, beaconZ, 1.8);
  part(scene, new THREE.CylinderGeometry(1.8, 1.9, 1.4, 12), stoneDark,
    beaconX, WATER_Y - 0.6 + 0.7, beaconZ, true);
  const lighthouse = new THREE.Group();
  lighthouse.position.set(beaconX, 0.725, beaconZ);
  scene.add(lighthouse);
  part(lighthouse, new THREE.CylinderGeometry(1.27, 1.5, 0.55, 12), stoneDark, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    part(lighthouse, new THREE.CylinderGeometry(0.88 - i * 0.055, 0.95 - i * 0.055, 0.82, 12),
      i % 2 ? red : white, 0, 0.65 + i * 0.81, 0);
  }
  part(lighthouse, new THREE.CylinderGeometry(1.0, 1.0, 0.17, 12), stoneDark, 0, 4.78, 0);
  const lens = part(lighthouse, new THREE.CylinderGeometry(0.72, 0.72, 0.78, 12), glass, 0, 5.2, 0);
  part(lighthouse, new THREE.ConeGeometry(1.1, 0.72, 12), red, 0, 5.97, 0);
  part(lighthouse, new THREE.BoxGeometry(0.48, 0.8, 0.08), woodDark, 0, 0.82, 0.95, false);
  return lens.getWorldPosition(new THREE.Vector3());
}
