import type { ScoringDefinition } from '../data/LevelDefinition';
import type { RunSummary } from './MasterySystem';

export interface StarResult {
  readonly stars: 0 | 1 | 2 | 3;
  readonly composite: number;
  readonly efficiency: number;
  readonly mastery: number;
  readonly points: number;
}

export function evaluateStars(summary: RunSummary, scoring: ScoringDefinition): StarResult {
  if (!summary.cleared) return { stars: 0, composite: 0, efficiency: 0, mastery: 0, points: 0 };

  const efficiency = clamp01(scoring.parSeconds / Math.max(1, summary.elapsedSeconds));
  const combo = clamp01(summary.comboPeak / scoring.comboPeakTarget);
  const orbit = clamp01(summary.orbitTier / scoring.orbitTierTarget);
  const mastery = combo * 0.65 + orbit * 0.35;
  const points = clamp01(summary.score / scoring.scoreTarget);
  const composite = (efficiency * 0.35 + mastery * 0.35 + points * 0.30) * 100;
  const stars: 1 | 2 | 3 = composite >= scoring.starThresholds[1] ? 3 : composite >= scoring.starThresholds[0] ? 2 : 1;
  return { stars, composite, efficiency: efficiency * 100, mastery: mastery * 100, points: points * 100 };
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
