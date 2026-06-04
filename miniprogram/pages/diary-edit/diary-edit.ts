import { Category } from '../../data/categories';
import { listCustomOptions, upsertCustomOptions } from '../../services/customOptions';
import { getDiaryByDate, saveDiary, uploadDiaryPhotos } from '../../services/diaries';
import { DiaryDraft, DiaryRecord, MOODS, MoodId, RecognizedTag } from '../../types/diary';
import { buildCustomOptionId, mergeCustomOptions, normalizeOptionName } from '../../utils/categoryOptions';
import { clearDiaryDraft, readDiaryDraft, saveDiaryDraft } from '../../utils/diaryDraft';
import { recognizeDiaryTags } from '../../utils/diaryTags';
import { isFutureDate, todayString } from '../../utils/date';

Component({
  data: {
    date: todayString(),
    loading: true,
    saving: false,
    content: '',
    mood: 'happy' as MoodId,
    location: '',
    localPhotoPaths: [] as string[],
    existingPhotoFileIds: [] as string[],
    moods: MOODS,
    tagPanelVisible: false,
    recognizedTags: [] as RecognizedTag[],
    tagCategories: [] as Array<{ id: string; name: string }>,
    tagCategoryNames: [] as string[],
    existingRecord: null as DiaryRecord | null,
  },

  lifetimes: {
    attached() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const opts = (page as { options?: Record<string, string> }).options || {};
      const date = opts.date || todayString();
      if (isFutureDate(date)) {
        wx.showToast({ title: '未来日期还不能写哦', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.setData({ date });
      this.loadDiary(date);
    },
  },

  methods: {
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
          this.setData({
            existingRecord: record,
            content: record.content,
            mood: record.mood,
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
      this.setData({
        content: draft.content,
        mood: draft.mood,
        location: draft.location,
        localPhotoPaths: draft.localPhotoPaths,
        existingPhotoFileIds: draft.existingPhotoFileIds,
      });
    },

    persistDraft() {
      saveDiaryDraft({
        date: this.data.date,
        content: this.data.content,
        mood: this.data.mood,
        location: this.data.location,
        localPhotoPaths: this.data.localPhotoPaths,
        existingPhotoFileIds: this.data.existingPhotoFileIds,
        updatedAt: Date.now(),
      });
    },

    onContentInput(e: WechatMiniprogram.Input) {
      this.setData({ content: e.detail.value });
      this.persistDraft();
    },

    onLocationInput(e: WechatMiniprogram.Input) {
      this.setData({ location: e.detail.value });
      this.persistDraft();
    },

    onMoodTap(e: WechatMiniprogram.TouchEvent) {
      this.setData({ mood: e.currentTarget.dataset.id as MoodId });
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

    async onSaveTap() {
      if (!this.data.content.trim()) {
        wx.showToast({ title: '先写一点内容吧', icon: 'none' });
        return;
      }
      const customOptions = await listCustomOptions();
      const categories = mergeCustomOptions(customOptions);
      const recognizedTags = recognizeDiaryTags(this.data.content, categories);
      const tagCategories = categories.map((cat: Category) => ({ id: cat.id, name: cat.name }));
      this.setData({
        recognizedTags,
        tagCategories,
        tagCategoryNames: tagCategories.map(cat => cat.name),
        tagPanelVisible: true,
      });
    },

    onTagNameInput(e: WechatMiniprogram.Input) {
      const index = e.currentTarget.dataset.index as number;
      const tags = this.data.recognizedTags.slice();
      const tag = tags[index];
      const name = e.detail.value;
      const normalizedName = normalizeOptionName(name);
      tags[index] = {
        ...tag,
        name,
        optionId: tag.source === 'candidate' ? buildCustomOptionId(tag.categoryId, normalizedName) : tag.optionId,
      };
      this.setData({ recognizedTags: tags });
    },

    onTagCategoryChange(e: WechatMiniprogram.PickerChange) {
      const index = e.currentTarget.dataset.index as number;
      const categoryIndex = Number(e.detail.value);
      const category = this.data.tagCategories[categoryIndex];
      if (!category) return;
      const tags = this.data.recognizedTags.slice();
      const tag = tags[index];
      const normalizedName = normalizeOptionName(tag.name);
      tags[index] = {
        ...tag,
        categoryId: category.id,
        categoryName: category.name,
        optionId: buildCustomOptionId(category.id, normalizedName),
        source: 'candidate',
        isCustom: true,
        editable: true,
      };
      this.setData({ recognizedTags: tags });
    },

    removeTag(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index as number;
      this.setData({ recognizedTags: this.data.recognizedTags.filter((_, i) => i !== index) });
    },

    closeTagPanel() {
      this.setData({ tagPanelVisible: false });
    },

    async confirmSave() {
      this.setData({ saving: true });
      try {
        const candidateTags = this.data.recognizedTags.filter(tag => tag.source === 'candidate' && tag.name.trim());
        await upsertCustomOptions(candidateTags.map(tag => ({ categoryId: tag.categoryId, name: tag.name })));
        const uploadedFileIds = await uploadDiaryPhotos(this.data.date, this.data.localPhotoPaths);
        const photoFileIds = this.data.existingPhotoFileIds.concat(uploadedFileIds).slice(0, 3);
        const now = Date.now();
        const record: DiaryRecord = {
          _id: this.data.existingRecord ? this.data.existingRecord._id : undefined,
          date: this.data.date,
          content: this.data.content.trim(),
          mood: this.data.mood,
          location: this.data.location.trim(),
          photoFileIds,
          tags: this.data.recognizedTags
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
        wx.showToast({ title: '日记已保存', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } catch (e) {
        console.warn('保存日记失败', e);
        wx.showToast({ title: '保存失败，草稿已保留', icon: 'none' });
      } finally {
        this.setData({ saving: false, tagPanelVisible: false });
      }
    },
  },
});
