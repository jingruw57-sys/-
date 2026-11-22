// 三视图参考的鲸尾角色。几何、格纹与面部细节均在本地生成。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeToonMaterial, addOutline } from '../toon/materials.js';
import { mergeToonMeshes } from '../world/merge.js?v=map-7';

// 配色取自三视图：头发深蓝到浅紫蓝的渐变、米白粗针织、深蓝格纹与鳍膜浅蓝。
const color = {
  hair: '#3D4B9E', hairDark: '#2B3570', hairLight: '#5A6DBF', hairTip: '#8295D7',
  blue: '#2B3268', sole: '#20264F', fin: '#6D87D3', finLight: '#D2E0FA',
  ear: '#3D5FA0', earLight: '#D0DFFF', tailTip: '#6E7CC6',
  yarn: '#F7ECDF', stitch: '#EEDFCC', cuff: '#EBDACA',
  cap: '#F5F0E8', capCable: '#EBE4D9', capRib: '#E9DFD1', pom: '#FFF9F5',
  face: '#FFE3D8', white: '#FFFAF4', paper: '#FFFFFF', outline: '#1E2440',
  eye: '#25203F', sclera: '#FFFDFF', pupil: '#181C45', eyeRise: '#241E3A',
  iris: ['#1E2050', '#2E4595', '#5E9AD8', '#9ADDFB'], eyeBounce: '#8FD2F5',
  blush: ['#EC8D9F54', '#EC8D9F2E', '#EC8D9F00'],
  nose: '#E0A794', mouth: '#C4767F', brow: '#E5B9AE',
  plaid: '#1E2B5A', plaidBand: '#8597CB51', plaidLine: '#BCCAF173',
};
const ball = new THREE.SphereGeometry(1, 24, 16);
const smallBall = new THREE.SphereGeometry(1, 10, 7);
const outlineMaterial = new THREE.MeshBasicMaterial({
  color: color.outline, side: THREE.BackSide, toneMapped: false,
});

