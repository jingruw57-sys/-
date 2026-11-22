// 文件职责：E 键交互点（鱼市 / 鸟居 / 灯塔）、海玻璃收集、提示条与吐司；对应扩展需求「让地图有事可做」。
import * as THREE from 'three';

const CATCH = ['青花鱼', '真鲷', '竹荚鱼', '沙丁鱼', '鲈鱼', '鱿鱼', '海鳗', '石斑鱼'];

// 12 个海玻璃散落点，已避开房屋、栈桥与鸟居，全部落在安全半径 35 内。
const GLASS_SPOTS = [
  [-3, 5.5], [5.5, 5.85], [-14, 12], [14, 13], [0, 22], [-20, 25],
  [19, 20], [25, 15], [-26, 14], [6, -1.2], [-8, -0.8], [30, 5],
];
const GLASS_TOTAL = GLASS_SPOTS.length;

export function createInteractions(scene, player, { play, groundAt, lighthouseLens }) {
  const hint = document.querySelector('#interact-hint');
  const hintText = document.querySelector('#interact-hint .label');
  const toast = document.querySelector('#toast');
  const toastTitle = document.querySelector('#toast-title');
  const toastBody = document.querySelector('#toast-body');
  const counter = document.querySelector('#collect-count');
  const useButton = document.querySelector('#use-btn');

  // ---------- 吐司 ----------
  let toastLeft = 0;
  function showToast(title, body, ms = 2800) {
    toastTitle.textContent = title;
    toastBody.textContent = body;
    toast.classList.add('show');
    toastLeft = ms / 1000;
  }

  // ---------- 交互标记 ----------
  const points = [];
  const markerGeo = new THREE.SphereGeometry(0.17, 10, 8);
  const markerMat = new THREE.MeshBasicMaterial({
    color: '#FFE9A8', transparent: true, opacity: 0.88, depthWrite: false, toneMapped: false,
  });

  function addPoint({ x, z, radius, label, action }) {
    const y = groundAt(x, z);
    const pos = new THREE.Vector3(x, y, z);
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(x, y + 1.0, z);
    marker.visible = false;
    marker.renderOrder = 3;
    marker.userData.noMerge = true;
    scene.add(marker);
    points.push({
      pos, radius, label, action, marker,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // 光束以灯塔灯室为轴，点亮后扫过海面。
  const beacon = new THREE.Group();
  beacon.position.copy(lighthouseLens);
  beacon.visible = false;
  scene.add(beacon);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 0.31, 20, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#FFE9B8', transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    })
  );
  beam.position.set(10.15, -2.77, 0);
  beam.rotation.z = -Math.PI / 2 - 0.28;
  beam.renderOrder = 3;
  beacon.add(beam);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.73, 0.73, 0.63, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#FFDF92', transparent: true, depthWrite: false, toneMapped: false,
    }),
  );
  beacon.add(glow);

  let beaconLeft = 0;

  addPoint({
    x: -1.25, z: 7.7, radius: 2.0, label: '查看今日鱼获',
    action: () => {
      const pool = [...CATCH];
      const pick = Array.from({ length: 3 }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      showToast('鱼市棚 · 今日鱼获', pick.map((n, i) => `${i + 1}. ${n}`).join('　'));
      play('fish');
    },
  });

  addPoint({
    x: 19, z: 21.7, radius: 2.6, label: '摇铃祈愿',
    action: () => {
      play('bell');
      showToast('鸟居', '铃声响过，海风安静了一瞬。');
    },
  });

  addPoint({
    x: 9, z: -1.2, radius: 2.6, label: '点亮灯塔',
    action: () => {
      if (beaconLeft <= 0) {
        beacon.rotation.y = Math.atan2(lighthouseLens.z - playerPos.z, playerPos.x - lighthouseLens.x);
      }
      beaconLeft = 7;
      play('beacon');
      showToast('石码头', '灯塔亮了，光柱扫过水面。');
    },
  });

  // ---------- 海玻璃（单个 InstancedMesh，只占 1 个 Draw Call）----------
  const glassMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.24, 0),
    new THREE.MeshBasicMaterial({ color: '#7FE8CE', toneMapped: false }),
    GLASS_TOTAL
  );
  glassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glassMesh.frustumCulled = false;
  glassMesh.userData.noMerge = true;
  scene.add(glassMesh);

  const dummy = new THREE.Object3D();
  const glass = GLASS_SPOTS.map(([x, z]) => ({ x, z, y: groundAt(x, z) + 0.38, taken: false }));
  let collected = 0;
  let glassTime = 0;

  function refreshCounter() {
    counter.textContent = `海玻璃 ${collected} / ${GLASS_TOTAL}`;
  }
  refreshCounter();

  // ---------- 每帧 ----------
  const playerPos = new THREE.Vector3();
  let activePoint = null;

  function update(delta, walking, allowUse) {
    playerPos.copy(player.position);

    if (toastLeft > 0) {
      toastLeft -= delta;
      if (toastLeft <= 0) toast.classList.remove('show');
    }

    let best = null;
    let bestDist = Infinity;
    for (const point of points) {
      const dist = Math.hypot(playerPos.x - point.pos.x, playerPos.z - point.pos.z);
      const near = walking && dist < 10;
      point.marker.visible = near;
      if (near) {
        point.phase += delta * 1.6;
        point.marker.position.y = point.pos.y + 1.0 + Math.sin(point.phase) * 0.12;
        point.marker.scale.setScalar(1 + Math.sin(point.phase * 1.4) * 0.15);
      }
      if (near && allowUse && dist < point.radius && dist < bestDist) {
        bestDist = dist;
        best = point;
      }
    }

    if (best !== activePoint) {
      activePoint = best;
      useButton.hidden = !best;
      if (best) {
        hintText.textContent = best.label;
        hint.classList.add('show');
        hint.setAttribute('aria-hidden', 'false');
      } else {
        hint.classList.remove('show');
        hint.setAttribute('aria-hidden', 'true');
      }
    }

    beaconLeft = Math.max(0, beaconLeft - delta);
    beacon.visible = beaconLeft > 0;
    if (beacon.visible) {
      const fade = Math.min(1, beaconLeft / 1.2);
      beam.material.opacity = 0.24 * fade;
      glow.material.opacity = 0.86 * fade;
      beacon.rotation.y += delta * 0.9;
    }

    glassTime += delta;
    let visibleCount = 0;
    for (const [i, piece] of glass.entries()) {
      if (piece.taken) continue;
      const { x, y, z } = piece;
      if (walking && Math.hypot(playerPos.x - x, playerPos.z - z) < 1.3) {
        piece.taken = true;
        collected += 1;
        refreshCounter();
        play('pick');
        if (collected === GLASS_TOTAL) {
          showToast('海玻璃集齐', '整片海岸的碎片都收齐了。', 4200);
        }
        continue;
      }
      dummy.position.set(x, y + Math.sin(glassTime * 1.8 + i * 1.3) * 0.08, z);
      dummy.rotation.set(glassTime * 0.6 + i, glassTime * 0.9 + i * 0.6, 0);
      dummy.updateMatrix();
      glassMesh.setMatrixAt(visibleCount, dummy.matrix);
      visibleCount += 1;
    }
    glassMesh.count = visibleCount;
    glassMesh.instanceMatrix.needsUpdate = true;
  }

  function use() {
    if (!activePoint) return false;
    activePoint.action();
    return true;
  }

  return { update, use };
}
