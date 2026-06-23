export function buildDiaryCandidateOptionId(categoryId: string, normalizedName: string): string {
  return `diary_candidate_${categoryId}_${normalizedName}`;
}
