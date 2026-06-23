export interface DiaryDraftFields {
  content: string;
  location: string;
  localPhotoPaths: string[];
  existingPhotoFileIds: string[];
  mood?: string;
  selectedMoodIds?: string[];
  moodSelections?: Record<string, boolean>;
}

export function clearDiaryDraftFields<T extends DiaryDraftFields>(fields: T): T {
  return {
    ...fields,
    content: '',
    location: '',
    localPhotoPaths: [],
    existingPhotoFileIds: [],
    mood: '',
    selectedMoodIds: [],
    moodSelections: {},
  };
}
