// Tiny WebAudio synth: every sound is an oscillator envelope, no audio files,
// no network. Created lazily on the first user gesture; M toggles mute.
export function createAudio() {
  let ctx = null;
  let muted = false;
  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }
  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
    shoot() { tone(720, 0.07, 'square', 0.03, 420); },
    frost() { tone(980, 0.16, 'sine', 0.035, 1400); },
    cannon() { tone(180, 0.18, 'sawtooth', 0.05, 60); },
    coin() { tone(880, 0.09, 'sine', 0.04, 1320); },
    leak() { tone(220, 0.3, 'sawtooth', 0.06, 90); },
    build() { tone(520, 0.1, 'triangle', 0.05, 780); },
    upgrade() { tone(440, 0.22, 'triangle', 0.05, 880); },
    horn() { tone(196, 0.5, 'sawtooth', 0.05, 294); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.05), i * 120)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.04), i * 140)); },
  };
}
