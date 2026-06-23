import { MOODS, MoodId } from '../types/diary';

function isMoodId(value: unknown): value is MoodId {
  return typeof value === 'string' && MOODS.some(item => item.id === value);
}

export function normalizeMoodIds(value: unknown, fallback?: unknown): MoodId[] {
  const source = Array.isArray(value) ? value : (isMoodId(fallback) ? [fallback] : []);
  return source.filter(isMoodId);
}

export function getPrimaryMoodId(moods: MoodId[]): MoodId | '' {
  return moods[0] || '';
}

export function buildMoodSelections(moods: MoodId[]): Record<string, boolean> {
  return moods.reduce((acc, mood) => {
    acc[mood] = true;
    return acc;
  }, {} as Record<string, boolean>);
}

export function getInitialMoodState(): {
  mood: MoodId | '';
  selectedMoodIds: MoodId[];
  moodSelections: Record<string, boolean>;
} {
  return {
    mood: '',
    selectedMoodIds: [],
    moodSelections: {},
  };
}

export function toggleMoodSelection(selectedMoodIds: MoodId[], moodId: MoodId): MoodId[] {
  const selected = selectedMoodIds.slice();
  const index = selected.indexOf(moodId);
  if (index >= 0) {
    selected.splice(index, 1);
  } else {
    selected.push(moodId);
  }
  return selected;
}
