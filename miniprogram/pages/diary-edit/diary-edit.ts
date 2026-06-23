import { Category } from '../../data/categories';
import { createSharedOption, listOptionCatalogRecords } from '../../services/customOptions';
import { getDiaryByDate, saveDiary, uploadDiaryPhotos } from '../../services/diaries';
import { DiaryDraft, DiaryRecord, MOODS, MoodId } from '../../types/diary';
import { buildCatalog } from '../../utils/optionCatalog';
import { clearDiaryDraft, readDiaryDraft, saveDiaryDraft } from '../../utils/diaryDraft';
import {
  EditableTagCategory,
  EditableTagGroup,
  EditableRecognizedTag,
  isDiaryCandidateTagSyncError,
  prepareEditableDiaryTags,
  syncDiaryCandidateTags,
  updateEditableDiaryTagCategory,
  updateEditableDiaryTagGroup,
  updateEditableDiaryTagName,
} from '../../utils/diaryTagEditing';
import { recognizeDiaryTagsForDiary } from '../../utils/diaryTags';
import { formatDiaryDateLabel, isFutureDate, isSupportedDiaryDate, todayString } from '../../utils/date';
import { clearDiaryDraftFields } from '../../utils/diaryForm';
import {
  buildMoodSelections,
  getInitialMoodState,
  getPrimaryMoodId,
  normalizeMoodIds,
  toggleMoodSelection,
} from '../../utils/diaryMoods';

let draftSaveTimer: number | null = null;

interface TagPanelCategory extends EditableTagCategory {
  groups: EditableTagGroup[];
}

interface TagPanelTag extends EditableRecognizedTag {
  categoryIndex: number;
  groupIndex: number;
  groupNames: string[];
  missingGroup: boolean;
}

function formatSaveError(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { errCode?: number; errMsg?: string; message?: string };
    const message = err.errMsg || err.message || '';
    if (message.indexOf('duplicate key') >= 0 && message.indexOf('dup key: { : null }') >= 0) {
      return 'diaries 集合的 date 唯一索引配置异常，或仍有 date 为空的脏记录。请删除 date 唯一索引，不要重建，并删除 date 为空/缺失的记录。';
    }
    if (err.errMsg) return err.errCode ? `${err.errCode}: ${err.errMsg}` : err.errMsg;
    if (err.message) return err.message;
  }
  return String(error || '未知错误');
}

function buildTagPanelCategories(categories: Category[]): TagPanelCategory[] {
  return categories.map(category => ({
    id: category.id,
    name: category.name,
    groups: category.optionGroups.map(group => ({ id: group.id, title: group.title })),
  }));
}

function decorateTagForPanel(
  tag: EditableRecognizedTag,
  categories: Category[],
  tagCategories: TagPanelCategory[]
): TagPanelTag {
  const categoryIndex = Math.max(0, tagCategories.findIndex(category => category.id === tag.categoryId));
  const category = categories.find(item => item.id === tag.categoryId);
  const groups = category?.optionGroups || [];
  const groupNames = groups.map(group => group.title);
  const groupIndex = groups.findIndex(group => group.id === tag.groupId);
  return {
    ...tag,
    categoryIndex,
    groupIndex: groupIndex >= 0 ? groupIndex : 0,
    groupNames,
    missingGroup: tag.source === 'candidate' && groupIndex < 0,
  };
}

function hasInvalidCandidateTag(tags: EditableRecognizedTag[], categories: Category[]): boolean {
  return tags.some(tag => {
    if (tag.source !== 'candidate') return false;
    const category = categories.find(item => item.id === tag.categoryId);
    return !category || !category.optionGroups.some(group => group.id === tag.groupId);
  });
}

function buildTagPanelState(tags: EditableRecognizedTag[], categories: Category[]) {
  const tagCategories = buildTagPanelCategories(categories);
  return {
    recognizedTags: tags.map(tag => decorateTagForPanel(tag, categories, tagCategories)),
    tagCategories,
    tagCategoryNames: tagCategories.map(category => category.name),
    tagSaveDisabled: hasInvalidCandidateTag(tags, categories),
  };
}