// 角色的哑光色阶沿用 Lambert 管线，避免全场雨景的亮边和湿润反光落在针织与头发上。
function useCharacterLighting(material) {
  material.toneMapped = false;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>', `
      vec3 key = normalize(vec3(-0.18, 0.48, 0.86));
      #if NUM_DIR_LIGHTS > 0
        key = normalize(key + 0.22 * directionalLights[0].direction);
      #endif
      float tone = smoothstep(0.15, 0.25, dot(normalize(normal), key));
      reflectedLight.directDiffuse = diffuseColor.rgb * mix(vec3(0.68, 0.69, 0.84), vec3(1.0), tone);
    `).replace('#include <lights_fragment_maps>', '').replace('#include <lights_fragment_end>', '');
  };
  material.customProgramCacheKey = () => 'whale-matte-cel';
  return material;
}

// 使用独立的缓存键，合批颜色仍由地图现有逻辑提供。
const characterMaterial = useCharacterLighting(makeToonMaterial(color.paper, {
  vertexColors: true, emissiveIntensity: 0,
}));

function addCharacterOutline(mesh) {
  const outline = addOutline(mesh);
  outline.material = outlineMaterial;
  const position = outline.geometry.attributes.position;
  const normal = outline.geometry.attributes.normal;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) + normal.getX(i) * 0.009,
      position.getY(i) + normal.getY(i) * 0.009, position.getZ(i) + normal.getZ(i) * 0.009);
  }
  position.needsUpdate = true;
  return outline;
}

function part(group, geometry, tint, x, y, z, outline = false) {
  const mesh = new THREE.Mesh(geometry, makeToonMaterial(tint));
  mesh.position.set(x, y, z);
  mesh.userData.contour = outline;
  group.add(mesh);
  return mesh;
}

function oval(group, tint, x, y, z, w, h, d, outline = false) {
  const geometry = Math.max(w, h, d) > 0.085 && Math.min(w, h, d) > 0.025 ? ball : smallBall;
  const mesh = part(group, geometry, tint, x, y, z, outline);
  mesh.scale.set(w, h, d);
  return mesh;
}

function cord(group, tint, points, thickness = 0.013) {
  const curve = new THREE.CatmullRomCurve3(points);
  part(group, new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), thickness, 5, false), tint, 0, 0, 0);
}

// 用带厚度的曲面塑造发束和鳍，每个控制点指定截面的宽度和厚度。
function lock(group, tint, sections, outline = false) {
  const curve = new THREE.CatmullRomCurve3(sections.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const positions = [], indices = [];
  const steps = 26, sides = 10;
  const across = new THREE.Vector3(), depth = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const knot = t * (sections.length - 1);
    const a = Math.min(Math.floor(knot), sections.length - 2);
    const width = THREE.MathUtils.lerp(sections[a][3], sections[a + 1][3], knot - a);
    const thick = THREE.MathUtils.lerp(sections[a][4], sections[a + 1][4], knot - a);
    const origin = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    across.set(tangent.y, -tangent.x, 0);
    if (across.lengthSq() < 0.001) across.set(1, 0, 0).addScaledVector(tangent, -tangent.x);
    across.normalize();
    depth.crossVectors(tangent, across).normalize();
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const point = origin.clone().addScaledVector(across, Math.cos(angle) * width)
        .addScaledVector(depth, Math.sin(angle) * thick);
      positions.push(point.x, point.y, point.z);
      if (i === steps) continue;
      const here = i * sides + j;
      const next = i * sides + (j + 1) % sides;
      indices.push(here, next, here + sides, next, next + sides, here + sides);
    }
  }
  const end = steps * sides;
  for (let j = 1; j < sides - 1; j++) {
    indices.push(0, j + 1, j, end, end + j, end + j + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return part(group, geometry, tint, 0, 0, 0, outline);
}

// 每个可动画部位分别合并。细线和针织纹保留自己的颜色，只有主要体块描边。
function bake(group) {
  const contour = group.children.filter((mesh) => mesh.userData.contour).map((mesh) => {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position') geometry.deleteAttribute(name);
    }
    return geometry.applyMatrix4(mesh.matrix);
  });
  mergeToonMeshes(group, { outlines: false, bakeColors: true });
  // 细小的叠层容易出现锯齿状的自投影，保留角色落在地面上的影子。
  for (const mesh of group.children) {
    mesh.receiveShadow = false;
    if (mesh.material.userData.isToon) mesh.material = characterMaterial;
  }
  if (!contour.length) return;
  const geometry = mergeGeometries(contour);
  group.add(addCharacterOutline(new THREE.Mesh(geometry)));
  for (const piece of contour) piece.dispose();
  geometry.dispose();
}

function texture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'));
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 8;
  return result;
}

// 虹膜上深下浅，外眼角的睫毛向上收。
function faceTexture() {
  return texture(512, (ctx) => {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(256 + side * 105, 253);
      ctx.scale(side, 1.12);

      const eye = new Path2D();
      eye.moveTo(-60, -9);
      eye.bezierCurveTo(-43, -62, 31, -61, 58, -16);
      eye.bezierCurveTo(62, 25, 38, 61, 2, 61);
      eye.bezierCurveTo(-32, 61, -57, 35, -60, -9);
      ctx.fillStyle = color.sclera;
      ctx.fill(eye);

      ctx.save();
      ctx.clip(eye);
      ctx.beginPath();
      ctx.ellipse(0, 8, 41, 55, 0, 0, Math.PI * 2);
      const iris = ctx.createLinearGradient(0, -44, 0, 60);
      for (const [i, stop] of [0, 0.40, 0.76, 1].entries()) iris.addColorStop(stop, color.iris[i]);
      ctx.fillStyle = iris;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, -6, 16, 29, 0, 0, Math.PI * 2);
      ctx.fillStyle = color.pupil;
      ctx.fill();
      // 瞳孔下方留一条浅蓝反光，是设定图里最显眼的一笔。
      ctx.beginPath();
      ctx.ellipse(0, 45, 27, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = color.eyeBounce;
      ctx.fill();
      for (const [dx, dy, rx, ry] of [[-12 * side, -29, 11, 13], [19 * side, 24, 5, 6]]) {
        ctx.beginPath();
        ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = color.paper;
        ctx.fill();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-60, -10);
      ctx.bezierCurveTo(-43, -62, 33, -61, 59, -16);
      ctx.quadraticCurveTo(66, -20, 72, -31);
      ctx.strokeStyle = color.eyeRise;
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(47, 36);
      ctx.quadraticCurveTo(55, 27, 56, 16);
      ctx.strokeStyle = color.eye;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-31, -63);
      ctx.quadraticCurveTo(-4, -73, 22, -65);
      ctx.strokeStyle = color.brow;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(252, 345);
    ctx.quadraticCurveTo(257, 350, 263, 345);
    ctx.strokeStyle = color.nose;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(245, 403);
    ctx.quadraticCurveTo(256, 408, 267, 403);
    ctx.strokeStyle = color.mouth;
    ctx.lineWidth = 5;
    ctx.stroke();
  });
}

function blushTexture() {
  return texture(256, (ctx) => {
    for (const side of [-1, 1]) {
      const x = 128 + side * 59;
      const gradient = ctx.createRadialGradient(x, 174, 0, x, 174, 23);
      for (const [i, stop] of [0, 0.5, 1].entries()) gradient.addColorStop(stop, color.blush[i]);
      ctx.fillStyle = gradient;
      ctx.fillRect(x - 23, 151, 46, 46);
    }
  });
}

const FACE = { y: 1.770, z: -0.075, rx: 0.414, ry: 0.384, rz: 0.361 };

function addFace(head) {
  const { y, z, rx, ry, rz } = FACE;
  oval(head, color.face, 0, y, z, rx, ry, rz, true);
  // 按椭球经线绕过脸颊。球面与贴图共用轴半径，留薄间隙压住肤色网格。
  const geometry = new THREE.PlaneGeometry(1, 0.52, 36, 26);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const lift = 0.011;
  for (let i = 0; i < pos.count; i++) {
    const height = pos.getY(i);
    const radius = Math.sqrt(1 - (height / ry) ** 2);
    const angle = (uv.getX(i) - 0.5) * 2.72;
    pos.setXYZ(i, (rx + lift) * radius * Math.sin(angle), y + height,
      z - (rz + lift) * radius * Math.cos(angle));
  }
  const indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  geometry.index.needsUpdate = true;
  const decal = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: faceTexture(), alphaTest: 0.35, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  decal.userData.noMerge = true;
  head.add(decal);
  // 腮红单独做半透明叠色，保留柔边，同时眼线可使用较高的裁切阈值。
  const blush = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: blushTexture(), transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  blush.userData.noMerge = true;
  head.add(blush);
}

// 米白粗针织毛线帽：帽口停在眉线以上，帽顶蓬起而不是压扁的盘子；
// 帽沿做一圈粗卷边，帽面沿经线排满麻花辫，背面帽口压得更低以盖住后脑。
function addCap(head) {
  const centerY = 1.890;
  const centerZ = 0.155;
  const A = 0.536;   // 左右半径
  const B = 0.524;   // 上下半径
  function capPoint(angle, fraction, relief = 0) {
    const rear = (1 - Math.cos(angle)) / 2;
    const t = Math.min(1.015, Math.max(0, fraction));
    const theta = (0.93 + 0.78 * rear + 0.055 * Math.sin(angle)) * t;
    const depth = 0.43 + 0.06 * rear;
    // 中间鼓、两端收，做出针织帽的蓬松轮廓。
    const swell = 0.026 * Math.sin(Math.PI * t);
    const s = Math.sin(theta);
    return new THREE.Vector3(
      (A + swell + relief) * s * Math.sin(angle),
      centerY + (B + swell + relief) * Math.cos(theta),
      centerZ - (depth + swell * 0.8 + relief) * s * Math.cos(angle),
    );
  }
  const cap = new THREE.PlaneGeometry(1, 1, 64, 20);
  const pos = cap.attributes.position;
  const uv = cap.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const point = capPoint(uv.getX(i) * Math.PI * 2, Math.max(0.002, uv.getY(i)));
    pos.setXYZ(i, point.x, point.y, point.z);
  }
  cap.computeVertexNormals();
  part(head, cap, color.cap, 0, 0, 0);

  // 帽口卷边：粗管走一整圈，帽沿有厚度，不再是悬空的一条线。
  for (const [fraction, radius, tint] of [[1, 0.034, color.capRib], [0.89, 0.022, color.cap]]) {
    const points = Array.from({ length: 37 }, (_, i) =>
      capPoint((i / 36) * Math.PI * 2, fraction, radius * 0.76));
    cord(head, tint, points, radius);
  }
  // 八组低对比度的粗麻花织纹。
  const cables = 8;
  for (let i = 0; i < cables; i++) {
    const angle = (i / cables) * Math.PI * 2;
    for (const phase of [-1, 1]) {
      const points = Array.from({ length: 15 }, (_, j) => {
        const fraction = 0.24 + (j / 14) * 0.59;
        const twist = (j / 14) * 13.1;
        const wobble = phase * 0.044 * Math.sin(twist);
        return capPoint(angle + wobble, fraction, 0.019 + phase * 0.007 * Math.cos(twist));
      });
      cord(head, phase === 1 ? color.cap : color.capCable, points, 0.017);
    }
  }
  oval(head, color.pom, 0.122, centerY + B + 0.006, centerZ + 0.029,
    0.084, 0.077, 0.077);
}

function addBow(group, x, y, z, size, tint = color.blue) {
  for (const side of [-1, 1]) {
    oval(group, tint, x + side * size * 0.56, y + size * 0.19, z, size * 0.63, size * 0.34, size * 0.25).rotation.z = side * 0.27;
    oval(group, tint, x + side * size * 0.34, y - size * 0.38, z, size * 0.22, size * 0.46, size * 0.16).rotation.z = side * 0.38;
  }
  oval(group, tint, x, y, z - size * 0.1, size * 0.26, size * 0.31, size * 0.25);
}

function addWhale(group, x, y, z, size, tint = color.hair) {
  oval(group, tint, x, y, z, size, size * 0.59, size * 0.29);
  oval(group, color.white, x - size * 0.14, y - size * 0.23, z - size * 0.18, size * 0.77, size * 0.31, size * 0.17);
  for (const side of [-1, 1]) {
    oval(group, tint, x + size * (1.08 + side * 0.19), y + size * 0.13, z, size * 0.45, size * 0.21, size * 0.14).rotation.z = side * 0.57;
  }
  oval(group, color.eye, x - size * 0.52, y + size * 0.11, z - size * 0.25, size * 0.11, size * 0.11, size * 0.08);
}

// 三束短刘海沿发际分开，碎发垂在眼角外侧。
function addBangs(head) {
  lock(head, color.hairLight, [[0.008, 2.235, -0.201, 0.047, 0.035],
    [-0.024, 2.120, -0.322, 0.073, 0.053], [-0.039, 2.010, -0.380, 0.049, 0.037],
    [-0.016, 1.952, -0.411, 0.028, 0.023], [0.006, 1.932, -0.405, 0.012, 0.010]]);
  lock(head, color.hair, [[-0.076, 2.215, -0.192, 0.052, 0.043],
    [-0.159, 2.133, -0.311, 0.107, 0.061], [-0.235, 2.028, -0.346, 0.078, 0.045],
    [-0.256, 1.956, -0.341, 0.036, 0.027], [-0.231, 1.934, -0.342, 0.012, 0.010]]);
  lock(head, color.hair, [[0.082, 2.214, -0.194, 0.057, 0.045],
    [0.162, 2.115, -0.312, 0.107, 0.053], [0.245, 2.014, -0.347, 0.073, 0.044],
    [0.263, 1.950, -0.337, 0.032, 0.022], [0.235, 1.924, -0.335, 0.012, 0.010]]);
  for (const side of [-1, 1]) {
    lock(head, color.hairDark, [[side * 0.270, 2.074, -0.255, 0.043, 0.039],
      [side * 0.362, 1.943, -0.253, 0.046, 0.033], [side * 0.398, 1.773, -0.233, 0.028, 0.020],
      [side * 0.372, 1.674, -0.217, 0.012, 0.009]]);
  }
}

function addHead(figure) {
  const head = new THREE.Group();
  oval(head, color.hairDark, 0, 1.81, 0.107, 0.514, 0.411, 0.431, true);
  addFace(head);

  for (const side of [-1, 1]) {
    // 眼角外侧留空，鬓发从颧骨后方垂到下巴下再内扣。
    lock(head, color.hair, [[side * 0.146, 2.132, -0.180, 0.079, 0.061],
      [side * 0.332, 2.034, -0.205, 0.124, 0.074], [side * 0.450, 1.777, -0.158, 0.090, 0.061],
      [side * 0.453, 1.526, -0.126, 0.071, 0.052], [side * 0.411, 1.350, -0.139, 0.041, 0.035],
      [side * 0.343, 1.270, -0.192, 0.012, 0.011]]);
    // 鳍耳的浅色鳍膜沿下边缘展开，尖端收在同一处。
    lock(head, color.ear, [[side * 0.358, 1.800, -0.105, 0.068, 0.057],
      [side * 0.563, 1.739, -0.125, 0.091, 0.047], [side * 0.687, 1.685, -0.141, 0.071, 0.037],
      [side * 0.811, 1.653, -0.153, 0.012, 0.010]]);
    lock(head, color.earLight, [[side * 0.411, 1.747, -0.123, 0.042, 0.026],
      [side * 0.582, 1.676, -0.137, 0.054, 0.027], [side * 0.703, 1.636, -0.147, 0.042, 0.024],
      [side * 0.798, 1.648, -0.151, 0.013, 0.016]]);
  }

  addBangs(head);
  addCap(head);

  // 呆毛：细、长、带一点回卷。
  lock(head, color.hairDark, [[-0.030, 2.238, -0.174, 0.031, 0.023],
    [-0.100, 2.376, -0.158, 0.025, 0.018], [-0.048, 2.494, -0.178, 0.016, 0.012],
    [0.054, 2.478, -0.204, 0.010, 0.007]]);

  // 侧面的鲸鱼发夹与蝴蝶结。
  addWhale(head, -0.418, 2.002, -0.222, 0.058, color.blue);
  addBow(head, -0.462, 1.862, -0.244, 0.078);
  oval(head, color.white, -0.474, 1.768, -0.246, 0.046, 0.047, 0.042);
  bake(head);
  figure.add(head);
}

// 发束顺着肩背下垂，S 弯与不同高度的外翻发梢组成波浪轮廓。
function addLongHair(figure) {
  const hair = new THREE.Group();
  hair.position.set(0, 1.91, 0.20);

  lock(hair, color.hairDark, [[0, 0.23, 0.15, 0.17, 0.094],
    [0, 0.00, 0.18, 0.31, 0.106], [0, -0.37, 0.15, 0.285, 0.095],
    [0, -0.63, 0.123, 0.22, 0.084], [0, -0.77, 0.105, 0.035, 0.017]]);

  for (const side of [-1, 1]) {
    const stagger = side * 0.025;
    lock(hair, color.hair, [[side * 0.075, 0.147, 0.204, 0.109, 0.077],
      [side * 0.124, -0.191, 0.239, 0.129, 0.092], [side * 0.075, -0.435, 0.241, 0.114, 0.090],
      [side * 0.120, -0.681, 0.200, 0.108, 0.077], [side * 0.111, -0.882 + stagger, 0.179, 0.073, 0.050],
      [side * 0.187, -0.994 + stagger, 0.152, 0.045, 0.034],
      [side * 0.262, -0.929 + stagger, 0.131, 0.012, 0.010]]);
    lock(hair, color.hairLight, [[side * 0.232, 0.121, 0.183, 0.105, 0.072],
      [side * 0.276, -0.207, 0.216, 0.117, 0.081], [side * 0.226, -0.449, 0.213, 0.108, 0.078],
      [side * 0.283, -0.673, 0.177, 0.110, 0.085], [side * 0.279, -0.848 - stagger, 0.165, 0.084, 0.062],
      [side * 0.349, -0.957 - stagger, 0.111, 0.047, 0.037],
      [side * 0.435, -0.871 - stagger, 0.099, 0.012, 0.011]]);
    lock(hair, color.hair, [[side * 0.344, 0.155, 0.073, 0.093, 0.080],
      [side * 0.409, -0.168, 0.103, 0.117, 0.096], [side * 0.374, -0.394, 0.102, 0.120, 0.091],
      [side * 0.455, -0.610, 0.075, 0.096, 0.068], [side * 0.448, -0.790 + stagger, 0.048, 0.067, 0.056],
      [side * 0.492, -0.859 + stagger, 0.035, 0.045, 0.035],
      [side * 0.577, -0.782 + stagger, 0.028, 0.012, 0.010]], true);
    lock(hair, color.hairTip, [[side * 0.255, -0.553, 0.282, 0.011, 0.010],
      [side * 0.293, -0.699, 0.254, 0.030, 0.017], [side * 0.287, -0.826 - stagger, 0.220, 0.034, 0.019],
      [side * 0.341, -0.921 - stagger, 0.153, 0.025, 0.016],
      [side * 0.397, -0.912 - stagger, 0.140, 0.009, 0.009]]);
    // 前发从耳后绕肩，末段挨着胸侧内扣。
    lock(hair, color.hairLight, [[side * 0.420, -0.237, -0.205, 0.064, 0.044],
      [side * 0.459, -0.422, -0.239, 0.065, 0.044], [side * 0.426, -0.603, -0.296, 0.052, 0.038],
      [side * 0.373, -0.755, -0.337, 0.038, 0.027], [side * 0.321, -0.811, -0.360, 0.012, 0.010]]);
  }
  bake(hair);
  figure.add(hair);
  return hair;
}

function ribbedCuff(group, y, radius, depth, height) {
  const base = part(group, new THREE.CylinderGeometry(radius, radius, height, 24), color.yarn, 0, y, 0);
  base.scale.z = depth;
  for (let i = 0; i < 14; i++) {
    const angle = Math.PI * 2 * i / 14;
    const relief = radius + 0.010;
    const rib = oval(group, color.stitch, Math.cos(angle) * relief, y,
      Math.sin(angle) * relief * depth, 0.018, height * 0.41, 0.014);
    rib.rotation.y = Math.PI / 2 - angle;
  }
}

function addOutfit(figure) {
  const body = new THREE.Group();
  const profile = [[0, .843], [.30, .843], [.331, .907], [.337, 1.009], [.298, 1.151], [.243, 1.228], [.154, 1.266], [0, 1.27]];
  const sweater = part(body, new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 32), color.yarn, 0, 0, 0, true);
  sweater.scale.z = 0.76;
  ribbedCuff(body, 0.872, 0.322, 0.76, 0.090);
  // 高领比原来更厚，立起来包住脖子。
  ribbedCuff(body, 1.289, 0.170, 0.90, 0.158);
  oval(body, color.face, 0, 1.382, -0.049, 0.098, 0.077, 0.086);

  // 粗针织竖罗纹：绕躯干排一圈，正面不再是光板。
  const radiusAt = (y) => {
    for (let i = 1; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i];
      const [r1, y1] = profile[i + 1];
      if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
    }
    return profile[1][0];
  };
  function sweaterFront(x, y) {
    const r = radiusAt(y);
    return -0.76 * Math.sqrt(Math.max(0, r * r - x * x));
  }
  for (let k = 0; k < 10; k++) {
    const angle = ((k + 0.3) / 10) * Math.PI * 2;
    const points = Array.from({ length: 7 }, (_, j) => {
      const y = 0.900 + (j / 6) * 0.316;
      const r = radiusAt(y) + 0.012;
      return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r * 0.76);
    });
    cord(body, color.stitch, points, 0.012);
  }

  for (const side of [-1, 1]) {
    const points = Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      const x = side * (0.162 + 0.067 * Math.sin(t * 1.52));
      const y = 0.932 + t * 0.253;
      return new THREE.Vector3(x, y, sweaterFront(x, y) - 0.010);
    });
    cord(body, color.cuff, points, 0.012);
  }

  // 胸前的鲸鱼图案放大到设定图的比例。
  addWhale(body, -0.027, 1.103, -0.251, 0.130);
  for (const side of [-1, 1]) {
    oval(body, color.hairLight, side * 0.026 - 0.027, 1.193 + (side + 1) * 0.008, -0.218, 0.014, 0.024, 0.012).rotation.z = side * 0.38;
  }

  // 斜挎包：肩带从右肩落到左胯，鲸鱼包挂在身前。
  cord(body, color.blue, [
    new THREE.Vector3(0.068, 1.322, -0.141), new THREE.Vector3(0.192, 1.189, -0.167),
    new THREE.Vector3(0.226, 1.003, -0.206), new THREE.Vector3(0.243, 0.928, -0.221),
  ], 0.019);
  addWhale(body, 0.254, 0.895, -0.228, 0.082, color.blue);
  oval(body, color.white, 0.231, 0.951, -0.255, 0.029, 0.030, 0.024);
  addBow(body, -0.22, 0.846, -0.196, 0.070, color.white);
  bake(body);
  figure.add(body);

  const plaid = texture(256, (ctx) => {
    ctx.fillStyle = color.plaid;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 128) {
      ctx.fillStyle = color.plaidBand;
      ctx.fillRect(i + 20, 0, 25, 256);
      ctx.fillRect(0, i + 32, 256, 23);
      ctx.fillStyle = color.plaidLine;
      ctx.fillRect(i + 58, 0, 6, 256);
      ctx.fillRect(0, i + 65, 256, 6);
    }
  });
  plaid.wrapS = THREE.RepeatWrapping;
  plaid.repeat.x = 2;
  // 百褶裙：褶数减少、褶量加大，正面能看出一道道清晰的折痕。
  const skirtGeometry = new THREE.CylinderGeometry(0.275, 0.394, 0.276, 72, 5);
  const pos = skirtGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const angle = Math.atan2(pos.getX(i), pos.getZ(i));
    const down = 0.5 - pos.getY(i) / 0.276;
    const fold = 1 + 0.105 * down * Math.sin(12 * angle)
      - 0.038 * THREE.MathUtils.smoothstep(down, 0.76, 1);
    pos.setX(i, pos.getX(i) * fold);
    pos.setZ(i, pos.getZ(i) * fold * 0.80);
  }
  const folds = skirtGeometry.toNonIndexed();
  skirtGeometry.dispose();
  folds.computeVertexNormals();
  const skirt = new THREE.Mesh(folds, useCharacterLighting(new THREE.MeshLambertMaterial({ map: plaid })));
  skirt.position.y = 0.740;
  skirt.userData.noMerge = true;
  skirt.castShadow = true;
  figure.add(skirt);
  addCharacterOutline(skirt);
}

function addTail(figure) {
  const tail = new THREE.Group();
  tail.position.set(0, 0.68, 0.18);
  const shaft = lock(tail, color.fin, [[0, 0.023, 0.011, 0.119, 0.113],
    [-0.092, -0.123, 0.216, 0.114, 0.102], [-0.267, -0.230, 0.389, 0.106, 0.087],
    [-0.445, -0.289, 0.549, 0.078, 0.057], [-0.604, -0.251, 0.659, 0.044, 0.039]], true);
  lock(tail, color.finLight, [[-0.079, -0.201, 0.212, 0.033, 0.060],
    [-0.253, -0.311, 0.373, 0.029, 0.062], [-0.434, -0.349, 0.537, 0.023, 0.038],
    [-0.584, -0.285, 0.647, 0.012, 0.019]]);
  lock(tail, color.tailTip, [[-0.577, -0.258, 0.649, 0.048, 0.031],
    [-0.710, -0.298, 0.635, 0.087, 0.040], [-0.821, -0.268, 0.614, 0.069, 0.032],
    [-0.905, -0.200, 0.591, 0.010, 0.011]], true);
  lock(tail, color.tailTip, [[-0.589, -0.250, 0.656, 0.041, 0.037],
    [-0.654, -0.162, 0.712, 0.075, 0.040], [-0.671, -0.071, 0.733, 0.058, 0.034],
    [-0.649, 0.030, 0.755, 0.011, 0.010]], true);

  // 斑点沿着尾柄曲面排布，随摆尾一起移动。
  shaft.updateMatrixWorld(true);
  const down = new THREE.Vector3(0, -1, 0);
  const out = new THREE.Vector3(0, 0, 1);
  const ray = new THREE.Raycaster(new THREE.Vector3(), down);
  for (const [x, z, radius] of [[-0.175, 0.340, 0.025], [-0.248, 0.402, 0.021], [-0.302, 0.441, 0.024]]) {
    ray.ray.origin.set(x, 0.2, z);
    const [hit] = ray.intersectObject(shaft, false);
    if (!hit) continue;
    const dot = oval(tail, color.finLight, x, hit.point.y + 0.004, z, radius, radius, 0.009);
    dot.quaternion.setFromUnitVectors(out, hit.normal);
  }
  bake(tail);
  figure.add(tail);
  return tail;
}

export function createWhaleCharacter(figure) {
  addOutfit(figure);
  const tail = addTail(figure);
  const hair = addLongHair(figure);
  addHead(figure);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.143, 0.661, 0.008);
    oval(leg, color.face, 0, -0.148, 0, 0.105, 0.173, 0.095);
    oval(leg, color.yarn, 0, -0.387, 0, 0.111, 0.164, 0.097, true);
    ribbedCuff(leg, -0.280, 0.110, 0.92, 0.054);
    for (const x of [-0.040, 0.042]) {
      const points = Array.from({ length: 7 }, (_, i) => {
        const y = -0.307 - i * 0.028;
        const z = -0.097 * Math.sqrt(1 - (x / 0.111) ** 2 - ((y + 0.387) / 0.164) ** 2);
        return new THREE.Vector3(x + Math.sin(i * 1.1) * 0.006, y, z - 0.011);
      });
      cord(leg, color.stitch, points, 0.012);
    }
    oval(leg, color.blue, 0, -0.563, -0.055, 0.122, 0.095, 0.164, true);
    oval(leg, color.sole, 0, -0.641, -0.055, 0.118, 0.022, 0.157);
    // 玛丽珍鞋的横向搭带与扣子，脚背不再是一个光球。
    oval(leg, color.hairDark, 0, -0.512, -0.117, 0.107, 0.018, 0.040);
    oval(leg, color.white, side * 0.071, -0.506, -0.155, 0.018, 0.013, 0.011);
    oval(leg, color.white, 0, -0.571, -0.221, 0.026, 0.015, 0.009);
    addBow(leg, side * 0.064, -0.33, -0.108, 0.056);
    bake(leg);
    figure.add(leg);
    legs.push(leg);

    const arm = new THREE.Group();
    arm.position.set(side * 0.270, 1.190, 0.018);
    arm.rotation.z = side * 0.20;
    oval(arm, color.yarn, side * 0.020, -0.214, 0, 0.124, 0.278, 0.136, true);
    ribbedCuff(arm, -0.443, 0.112, 0.90, 0.090);
    // 三个圆润指尖和拇指一起合批，袖口下只露一小段轮廓。
    oval(arm, color.face, 0, -0.493, 0, 0.069, 0.046, 0.062);
    oval(arm, color.face, -side * 0.048, -0.512, -0.034, 0.029, 0.031, 0.027).rotation.z = side * 0.5;
    for (const [finger, y, height] of [[-1, -0.518, 0.029], [0, -0.521, 0.033], [1, -0.517, 0.027]]) {
      oval(arm, color.face, side * finger * 0.031, y, -0.029, 0.020, height, 0.031);
    }
    const sleeveRib = Array.from({ length: 10 }, (_, i) => {
      const y = -0.043 - i * 0.038;
      const x = side * 0.020 + 0.019 * Math.sin(i * 0.68);
      const z = -0.136 * Math.sqrt(1 - ((x - side * 0.020) / 0.124) ** 2 - ((y + 0.214) / 0.278) ** 2);
      return new THREE.Vector3(x, y, z - 0.011);
    });
    cord(arm, color.stitch, sleeveRib, 0.014);
    addBow(arm, side * 0.053, -0.357, -0.119, 0.052);
    bake(arm);
    figure.add(arm);
    arms.push(arm);
  }
  return { arms, legs, hair, tail };
}
