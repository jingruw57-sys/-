// 文件职责：四艘渔船、一艘小帆船、一艘小渡轮；对应指导书第 5.2 章及 M3 审查清单。
import * as THREE from 'three';
import { makeToonMaterial as toon, addOutline } from '../toon/materials.js';
import { WATER_Y, assertInside } from './constants.js';
import { waveHeight } from './water.js';
import { mergeToonMeshes } from './merge.js';

const mat = {
  white: toon('#F6F1E7'), blue: toon('#4A7FB5'), red: toon('#D9574A'),
  wood: toon('#B07848'), dark: toon('#2B2A3A'), sail: toon('#FFF1C9', { side: THREE.DoubleSide }),
};
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

function part(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// 挤出后收窄底部、抬高船头，形成低多边形 V 底与舷弧。
function hull(length, width, depth) {
  const h = length / 2, w = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w * 0.8, -h);
  shape.lineTo(w * 0.8, -h);
  shape.lineTo(w, -h * 0.55);
  shape.lineTo(w, h * 0.58);
  shape.quadraticCurveTo(0, h * 1.12, -w, h * 0.58);
  shape.lineTo(-w, -h * 0.55);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.10,
    bevelSize: 0.10, bevelSegments: 1, curveSegments: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (y < depth * 0.4) x *= 0.58;
    if (z < -h * 0.5) y += 0.25 * THREE.MathUtils.clamp((-z - h * 0.5) / (h * 0.5), 0, 1);
    positions.setXYZ(i, x, y, z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function finishBoat(scene, boat, label, radius) {
  assertInside(label, boat.position.x, boat.position.z, radius);
  mergeToonMeshes(boat);
  boat.userData.dynamic = true;
  boat.userData.baseY = boat.position.y;
  scene.add(boat);
  return boat;
}

function fishingBoat(scene, x, z, yaw, bodyColor, label) {
  const boat = new THREE.Group();
  boat.position.set(x, WATER_Y - 0.12, z);
  boat.rotation.y = yaw;
  const width = 2.2;
  part(boat, hull(5, width, 0.55), bodyColor);
  part(boat, box(1.48, 0.12, 3.15), mat.wood, 0, 0.68, -0.25);
  part(boat, box(1.16, 1.1, 1.26), mat.white, 0, 1.29, -0.7);
  part(boat, box(1.44, 0.17, 1.5), bodyColor, 0, 1.92, -0.7);
  part(boat, box(0.8, 0.43, 0.035), mat.dark, 0, 1.42, -0.055);
  part(boat, new THREE.CylinderGeometry(0.055, 0.055, 2.1, 8), mat.wood, 0, 1.75, 1.03);
  const flag = new THREE.Shape();
  flag.moveTo(0, 0); flag.lineTo(0.85, -0.18); flag.lineTo(0, -0.46); flag.closePath();
  const flagColor = `#${bodyColor.color.getHexString()}`;
  part(boat, new THREE.ShapeGeometry(flag), toon(flagColor, { side: THREE.DoubleSide }), 0.05, 2.72, 1.03);
  for (const side of [-1, 1]) {
    part(boat, box(0.05, 0.1, 3.5), mat.white, side * (width / 2 + 0.12), 0.46, 0);
  }
  part(boat, new THREE.TorusGeometry(0.28, 0.08, 6, 12), mat.red, 0.7, 1.1, -0.65).rotation.y = Math.PI / 2;
  return finishBoat(scene, boat, label, 3.1);
}

function sailBoat(scene) {
  const boat = new THREE.Group();
  boat.position.set(-10, WATER_Y - 0.12, -15);
  boat.rotation.y = -0.35;
  part(boat, hull(5.5, 2.1, 0.5), mat.white);
  part(boat, box(1.55, 0.1, 3.3), mat.wood, 0, 0.64, -0.3);
  part(boat, new THREE.CylinderGeometry(0.065, 0.075, 4.1, 8), mat.wood, 0, 2.7, 0);
  const sail = new THREE.Shape();
  sail.moveTo(0.1, 0.9); sail.lineTo(0.1, 4.65); sail.lineTo(1.9, 1.15); sail.closePath();
  part(boat, new THREE.ShapeGeometry(sail), mat.sail, 0, 0, 0);
  return finishBoat(scene, boat, '小帆船', 3.2);
}

function ferry(scene) {
  const boat = new THREE.Group();
  boat.position.set(24, WATER_Y - 0.12, -13);
  boat.rotation.y = -0.18;
  const width = 2.8;
  part(boat, hull(5.4, width, 0.65), mat.white);
  part(boat, box(2.2, 0.14, 4.5), mat.wood, 0, 0.8, -0.2);
  part(boat, box(2.0, 1.05, 3.2), mat.white, 0, 1.45, -0.55);
  part(boat, box(2.25, 0.16, 3.5), mat.blue, 0, 2.05, -0.55);
  part(boat, box(1.4, 0.65, 1.6), mat.white, 0, 2.44, -0.8);
  part(boat, box(1.6, 0.14, 1.85), mat.blue, 0, 2.83, -0.8);
  part(boat, new THREE.CylinderGeometry(0.22, 0.24, 0.62, 10), mat.red, 0, 3.21, -0.8);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      part(boat, box(0.04, 0.28, 0.32), mat.blue, side * (width / 2 + 0.12), 0.45, -1.65 + i * 0.72);
    }
    for (let i = 0; i < 4; i++) {
      part(boat, box(0.04, 0.36, 0.38), mat.dark, side * 1.02, 1.46, -1.65 + i * 0.72);
    }
  }
  return finishBoat(scene, boat, '小渡轮', 3.8);
}

export function addBoats(scene) {
  return [
    fishingBoat(scene, -15.5, -6.6, 0, mat.red, '西栈桥渔船'),
    fishingBoat(scene, 2.5, -6.6, 0, mat.blue, '中栈桥渔船'),
    fishingBoat(scene, 15.5, -6.6, 0, mat.white, '东栈桥渔船'),
    fishingBoat(scene, -2, -15, -0.3, mat.red, '港池渔船'),
    sailBoat(scene), ferry(scene),
  ];
}

export function updateBoats(boats, time) {
  for (const boat of boats) {
    boat.position.y = boat.userData.baseY + waveHeight(boat.position.x, boat.position.z, time);
    boat.rotation.x = 0.018 * Math.sin(time * 1.2 + boat.position.x * 0.3);
    boat.rotation.z = 0.017 * Math.sin(time * 1.5 + boat.position.z * 0.25);
  }
}
