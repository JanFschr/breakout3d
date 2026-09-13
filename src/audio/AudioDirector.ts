import type { GameplayEvent, GameplayEventBus } from '../gameplay/GameplayEvents';

const AUDIO_KEY = 'breakout3d.audio.enabled';
const HAPTICS_KEY = 'breakout3d.haptics.enabled';

export class AudioDirector {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private enabled = readBoolean(AUDIO_KEY, true);
  private hapticsEnabled = readBoolean(HAPTICS_KEY, true);
  private armed = false;
  private readonly unsubscribe: () => void;

  constructor(bus: GameplayEventBus) {
    this.unsubscribe = bus.subscribe((event) => this.onEvent(event));
  }

  arm(): void {
    if (this.armed) return;
    this.armed = true;
    window.addEventListener('pointerdown', this.resume, { passive: true });
    window.addEventListener('touchend', this.resume, { passive: true });
    window.addEventListener('keydown', this.resume);
  }

  update(intensity: number): void {
    if (!this.context || !this.musicGain) return;
    const now = this.context.currentTime;
    const target = this.enabled ? 0.018 + intensity * 0.038 : 0;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(target, now, 0.12);
  }

  toggleEnabled(): boolean {
    this.enabled = !this.enabled;
    writeBoolean(AUDIO_KEY, this.enabled);
    if (this.enabled) void this.resume();
    this.update(0.18);
    if (this.enabled) this.playConfirmation();
    return this.enabled;
  }

  toggleHaptics(): boolean {
    if (!this.supportsHaptics()) {
      this.hapticsEnabled = false;
      writeBoolean(HAPTICS_KEY, false);
      return false;
    }
    this.hapticsEnabled = !this.hapticsEnabled;
    writeBoolean(HAPTICS_KEY, this.hapticsEnabled);
    if (this.hapticsEnabled) navigator.vibrate(10);
    return this.hapticsEnabled;
  }

  isEnabled(): boolean { return this.enabled; }
  isHapticsEnabled(): boolean { return this.supportsHaptics() && this.hapticsEnabled; }
  supportsHaptics(): boolean { return typeof navigator.vibrate === 'function'; }

  dispose(): void {
    this.unsubscribe();
    window.removeEventListener('pointerdown', this.resume);
    window.removeEventListener('touchend', this.resume);
    window.removeEventListener('keydown', this.resume);
    if (this.context) void this.context.close();
  }

  private readonly resume = async (): Promise<void> => {
    if (!this.context) this.createContext();
    if (this.context?.state === 'suspended') await this.context.resume();
  };

  private createContext(): void {
    this.context = new AudioContext();
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.enabled ? 0.018 : 0;
    this.musicGain.connect(this.context.destination);

    const bass = this.context.createOscillator();
    bass.type = 'sine';
    bass.frequency.value = 82.41;
    const shimmer = this.context.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = 164.81;
    const bassGain = this.context.createGain();
    const shimmerGain = this.context.createGain();
    bassGain.gain.value = 0.44;
    shimmerGain.gain.value = 0.11;
    bass.connect(bassGain).connect(this.musicGain);
    shimmer.connect(shimmerGain).connect(this.musicGain);
    bass.start();
    shimmer.start();
  }

  private playConfirmation(): void {
    if (!this.context || this.context.state !== 'running') return;
    this.playTone(523.25, 0.1, 0.045, 'triangle');
    this.playTone(783.99, 0.11, 0.028, 'sine', 0.045);
  }

  private onEvent(event: GameplayEvent): void {
    if (this.enabled) this.playEvent(event);
    if (this.hapticsEnabled && this.supportsHaptics()) this.hapticEvent(event);
  }

  private playEvent(event: GameplayEvent): void {
    if (!this.context || this.context.state !== 'running') return;
    if (event.type === 'BlockHit') {
      this.playTone(event.destroyed ? 330 : 245, event.destroyed ? 0.11 : 0.055, event.destroyed ? 0.06 : 0.025, 'sine');
      return;
    }
    if (event.type === 'FlipRated') {
      const frequency = event.rating === 'perfect' ? 880 : event.rating === 'good' ? 660 : 440;
      this.playTone(frequency, event.rating === 'perfect' ? 0.18 : 0.11, 0.055, 'triangle');
      return;
    }
    if (event.type === 'GeneratorDestroyed') {
      this.playTone(196, 0.28, 0.08, 'sawtooth');
      this.playTone(392, 0.34, 0.04, 'sine', 0.05);
      return;
    }
    if (event.type === 'ChainTriggered') {
      this.playTone(150, 0.24, 0.07, 'square');
      return;
    }
    if (event.type === 'CoreExposed') {
      this.playTone(523.25, 0.42, 0.07, 'triangle');
      return;
    }
    if (event.type === 'CoreDestroyed') {
      this.playTone(98, 0.75, 0.12, 'sawtooth');
      this.playTone(392, 0.55, 0.07, 'triangle', 0.08);
      this.playTone(784, 0.42, 0.05, 'sine', 0.18);
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    if (!this.context) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * 1.08), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private hapticEvent(event: GameplayEvent): void {
    if (event.type === 'FlipRated' && event.rating === 'perfect') navigator.vibrate(12);
    else if (event.type === 'BlockDestroyed') navigator.vibrate(5);
    else if (event.type === 'CoreDestroyed') navigator.vibrate([18, 35, 42]);
  }
}

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

function writeBoolean(key: string, value: boolean): void {
  try { localStorage.setItem(key, String(value)); } catch { /* storage is optional */ }
}