Component({
  lifetimes: {
    detached() {
      if (draftSaveTimer !== null) {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
      }
    },
  },

  data: {
    date: todayString(),
    dateLabel: formatDiaryDateLabel(todayString()),
    loading: true,
    saving: false,
    content: '',
    ...getInitialMoodState(),
    location: '',
    localPhotoPaths: [] as string[],
    existingPhotoFileIds: [] as string[],
    moods: MOODS,
    tagPanelVisible: false,
    recognizedTags: [] as EditableRecognizedTag[],
    tagCatalog: [] as Category[],
    tagCategories: [] as TagPanelCategory[],
    tagCategoryNames: [] as string[],
    tagSaveDisabled: false,
    tagSyncError: '',
    existingRecord: null as DiaryRecord | null,
    initialized: false,
  },

  methods: {
    onLoad(options: Record<string, string>) {
      const date = options.date || todayString();
      if (!isSupportedDiaryDate(date)) {
        wx.showToast({ title: '这个日期暂不支持写日记', icon: 'none' });
        wx.navigateBack();
        return;
      }
      if (isFutureDate(date)) {
        wx.showToast({ title: '未来日期还不能写哦', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.setData({ date, dateLabel: formatDiaryDateLabel(date), initialized: true });
      this.loadDiary(date);
    },
    async loadDiary(date: string) {
      this.setData({ loading: true });
      try {
        const record = await getDiaryByDate(date);
        const draft = readDiaryDraft(date);
        const useDraft = draft && (!record || draft.updatedAt > record.updatedAt);
        if (useDraft) {
          wx.showToast({ title: '已恢复本地草稿', icon: 'none' });
          this.applyDraft(draft);
        } else if (record) {
          const selectedMoodIds = normalizeMoodIds(record.moods, record.mood);
          this.setData({
            existingRecord: record,
            content: record.content,
            mood: getPrimaryMoodId(selectedMoodIds),
            selectedMoodIds,
            moodSelections: buildMoodSelections(selectedMoodIds),
            location: record.location,
            existingPhotoFileIds: record.photoFileIds,
            localPhotoPaths: [],
          });
        }
        this.setData({ loading: false });
      } catch (e) {
        console.warn('加载日记失败', e);
        wx.showToast({ title: '日记加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    },

    applyDraft(draft: DiaryDraft) {
      const selectedMoodIds = normalizeMoodIds(draft.moods, draft.mood);
      this.setData({
        content: draft.content,
        mood: getPrimaryMoodId(selectedMoodIds),
        selectedMoodIds,
        moodSelections: buildMoodSelections(selectedMoodIds),
        location: draft.location,
        localPhotoPaths: draft.localPhotoPaths,
        existingPhotoFileIds: draft.existingPhotoFileIds,
      });
    },

    persistDraft() {
      if (draftSaveTimer !== null) {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
      }
      saveDiaryDraft({
        date: this.data.date,
        content: this.data.content,
        mood: this.data.mood,
        moods: this.data.selectedMoodIds,
        location: this.data.location,
        localPhotoPaths: this.data.localPhotoPaths,
        existingPhotoFileIds: this.data.existingPhotoFileIds,
        updatedAt: Date.now(),
      });
    },

    schedulePersistDraft() {
      if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(() => {
        draftSaveTimer = null;
        this.persistDraft();
      }, 300);
    },

    onContentInput(e: WechatMiniprogram.Input) {
      this.setData({ content: e.detail.value });
      this.schedulePersistDraft();
    },

    onLocationInput(e: WechatMiniprogram.Input) {
      this.setData({ location: e.detail.value });
      this.schedulePersistDraft();
    },

    onMoodTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as MoodId;
      const selected = toggleMoodSelection(this.data.selectedMoodIds, id);
      this.setData({ mood: getPrimaryMoodId(selected), selectedMoodIds: selected, moodSelections: buildMoodSelections(selected) });
      this.persistDraft();
    },

    choosePhotos() {
      const currentCount = this.data.existingPhotoFileIds.length + this.data.localPhotoPaths.length;
      const count = 3 - currentCount;
      if (count <= 0) {
        wx.showToast({ title: '最多 3 张照片', icon: 'none' });
        return;
      }
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: res => {
          const paths = res.tempFiles.map(file => file.tempFilePath);
          this.setData({ localPhotoPaths: this.data.localPhotoPaths.concat(paths) });
          this.persistDraft();
        },
      });
    },

    removeExistingPhoto(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      const next = this.data.existingPhotoFileIds.filter((_, i) => i !== index);
      this.setData({ existingPhotoFileIds: next });
      this.persistDraft();
    },

    removeLocalPhoto(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      const next = this.data.localPhotoPaths.filter((_, i) => i !== index);
      this.setData({ localPhotoPaths: next });
      this.persistDraft();
    },

    clearDraftContent() {
      wx.showModal({
        title: '清空草稿',
        content: '会清空今天发生了什么、地点和照片，已保存的日记不会立刻改动。',
        confirmText: '清空',
        confirmColor: '#FF6B81',
        success: res => {
          if (!res.confirm) return;
          if (draftSaveTimer !== null) {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = null;
          }
          this.setData(clearDiaryDraftFields({
            content: this.data.content,
            location: this.data.location,
            localPhotoPaths: this.data.localPhotoPaths,
            existingPhotoFileIds: this.data.existingPhotoFileIds,
            mood: this.data.mood,
            selectedMoodIds: this.data.selectedMoodIds,
            moodSelections: this.data.moodSelections,
          }));
          clearDiaryDraft(this.data.date);
          wx.showToast({ title: '草稿已清空', icon: 'success' });
        },
      });
    },

    async onSaveTap() {
      if (!this.data.content.trim()) {
        wx.showToast({ title: '先写一点内容吧', icon: 'none' });
        return;
      }
      try {
        const catalogRecords = await listOptionCatalogRecords();
        const categories = buildCatalog(catalogRecords);
        const recognizedTags = prepareEditableDiaryTags(
          recognizeDiaryTagsForDiary(this.data.content, this.data.location, categories)
        );
        this.setData({
          ...buildTagPanelState(recognizedTags, categories),
          tagCatalog: categories,
          tagPanelVisible: true,
          tagSyncError: '',
        });
      } catch (e) {
        console.warn('加载标签目录失败', e);
        wx.showToast({ title: '标签目录加载失败', icon: 'none' });
      }
    },

    onTagNameInput(e: WechatMiniprogram.Input) {
      const index = e.currentTarget.dataset.index as number;
      const name = e.detail.value;
      const recognizedTags = updateEditableDiaryTagName(this.data.recognizedTags, index, name, this.data.tagCatalog);
      this.setData({
        ...buildTagPanelState(recognizedTags, this.data.tagCatalog),
        tagSyncError: '',
      });
    },

    onTagCategoryChange(e: WechatMiniprogram.PickerChange) {
      const index = e.currentTarget.dataset.index as number;
      const categoryIndex = Number(e.detail.value);
      const category = this.data.tagCategories[categoryIndex];
      if (!category) return;
      const recognizedTags = updateEditableDiaryTagCategory(this.data.recognizedTags, index, category, this.data.tagCatalog);
      this.setData({
        ...buildTagPanelState(recognizedTags, this.data.tagCatalog),
        tagSyncError: '',
      });
    },

    onTagGroupChange(e: WechatMiniprogram.PickerChange) {
      const index = e.currentTarget.dataset.index as number;
      const groupIndex = Number(e.detail.value);
      const tag = this.data.recognizedTags[index];
      if (!tag) return;
      const category = this.data.tagCatalog.find(item => item.id === tag.categoryId);
      const group = category?.optionGroups[groupIndex];
      if (!group) return;
      const recognizedTags = updateEditableDiaryTagGroup(this.data.recognizedTags, index, {
        id: group.id,
        title: group.title,
      });
      this.setData({
        ...buildTagPanelState(recognizedTags, this.data.tagCatalog),
        tagSyncError: '',
      });
    },

    removeTag(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      const recognizedTags = this.data.recognizedTags.filter((_, i) => i !== index);
      this.setData({
        ...buildTagPanelState(recognizedTags, this.data.tagCatalog),
        tagSyncError: '',
      });
    },

    closeTagPanel() {
      this.setData({ tagPanelVisible: false });
    },

    keepUploadedPhotosInDraft(uploadedFileIds: string[]): string[] {
      const photoFileIds = this.data.existingPhotoFileIds.concat(uploadedFileIds).slice(0, 3);
      if (uploadedFileIds.length > 0) {
        this.setData({
          existingPhotoFileIds: photoFileIds,
          localPhotoPaths: [],
        });
        this.persistDraft();
      }
      return photoFileIds;
    },

    async confirmSave() {
      this.setData({ saving: true, tagSyncError: '' });
      try {
        let syncedTags: EditableRecognizedTag[];
        try {
          syncedTags = await syncDiaryCandidateTags(this.data.recognizedTags, this.data.tagCatalog, createSharedOption);
        } catch (tagError) {
          const message = `新标签同步失败：${formatSaveError(tagError)}`;
          console.warn('同步日记新标签失败，已阻止保存日记', tagError);
          if (isDiaryCandidateTagSyncError(tagError)) {
            this.setData({
              ...buildTagPanelState(tagError.syncedTags, tagError.categories),
              tagCatalog: tagError.categories,
              saving: false,
              tagPanelVisible: true,
              tagSyncError: message,
            });
          } else {
            this.setData({
              saving: false,
              tagPanelVisible: true,
              tagSyncError: message,
            });
          }
          wx.showModal({
            title: '新标签同步失败',
            content: `没有上传照片，也没有保存日记。请检查候选标签分类后重试。\n\n错误：${formatSaveError(tagError)}`,
            showCancel: false,
            confirmText: '知道了',
          });
          return;
        }
        this.setData(buildTagPanelState(syncedTags, this.data.tagCatalog));
        const uploadedFileIds = await uploadDiaryPhotos(this.data.date, this.data.localPhotoPaths);
        const photoFileIds = this.keepUploadedPhotosInDraft(uploadedFileIds);
        const date = this.data.date;
        const now = Date.now();
        const record: DiaryRecord = {
          _id: this.data.existingRecord ? this.data.existingRecord._id : undefined,
          date,
          content: this.data.content.trim(),
          mood: getPrimaryMoodId(this.data.selectedMoodIds),
          moods: this.data.selectedMoodIds,
          location: this.data.location.trim(),
          photoFileIds,
          tags: syncedTags
            .filter(tag => tag.name.trim())
            .map(tag => ({
              categoryId: tag.categoryId,
              optionId: tag.optionId,
              name: tag.name.trim(),
              isCustom: tag.source === 'candidate' || tag.isCustom,
            })),
          createdAt: this.data.existingRecord ? this.data.existingRecord.createdAt : now,
          updatedAt: now,
        };
        await saveDiary(record);
        clearDiaryDraft(this.data.date);
        this.setData({ tagPanelVisible: false });
        wx.showToast({ title: '日记已保存', icon: 'success' });
        setTimeout(() => {
          if (getCurrentPages().length > 1) {
            wx.navigateBack();
          } else {
            wx.redirectTo({ url: '/pages/diary-home/diary-home' });
          }
        }, 800);
      } catch (e) {
        console.warn('保存日记失败', e);
        wx.showModal({
          title: '保存失败',
          content: `草稿和照片已保留。\n\n错误：${formatSaveError(e)}`,
          showCancel: false,
          confirmText: '知道了',
        });
      } finally {
        this.setData({ saving: false });
      }
    },
  },
});
