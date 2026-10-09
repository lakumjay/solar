// Audio Player and Dialing Sound Engine for Gemini Live AI Voice Call

export class PcmPlayer {
    constructor(sampleRate = 24000) {
        this.sampleRate = sampleRate;
        this.audioCtx = null;
        this.gainNode = null;
        this.nextPlayTime = 0;
        this.isPlaying = false;
    }

    init() {
        if (!this.audioCtx) {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });
            this.gainNode = this.audioCtx.createGain();
            this.gainNode.connect(this.audioCtx.destination);
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        this.nextPlayTime = this.audioCtx.currentTime;
        this.isPlaying = true;
    }

    playPcmChunk(pcmData) {
        if (!this.isPlaying || !this.audioCtx) return;

        // pcmData can be Uint8Array, Int16Array, or ArrayBuffer
        let int16Array;
        if (pcmData instanceof Int16Array) {
            int16Array = pcmData;
        } else if (pcmData instanceof ArrayBuffer) {
            int16Array = new Int16Array(pcmData);
        } else if (pcmData instanceof Uint8Array) {
            int16Array = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
        } else {
            return;
        }

        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = this.audioCtx.createBuffer(1, float32Array.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.gainNode);

        const now = this.audioCtx.currentTime;
        const startTime = Math.max(now, this.nextPlayTime);
        source.start(startTime);
        this.nextPlayTime = startTime + audioBuffer.duration;
    }

    stop() {
        this.isPlaying = false;
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            try {
                this.audioCtx.close();
            } catch (_) {}
            this.audioCtx = null;
        }
        this.nextPlayTime = 0;
    }
}

// Dialing and Call Tones Generator
export class CallTonePlayer {
    constructor() {
        this.audioCtx = null;
        this.timer = null;
    }

    startRinging() {
        this.stop();
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtxClass();

        const playBeep = () => {
            if (!this.audioCtx || this.audioCtx.state === 'closed') return;
            try {
                const now = this.audioCtx.currentTime;
                // Dual tone for phone dial tone (440Hz + 480Hz)
                const osc1 = this.audioCtx.createOscillator();
                const osc2 = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.setValueAtTime(440, now);
                osc2.frequency.setValueAtTime(480, now);

                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
                gain.gain.setValueAtTime(0.08, now + 1.2);
                gain.gain.linearRampToValueAtTime(0, now + 1.3);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.audioCtx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 1.3);
                osc2.stop(now + 1.3);
            } catch (_) {}
        };

        playBeep();
        this.timer = setInterval(playBeep, 3000);
    }

    playConnectedTone() {
        this.stop();
        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtxClass();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(880, now + 0.1); // A5

            gain.gain.setValueAtTime(0.06, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.25);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
            setTimeout(() => {
                try { ctx.close(); } catch (_) {}
            }, 300);
        } catch (_) {}
    }

    playEndedTone() {
        this.stop();
        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtxClass();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);

            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
            setTimeout(() => {
                try { ctx.close(); } catch (_) {}
            }, 350);
        } catch (_) {}
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            try {
                this.audioCtx.close();
            } catch (_) {}
            this.audioCtx = null;
        }
    }
}
