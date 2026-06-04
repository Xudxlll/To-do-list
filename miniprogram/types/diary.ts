export type MoodId = 'happy' | 'calm' | 'tired' | 'sad' | 'surprised';

export interface MoodOption {
  id: MoodId;
  emoji: string;
  label: string;
}

export const MOODS: MoodOption[] = [
  { id: 'happy', emoji: '😊', label: '开心' },
  { id: 'calm', emoji: '😌', label: '平静' },
  { id: 'tired', emoji: '🥱', label: '疲惫' },
  { id: 'sad', emoji: '😔', label: '难过' },
  { id: 'surprised', emoji: '✨', label: '惊喜' },
];

export interface DiaryTag {
  categoryId: string;
  optionId: string;
  name: string;
  isCustom: boolean;
}

export interface DiaryRecord {
  _id?: string;
  date: string;
  content: string;
  mood: MoodId;
  location: string;
  photoFileIds: string[];
  tags: DiaryTag[];
  createdAt: number;
  updatedAt: number;
}

export interface DiaryDraft {
  date: string;
  content: string;
  mood: MoodId;
  location: string;
  localPhotoPaths: string[];
  existingPhotoFileIds: string[];
  updatedAt: number;
}

export interface CustomOptionRecord {
  _id?: string;
  categoryId: string;
  name: string;
  normalizedName: string;
  createdAt: number;
}

export interface DiaryTimelineItem extends DiaryRecord {
  summary: string;
  coverFileId: string;
  moodEmoji: string;
  moodLabel: string;
}

export interface CalendarDay {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasDiary: boolean;
}

export interface RecognizedTag extends DiaryTag {
  source: 'preset' | 'custom' | 'candidate';
  categoryName: string;
  editable: boolean;
}
