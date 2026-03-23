/**
 * Calculate the review threshold based on original score.
 * Strong concepts trigger later (you still remember most of it).
 * Weak concepts trigger very soon (fragile knowledge needs reinforcement).
 *
 * Original Score | Threshold | Approx days to trigger (decay ~0.1)
 * 90+            | ~60%      | ~4 days
 * 60-89          | ~45%      | ~3 days
 * 30-59          | ~75%      | ~1-2 days  (high threshold = triggers fast)
 * <30            | ~85%      | <1 day     (almost immediate review)
 */
export function getReviewThreshold(originalScore: number): number {
  if (originalScore >= 90) return originalScore * 0.67;
  if (originalScore >= 60) return originalScore * 0.55;
  if (originalScore >= 30) return originalScore * 0.75;
  return originalScore * 0.85;
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
