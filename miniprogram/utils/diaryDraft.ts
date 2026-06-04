import { DiaryDraft } from '../types/diary';

export function diaryDraftKey(date: string): string {
  return `diaryDraft:${date}`;
}

export function readDiaryDraft(date: string): DiaryDraft | null {
  try {
    return wx.getStorageSync(diaryDraftKey(date)) || null;
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
