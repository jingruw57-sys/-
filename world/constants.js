// 文件职责：放大后的岛台尺寸、水位与开发期边界检查；对应指导书第 5、11 章及 M3 审查清单。
export const WATER_Y = -0.315;
export const ISLAND_R = 38;
export const SAFE_R = 35;

export function assertInside(name, x, z, radius = 0) {
  const extent = Math.hypot(x, z) + radius;
  if (extent > SAFE_R + 1e-4) {
    console.warn(`[布局越界] ${name}: ${extent.toFixed(2)} > SAFE_R ${SAFE_R}`);
    return false;
  }
  return true;
}
