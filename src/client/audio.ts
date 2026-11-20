export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientStarted = false;
  private volume = 0.7;

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.4, this.ctx.currentTime, 0.03);
    }
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.4;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (!this.ambientStarted) {
        this.ambientStarted = true;
        this.startNightPad();
      }
    } catch {
      // Audio unavailable
    }
  }

  private startNightPad(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 110;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
  }

  private tone(freq: number, endFreq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25): void {
    if (!this.ctx || !this.master || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + dur);
  }

  playPickup(): void {
    this.tone(587, 880, 0.12, 'triangle', 0.22);
  }
  playDeposit(): void {
    this.tone(440, 660, 0.1, 'sine', 0.2);
  }
  playRefuel(): void {
    this.tone(520, 780, 0.14, 'triangle', 0.2);
  }
  playLanternLit(): void {
    this.tone(523, 784, 0.25, 'triangle', 0.28);
    setTimeout(() => this.tone(784, 1046, 0.35, 'sine', 0.26), 110);
  }
  playLanternOut(): void {
    this.tone(320, 140, 0.3, 'triangle', 0.24);
  }
  playPulse(): void {
    this.tone(330, 880, 0.28, 'sine', 0.3);
  }
  playHit(): void {
    this.tone(190, 65, 0.25, 'sawtooth', 0.28);
  }
  playJump(): void {
    this.tone(240, 420, 0.12, 'sine', 0.16);
  }
  playDash(): void {
    this.tone(480, 220, 0.14, 'triangle', 0.2);
  }
  playShadeSpawn(): void {
    this.tone(130, 95, 0.35, 'sawtooth', 0.16);
  }
  playCharm(): void {
    this.tone(659, 987, 0.22, 'triangle', 0.25);
  }
  playCountdown(): void {
    this.tone(880, 880, 0.08, 'square', 0.12);
  }
  playWindWarning(): void {
    this.tone(260, 390, 0.45, 'sine', 0.14);
  }
  playWin(): void {
    this.tone(523, 659, 0.2, 'triangle', 0.28);
    setTimeout(() => this.tone(659, 784, 0.2, 'triangle', 0.28), 140);
    setTimeout(() => this.tone(784, 1046, 0.45, 'sine', 0.3), 280);
  }
  playLose(): void {
    this.tone(311, 220, 0.28, 'sine', 0.25);
    setTimeout(() => this.tone(220, 147, 0.42, 'sine', 0.24), 220);
  }
}
