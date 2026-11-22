// 文件职责：按材质合并静态几何体、降低 Draw Call；对应指导书第 5.2、9 章与 M3 审查 P2。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addOutline, makeToonMaterial } from '../toon/materials.js';

function isDynamic(mesh, root) {
  for (let parent = mesh; parent && parent !== root; parent = parent.parent) {
    if (parent.userData.dynamic) return true;
  }
  return false;
}

function normalizedGeometry(source, transform) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
  }
  geometry.applyMatrix4(transform);
  return geometry;
}

// root 可以是整个静态场景，也可以是一艘会整体运动的船。
export function mergeToonMeshes(root, { skipDynamic = false, outlines = true, bakeColors = false } = {}) {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const colorMaterial = bakeColors ? makeToonMaterial('#FFFFFF', { vertexColors: true }) : null;
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.material?.userData?.isToon) return;
    if (mesh.userData.noMerge || (skipDynamic && isDynamic(mesh, root))) return;
    if (mesh.name.endsWith('-outline')) return;
    const transform = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const geometry = normalizedGeometry(mesh.geometry, transform);
    let material = mesh.material;
    if (colorMaterial && material.side === THREE.FrontSide && material.emissive.getHex() === 0) {
      const { r, g, b } = material.color;
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = r;
        colors[i + 1] = g;
        colors[i + 2] = b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      material = colorMaterial;
    }
    const bucket = buckets.get(material) || [];
    bucket.push({ mesh, geometry });
    buckets.set(material, bucket);
  });
  for (const [material, items] of buckets) {
    const mergedGeometry = mergeGeometries(items.map((item) => item.geometry), false);
    items.forEach(({ mesh, geometry }) => {
      mesh.parent.remove(mesh);
      geometry.dispose();
    });
    if (!mergedGeometry) throw new Error('静态几何体合并失败');
    const merged = new THREE.Mesh(mergedGeometry, material);
    merged.castShadow = true;
    merged.receiveShadow = true;
    root.add(merged);
    if (outlines) addOutline(merged);
  }
}
