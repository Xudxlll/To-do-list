import { DiaryDraft, MOODS, MoodId } from '../types/diary';
import { getPrimaryMoodId, normalizeMoodIds } from './diaryMoods';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function normalizeMood(value: unknown): MoodId | '' {
  const mood = typeof value === 'string' ? value : '';
  const found = MOODS.find(item => item.id === mood);
  return found ? found.id : '';
}

function normalizeDraft(value: unknown, date: string): DiaryDraft | null {
  if (!isObject(value)) return null;
  if (value.date !== date) return null;

  const mood = normalizeMood(value.mood);
  const moods = normalizeMoodIds(value.moods, mood);
  return {
    date,
    content: typeof value.content === 'string' ? value.content : '',
    mood: getPrimaryMoodId(moods),
    moods,
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
  try {
    wx.setStorageSync(diaryDraftKey(draft.date), { ...draft, updatedAt: Date.now() });
  } catch (e) {
    console.warn('保存日记草稿失败', e);
  }
}

export function clearDiaryDraft(date: string): void {
  try {
    wx.removeStorageSync(diaryDraftKey(date));
  } catch (e) {
    console.warn('清理日记草稿失败', e);
  }
}
