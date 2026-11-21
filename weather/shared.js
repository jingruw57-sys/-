// 文件职责：天气 shader 共用 uniform 引用；对应指导书第 2、6 章。
import { sharedUniforms } from '../toon/materials.js';

export function createWeatherUniforms(state) {
  sharedUniforms.uWetness.value = state.wetness;
  return {
    uTime: { value: 0 },
    uRainDensity: { value: state.rain },
    uSunDir: { value: state.sunDir },
    uSunColor: { value: state.sunColor },
    uWetness: sharedUniforms.uWetness,
    uWindAngle: { value: state.windAngle },
    uWindStrength: { value: state.windStrength },
  };
}
