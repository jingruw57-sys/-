// 文件职责：可收起的俯视地图，显示村道、建筑、码头和玩家朝向；游戏地图扩展。
import { ISLAND_R } from '../world/constants.js';
import { shoreZ, WATER_COLORS } from '../world/water.js?v=map-9';
import { HOUSE_LAYOUT, HOUSE_STYLE } from '../world/houses.js?v=map-8';
import { TREE_LAYOUT } from '../world/props.js';
import { ROUTES } from '../world/routes.js?v=map-4';
import { BEACH, BEACH_WATERLINE_RADIUS } from '../world/beach.js';

const SIZE = 220;
const SCALE = 2.48;
const toX = (x) => SIZE / 2 + x * SCALE;
const toY = (z) => SIZE / 2 - z * SCALE;

function drawStatic(ctx) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(110, 110, ISLAND_R * SCALE, 0, Math.PI * 2);
  ctx.clip();
  const waterFill = ctx.createLinearGradient(0, toY(-2), 0, toY(-26));
  waterFill.addColorStop(0, WATER_COLORS.shallow);
  waterFill.addColorStop(4.5 / 24, WATER_COLORS.mid);
  waterFill.addColorStop(12 / 24, WATER_COLORS.deep);
  waterFill.addColorStop(1, WATER_COLORS.abyss);
  ctx.fillStyle = waterFill;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.beginPath();
  ctx.moveTo(toX(-38), toY(shoreZ(-38)));
  for (let x = -37; x <= 38; x += 1) ctx.lineTo(toX(x), toY(shoreZ(x)));
  ctx.lineTo(toX(38), toY(38));
  ctx.lineTo(toX(-38), toY(38));
  ctx.closePath();
  ctx.fillStyle = '#8CC65A';
  ctx.fill();
  ctx.fillStyle = BEACH.sandColor;
  ctx.beginPath();
  ctx.arc(toX(BEACH.x), toY(BEACH.z), BEACH_WATERLINE_RADIUS * SCALE, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#B07848';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const route of ROUTES) {
    ctx.beginPath();
    route.forEach(([x, z], index) => index ? ctx.lineTo(toX(x), toY(z)) : ctx.moveTo(toX(x), toY(z)));
    ctx.stroke();
  }
  ctx.strokeStyle = '#F2D9A0';
  ctx.lineWidth = 5;
  for (const route of ROUTES) {
    ctx.beginPath();
    route.forEach(([x, z], index) => index ? ctx.lineTo(toX(x), toY(z)) : ctx.moveTo(toX(x), toY(z)));
    ctx.stroke();
  }
  ctx.strokeStyle = '#C9C2B4';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(toX(-20), toY(-2)); ctx.lineTo(toX(20), toY(-2)); ctx.stroke();
  ctx.strokeStyle = '#6B4530';
  ctx.lineWidth = 5;
  for (const x of [-13, 0, 13]) {
    ctx.beginPath(); ctx.moveTo(toX(x), toY(-2)); ctx.lineTo(toX(x), toY(-9.7)); ctx.stroke();
  }
  HOUSE_LAYOUT.forEach(([x, z, w, d, color], index) => {
    ctx.fillStyle = ['#D9574A', '#4A7FB5', '#709A8D'][color];
    const box = [toX(x) - w * SCALE / 2, toY(z) - d * SCALE / 2, w * SCALE, d * SCALE];
    ctx.fillRect(...box);
    if (HOUSE_STYLE[index].interior) {
      ctx.strokeStyle = '#FFF8EC';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(...box);
    }
  });
  ctx.fillStyle = '#4E8A4A';
  for (const [x, z] of TREE_LAYOUT) {
    ctx.beginPath(); ctx.arc(toX(x), toY(z), 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#2B2A3A';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('渔港', toX(0), toY(-16));
  ctx.fillText('鱼市', toX(3), toY(7));
  ctx.fillText('鸟居', toX(19), toY(22));
  ctx.fillText('沙滩', toX(BEACH.x), toY(BEACH.z - 2));
  ctx.restore();
  ctx.strokeStyle = '#2B2A3A';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(110, 110, ISLAND_R * SCALE, 0, Math.PI * 2); ctx.stroke();
}

export function createMinimap(player) {
  const canvas = document.querySelector('#minimap');
  const ctx = canvas.getContext('2d');
  const panel = document.querySelector('#minimap-panel');
  const button = document.querySelector('#map-toggle');
  const staticCanvas = document.createElement('canvas');
  staticCanvas.width = staticCanvas.height = SIZE;
  drawStatic(staticCanvas.getContext('2d'));
  let visible = false;
  let elapsed = 0;
  function setVisible(value) {
    visible = value;
    panel.hidden = !value;
    button.setAttribute('aria-expanded', String(value));
    button.textContent = value ? '收起地图' : '地图';
    if (value) draw();
  }
  function draw() {
    ctx.drawImage(staticCanvas, 0, 0);
    const x = toX(player.position.x);
    const y = toY(player.position.z);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#2B2A3A';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const angle = player.rotation.y;
    ctx.strokeStyle = '#D9574A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.sin(angle) * 13, y + Math.cos(angle) * 13);
    ctx.stroke();
  }
  button.addEventListener('click', () => setVisible(!visible));
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && !event.repeat) setVisible(!visible);
  });
  setVisible(false);
  return {
    update(delta) {
      if (!visible) return;
      elapsed += delta;
      if (elapsed >= 0.1) { elapsed = 0; draw(); }
    },
  };
}
