// 文件职责：连接渔村、鱼市、三座栈桥和鸟居的可辨认村道；游戏地图扩展。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToonMaterial } from '../toon/materials.js';

export const ROUTES = [
  [[-23, 13.1], [-17, 13], [-9, 12.7], [0, 13], [9, 12.8], [19, 13], [23, 13.2], [26, 13], [28.7, 11.4]],
  [[-15.5, 13], [-15.5, 10.5], [-15.3, 5.3], [-14.2, 1.4], [-13, -1.4]],
  [[0, 13], [-2.7, 10.6], [-3.2, 7.8], [-2.9, 4.5], [-2.4, 1.3], [0, -1.4]],
  [[14.5, 13], [14.5, 10.5], [14.6, 5.2], [13.8, 1.4], [13, -1.4]],
  [[19, 13], [19, 17.5], [19, 22.9], [19, 26.0]],
];

function ribbon(points, width, y) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length * width / 2;
    const nz = dx / length * width / 2;
    positions.push(x + nx, y, z + nz, x - nx, y, z - nz);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addRoutes(scene) {
  const border = makeToonMaterial('#B07848', { side: THREE.DoubleSide });
  const path = makeToonMaterial('#F2D9A0', { side: THREE.DoubleSide });
  for (const [width, y, material] of [[2.25, -0.276, border], [1.86, -0.272, path]]) {
    const pieces = ROUTES.map((points) => ribbon(points, width, y));
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach((piece) => piece.dispose());
    if (!geometry) throw new Error('村道路面合并失败');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.userData.noMerge = true;
    scene.add(mesh);
  }
}
