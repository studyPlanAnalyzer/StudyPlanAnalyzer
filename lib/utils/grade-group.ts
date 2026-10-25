export type GradeGroup = "GROUP_4_7" | "GROUP_8_10";

export const GRADE_GROUP_LABELS: Record<GradeGroup, string> = {
  GROUP_4_7: "Grades 4–7",
  GROUP_8_10: "Grades 8–10",
};

/**
 * Students store their grade as free text (e.g. "Grade 9", "Class 9", "9").
 * This pulls the first number out of that string and maps it to a Daily
 * Brain Challenge grade group. Returns null for grades outside 4–10 (or
 * grades we can't parse a number from), so the feature can be hidden
 * gracefully for those students rather than guessing.
 */
export function gradeGroupFromGradeText(gradeText: string): GradeGroup | null {
  const match = gradeText.match(/\d+/);
  if (!match) return null;
  const num = parseInt(match[0], 10);
  if (num >= 4 && num <= 7) return "GROUP_4_7";
  if (num >= 8 && num <= 10) return "GROUP_8_10";
  return null;
}
