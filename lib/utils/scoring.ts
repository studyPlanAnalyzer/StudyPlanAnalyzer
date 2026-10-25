export interface WeightedRecord {
  percent: number;
  fullMarks: number;
}

export type EstimatedConfidence = 'low' | 'medium' | 'high';

/**
 * Stand-in percent for a subject that has NO marks at all yet, taken from a
 * parent's gut-sense confidence at the start of a fresh academic session.
 * It replaces the flat default only while there are zero real marks, and is
 * never blended with real results.
 */
export const ESTIMATED_CONFIDENCE_PERCENT: Record<EstimatedConfidence, number> =
  {
    low: 35,
    medium: 50,
    high: 85,
  };

/**
 * Blends the last up to 3 records into a single percent, weighted by how
 * comprehensive each one was (fullMarks) and mildly by recency. A single
 * small quiz shouldn't swing a score as hard as a full comprehensive test —
 * this is the shared logic behind both subject-level weakness scoring and
 * topic-level mastery updates, so a /10 class test never counts the same as
 * a /100 exam in either place.
 */
export function blendedPercent(
  records: WeightedRecord[],
  fallback = 50,
): number {
  if (records.length === 0) return fallback;
  const recent = records.slice(-3);
  const recencyWeights = [0.5, 1, 1.5].slice(-recent.length);
  let weightedSum = 0;
  let totalWeight = 0;
  recent.forEach((r, i) => {
    const weight = Math.max(1, r.fullMarks) * recencyWeights[i];
    weightedSum += r.percent * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : fallback;
}
