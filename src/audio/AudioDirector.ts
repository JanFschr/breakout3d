import type { GameplayEvent, GameplayEventBus } from '../gameplay/GameplayEvents';

const AUDIO_KEY = 'breakout3d.audio.enabled';
const HAPTICS_KEY = 'breakout3d.haptics.enabled';
const LOOKAHEAD_SECONDS = 0.16;
const CHORD_STEPS = 8;
const ARP_PATTERN = [0, 2, 1, 3, 1, 2, 0, 3] as const;
const MUSIC_CHORDS = [
  { bass: 82.41, tones: [164.81, 196, 246.94, 293.66] },
  { bass: 65.41, tones: [130.81, 164.81, 196, 246.94] },
  { bass: 98, tones: [196, 246.94, 293.66, 392] },
  { bass: 73.42, tones: [146.83, 185, 220, 329.63] },
] as const;

export class AudioDirector {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private enabled = readBoolean(AUDIO_KEY, true);
  private hapticsEnabled = readBoolean(HAPTICS_KEY, true);
  private armed = false;
  private musicStep = 0;
  private nextMusicStepTime = 0;
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
    if (!this.context || !this.musicGain || !this.musicFilter) return;
    const now = this.context.currentTime;
    const normalizedIntensity = clamp01(intensity);
    const targetGain = this.enabled ? 0.22 + normalizedIntensity * 0.08 : 0;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(targetGain, now, 0.18);
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setTargetAtTime(1050 + normalizedIntensity * 1750, now, 0.2);

    if (!this.enabled || this.context.state !== 'running') return;
    if (this.nextMusicStepTime < now - 0.4) this.nextMusicStepTime = now + 0.02;

    const bpm = 82 + normalizedIntensity * 28;
    const stepDuration = (60 / bpm) / 2;
    while (this.nextMusicStepTime < now + LOOKAHEAD_SECONDS) {
      this.scheduleMusicStep(this.musicStep, this.nextMusicStepTime, stepDuration, normalizedIntensity);
      this.musicStep += 1;
      this.nextMusicStepTime += stepDuration;
    }
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
    if (this.context) this.nextMusicStepTime = Math.max(this.nextMusicStepTime, this.context.currentTime + 0.02);
  };

  private createContext(): void {
    this.context = new AudioContext();
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.enabled ? 0.22 : 0;
    this.musicFilter = this.context.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 1200;
    this.musicFilter.Q.value = 0.72;
    this.musicFilter.connect(this.musicGain).connect(this.context.destination);
    this.musicStep = 0;
    this.nextMusicStepTime = this.context.currentTime + 0.03;
  }

  private scheduleMusicStep(step: number, start: number, stepDuration: number, intensity: number): void {
    if (!this.context || !this.musicFilter) return;
    const chordIndex = Math.floor(step / CHORD_STEPS) % MUSIC_CHORDS.length;
    const chord = MUSIC_CHORDS[chordIndex];
    const stepInChord = step % CHORD_STEPS;
    const note = chord.tones[ARP_PATTERN[stepInChord]];

    this.playMusicVoice(note, start, stepDuration * 0.82, 0.055 + intensity * 0.018, 'triangle', 0.008, 0.11);

    if (stepInChord % 4 === 0) {
      this.playMusicVoice(chord.bass, start, stepDuration * 1.8, 0.09 + intensity * 0.015, 'sine', 0.012, 0.2);
    }

    if (stepInChord === 0) {
      chord.tones.slice(0, 3).forEach((frequency, index) => {
        this.playMusicVoice(frequency, start + index * 0.018, stepDuration * 6.8, 0.018, 'sine', 0.16, 0.7);
      });
    }

    if (intensity > 0.42 && stepInChord % 2 === 1) {
      this.playMusicVoice(note * 2, start, stepDuration * 0.32, 0.012 + intensity * 0.008, 'sine', 0.004, 0.055);
    }
  }

  private playMusicVoice(
    frequency: number,
    start: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    attack: number,
    release: number,
  ): void {
    if (!this.context || !this.musicFilter) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + attack);
    gain.gain.setTargetAtTime(Math.max(0.00015, gainValue * 0.58), start + Math.max(attack, duration - release), Math.max(0.02, release * 0.28));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.musicFilter);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
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

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

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
