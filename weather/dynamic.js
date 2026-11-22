// 每隔一段时间换一档雨量，用指数插值同步雨、湿润度和风力。
export function createDynamicWeather(state, weather, opts = {}) {
  const { steps = [0.10, 0.34, 0.60, 0.86], minGap = 15, maxGap = 35, speed = 0.4, onChange } = opts;
  const interval = () => minGap + Math.random() * (maxGap - minGap);
  let rain = state.rain;
  let target = rain;
  let untilChange = interval();

  function apply() {
    state.rain = rain;
    state.wetness = 0.32 + rain * 0.55;
    state.windStrength = 0.07 + rain * 0.13;
    if (weather.uRainDensity) weather.uRainDensity.value = rain;
    if (weather.uRain) weather.uRain.value = rain;
    if (weather.uWetness) weather.uWetness.value = state.wetness;
    if (weather.uWindStrength) weather.uWindStrength.value = state.windStrength;
    onChange?.(rain);
  }

  apply();
  function update(delta) {
    untilChange -= delta;
    if (untilChange <= 0) {
      untilChange += interval();
      const candidates = steps.filter((value) => Math.abs(value - target) > 0.14);
      const choices = candidates.length ? candidates : steps;
      target = choices[Math.floor(Math.random() * choices.length)];
    }
    if (rain === target || delta === 0) return;
    rain += (target - rain) * (1 - Math.exp(-speed * delta));
    if (Math.abs(target - rain) < 0.001) rain = target;
    apply();
  }

  return {
    update,
    setRain(value) { target = Math.min(1, Math.max(0, value)); },
    get rain() { return rain; },
  };
}
