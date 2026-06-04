import { DiaryDraft, MOODS, MoodId } from '../types/diary';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function normalizeMood(value: unknown): MoodId {
  const mood = typeof value === 'string' ? value : '';
  const found = MOODS.find(item => item.id === mood);
  return found ? found.id : MOODS[0].id;
}

function normalizeDraft(value: unknown, date: string): DiaryDraft | null {
  if (!isObject(value)) return null;
  if (value.date !== date) return null;

  return {
    date,
    content: typeof value.content === 'string' ? value.content : '',
    mood: normalizeMood(value.mood),
    location: typeof value.location === 'string' ? value.location : '',
    localPhotoPaths: isStringArray(value.localPhotoPaths) ? value.localPhotoPaths : [],
    existingPhotoFileIds: isStringArray(value.existingPhotoFileIds) ? value.existingPhotoFileIds : [],
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  };
}

export function diaryDraftKey(date: string): string {
  return `diaryDraft:${date}`;
}

export function readDiaryDraft(date: string): DiaryDraft | null {
  try {
    return normalizeDraft(wx.getStorageSync(diaryDraftKey(date)), date);
  } catch {
    return null;
  }
}

export function saveDiaryDraft(draft: DiaryDraft): void {
  wx.setStorageSync(diaryDraftKey(draft.date), { ...draft, updatedAt: Date.now() });
}

export function clearDiaryDraft(date: string): void {
  wx.removeStorageSync(diaryDraftKey(date));
}
