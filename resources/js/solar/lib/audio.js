// Small helpers for PCM <-> base64 and for gapless playback of model audio.

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

/** Plays 24 kHz mono PCM chunks back-to-back and supports instant interruption. */
export class PcmPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
    this.nextTime = 0;
    this.sources = new Set();
    this.onEndedCallback = null;
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  enqueue(int16) {
    if (!this.ctx || this.ctx.state === "closed") return;

    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;

    const buf = this.ctx.createBuffer(1, float.length, this.sampleRate);
    buf.copyToChannel(float, 0);

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const startAt = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
    src.start(startAt);
    this.nextTime = startAt + buf.duration;

    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0 && this.onEndedCallback) {
        this.onEndedCallback();
      }
    };
  }

  /** Called when the user barges in: stop everything the model was saying. */
  interrupt() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources.clear();
    this.nextTime = 0;
    if (this.onEndedCallback) {
      this.onEndedCallback();
    }
  }

  close() {
    this.interrupt();
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}

/** Generates realistic telephone audio tones (Calling Ring & Disconnect Beeps) using Web Audio API */
export class ToneGenerator {
  constructor() {
    this.ctx = null;
    this.ringInterval = null;
    this.activeOscillators = [];
  }

  ensureContext() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /** Plays standard telephone ringing tone: Dual tone (440Hz + 480Hz) for 1.8s every 3.5s */
  startRingTone() {
    this.stopRingTone();
    this.ensureContext();

    const playBurst = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      const t = this.ctx.currentTime;
      
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.frequency.value = 440; // Ring standard tone A
      osc2.frequency.value = 480; // Ring standard tone B

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.1);
      gain.gain.setValueAtTime(0.12, t + 1.6);
      gain.gain.linearRampToValueAtTime(0, t + 1.8);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.85);
      osc2.stop(t + 1.85);

      this.activeOscillators.push(osc1, osc2);
    };

    playBurst();
    this.ringInterval = setInterval(playBurst, 3800);
  }

  stopRingTone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    this.activeOscillators.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    this.activeOscillators = [];
  }

  /** Plays classic 3-beep Call End Disconnect tone (480Hz + 620Hz) & haptic vibration */
  playDisconnectTone() {
    this.stopRingTone();
    this.ensureContext();

    // Trigger phone vibration if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 80, 100, 80, 120]);
      } catch(e) {}
    }

    if (!this.ctx || this.ctx.state === 'closed') return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const start = t + i * 0.28;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.frequency.value = 480;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.setValueAtTime(0, start + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.2);
    }
  }

  close() {
    this.stopRingTone();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}

