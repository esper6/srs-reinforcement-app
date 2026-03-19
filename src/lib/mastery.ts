/**
 * Calculate the review threshold based on original score.
 * Strong concepts trigger later (you still remember most of it).
 * Weak concepts trigger sooner (fragile knowledge).
 *
 * Original Score | Threshold | Drop before review
 * 90+            | ~60%      | ~33% drop
 * 60-89          | ~40%      | ~40% drop
 * 30-59          | ~25%      | ~50% drop
 * <30            | ~15%      | review very soon
 */
export function getReviewThreshold(originalScore: number): number {
  if (originalScore >= 90) return originalScore * 0.67;
  if (originalScore >= 60) return originalScore * 0.55;
  if (originalScore >= 30) return originalScore * 0.45;
  return originalScore * 0.5;
}

export function calculateCurrentMastery(
  score: number,
  decayRate: number,
  lastReviewedAt: Date
): number {
  const daysSince =
    (Date.now() - lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24);
  return score * Math.exp(-decayRate * daysSince);
}

export function isDueForReview(
  score: number,
  decayRate: number,
  lastReviewedAt: Date
): boolean {
  const current = calculateCurrentMastery(score, decayRate, lastReviewedAt);
  const threshold = getReviewThreshold(score);
  return current < threshold;
}
