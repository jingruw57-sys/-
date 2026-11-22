// 文件职责：Web Audio 程序化环境音（雨、海浪、海鸥）与交互音效；无外部音频文件。
// 默认静音，点击声音按钮后才启动音频。
export function createAmbience() {
  let ctx = null;
  let master = null;
  let rainGain = null;
  let waveGain = null;
  let enabled = false;
  let rain = 0.7;

  function noiseBuffer(seconds, pink) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
      } else {
        data[i] = w * 0.4;
      }
    }
    return buf;
  }

  function loopSource(buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  function build() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 雨：白噪声 → 带通
    const rainSrc = loopSource(noiseBuffer(4, false));
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1900;
    rainFilter.Q.value = 0.55;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(rainGain).connect(master);
    rainSrc.start();

    // 海浪：粉噪声 → 低通，用 LFO 做缓慢起伏
    const waveSrc = loopSource(noiseBuffer(6, true));
    const waveFilter = ctx.createBiquadFilter();
    waveFilter.type = 'lowpass';
    waveFilter.frequency.value = 480;
    waveGain = ctx.createGain();
    waveGain.gain.value = 0;
    waveSrc.connect(waveFilter).connect(waveGain).connect(master);
    waveSrc.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.16;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.055;
    lfo.connect(lfoDepth).connect(waveGain.gain);
    lfo.start();

    applyRain();
    scheduleGull();
    return true;
  }

  function applyRain() {
    if (!ctx) return;
    const t = ctx.currentTime;
    rainGain.gain.setTargetAtTime(0.015 + rain * 0.17, t, 0.9);
    waveGain.gain.setTargetAtTime(0.13 * (1.15 - rain * 0.6), t, 0.9);
  }

  function gull() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    bp.Q.value = 1.2;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(1850, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.34);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc.connect(bp).connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  function scheduleGull() {
    window.setTimeout(() => {
      if (enabled && ctx) gull();
      scheduleGull();
    }, 8000 + Math.random() * 14000);
  }

  // 单音短促音效，用于拾取与提示
  function blip(freq, dur, vol, type = 'sine') {
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + dur * 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function bell() {
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1320, 1760, 2340].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = now + i * 0.018;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.075 / (i + 1), t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 1.8);
    });
  }

  function play(name) {
    if (!ctx || !enabled) return;
    if (name === 'pick') blip(880, 0.16, 0.05, 'triangle');
    else if (name === 'fish') blip(520, 0.22, 0.04, 'sine');
    else if (name === 'beacon') blip(330, 0.6, 0.05, 'sine');
    else if (name === 'bell') bell();
  }

  function setRain(value) {
    rain = value;
    applyRain();
  }

  async function setEnabled(on) {
    if (on) {
      try {
        if (!ctx && !build()) return false;
        if (ctx.state !== 'running') await ctx.resume();
      } catch {
        return false;
      }
    }
    if (!ctx) return false;
    enabled = on;
    master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.3);
    return true;
  }

  return {
    setEnabled,
    setRain,
    play,
    get enabled() { return enabled; },
  };
}
