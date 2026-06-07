import { Option, OptionGroup, encodeShareData, ShareData, Category } from '../../data/categories';
import { buildCustomOptionId, mergeCustomOptions, normalizeOptionName } from '../../utils/categoryOptions';
import { applyOptionOrder, moveOptionInGroups, readOptionOrder, saveGroupOptionOrder } from '../../utils/optionOrder';
import { deleteCustomOption, listCustomOptions, upsertCustomOptions } from '../../services/customOptions';

const INITIAL_CATEGORIES = mergeCustomOptions([]);

const app = getApp<{
  globalData: {
    nickname: string;
    selections: Record<string, Option[]>;
    partnerShareData: ShareData | null;
  };
  saveSelections(): void;
}>();

let customCounter = 1;

function buildOrderedGroups(category: Category): OptionGroup[] {
  return applyOptionOrder(category.optionGroups, category.id, readOptionOrder());
}

function flattenGroups(groups: OptionGroup[]): Option[] {
  return groups.reduce((all, group) => all.concat(group.options), [] as Option[]);
}

Component({
  data: {
    categories: INITIAL_CATEGORIES,
    currentCategoryId: INITIAL_CATEGORIES[0].id,
    currentCategory: INITIAL_CATEGORIES[0],
    currentOptions: INITIAL_CATEGORIES[0].options.map(o => ({ ...o })),
    currentOptionGroups: INITIAL_CATEGORIES[0].optionGroups.map(group => ({
      ...group,
      options: group.options.map(o => ({ ...o })),
    })) as OptionGroup[],
    currentCustomOptions: [] as Option[],
    selectedIds: {} as Record<string, boolean>,
    selectedCounts: {} as Record<string, number>,
    inputValue: '',
    totalCount: 0,
    sortMode: false,
    returnToPartnerWelcome: false,
  },

  lifetimes: {
    attached() {
      this.loadShareDataIfPresent();
    },
    ready() {
      this.refreshSelectionState();
      this.loadCustomCategoryOptions();
    },
  },

  pageLifetimes: {
    show() {
      this.loadShareDataIfPresent();
      this.refreshSelectionState();
    },
  },

  methods: {
    onLoad(options: Record<string, string>) {
      this.setData({ returnToPartnerWelcome: options.returnTo === 'partnerWelcome' });
    },

    isPartnerWelcomeReturnRoute(): boolean {
      if (this.data.returnToPartnerWelcome) return true;
      const pages = getCurrentPages();
      const current = pages[pages.length - 1] as WechatMiniprogram.Page.Instance<Record<string, unknown>, Record<string, unknown>> & { options?: Record<string, string> };
      return !!current && current.options && current.options.returnTo === 'partnerWelcome';
    },

    loadShareDataIfPresent() {
      const g = app.globalData;
      if (g.partnerShareData) {
        const sel: Record<string, Option[]> = {};
        g.partnerShareData.selections.forEach(s => {
          sel[s.categoryId] = s.options.map(o => ({ ...o }));
        });
        g.selections = sel;
        app.saveSelections();
        if (!this.isPartnerWelcomeReturnRoute()) {
          g.partnerShareData = null;
        }
      }
    },

    onNavBack() {
      if (this.data.returnToPartnerWelcome) {
        if (getCurrentPages().length > 2) {
          wx.navigateBack({ delta: 2 });
        } else {
          wx.reLaunch({ url: '/pages/welcome/welcome' });
        }
        return;
      }
      if (getCurrentPages().length > 1) {
        wx.navigateBack();
      } else {
        wx.reLaunch({ url: '/pages/welcome/welcome' });
      }
    },

    refreshSelectionState() {
      const g = app.globalData;
      const sel = g.selections;
      const counts: Record<string, number> = {};
      let total = 0;
      Object.entries(sel).forEach(([catId, opts]) => {
        counts[catId] = opts.length;
        total += opts.length;
      });
      this.setData({ selectedCounts: counts, totalCount: total });
      this.refreshCurrentOptions();
    },

    async loadCustomCategoryOptions() {
      const customOptions = await listCustomOptions();
      const categories = mergeCustomOptions(customOptions);
      const currentCategory = categories.find(cat => cat.id === this.data.currentCategoryId) || categories[0];
      const currentOptionGroups = buildOrderedGroups(currentCategory);
      this.setData({
        categories,
        currentCategoryId: currentCategory.id,
        currentCategory,
        currentOptions: flattenGroups(currentOptionGroups),
        currentOptionGroups,
      });
      this.refreshSelectionState();
    },

    selectCategory(catId: string) {
      const cat = (this.data.categories as Category[]).find(c => c.id === catId);
      if (!cat || catId === this.data.currentCategoryId) return;
      const currentOptionGroups = buildOrderedGroups(cat);
      this.setData({
        currentCategoryId: catId,
        currentCategory: cat,
        currentOptions: flattenGroups(currentOptionGroups),
        currentOptionGroups,
        inputValue: '',
        sortMode: false,
      });
      this.refreshCurrentOptions();
    },

    refreshCurrentOptions() {
      const catId = this.data.currentCategoryId;
      const currentOpts = app.globalData.selections[catId] || [];
      const presetById: Record<string, Option> = {};
      const presetByName: Record<string, Option> = {};
      this.data.currentOptions.forEach(o => {
        presetById[o.id] = o;
        presetByName[o.name] = o;
      });
      const presetSelected: Record<string, boolean> = {};
      const customOpts: Option[] = [];
      let shouldSave = false;
      currentOpts.forEach((o, index) => {
        const preset = presetById[o.id] || presetByName[o.name];
        if (preset) {
          presetSelected[preset.id] = true;
          if (preset.id !== o.id || o.isCustom) {
            currentOpts[index] = preset;
            shouldSave = true;
          }
          return;
        }

        const fallbackOption = o.isCustom ? o : { ...o, isCustom: true };
        customOpts.push(fallbackOption);
        presetSelected[fallbackOption.id] = true;
      });
      if (shouldSave) app.saveSelections();
      this.setData({ selectedIds: presetSelected, currentCustomOptions: customOpts });
    },

    onSelectCategory(e: WechatMiniprogram.TouchEvent) {
      this.selectCategory(e.currentTarget.dataset.id as string);
    },

    toggleSortMode() {
      this.setData({ sortMode: !this.data.sortMode });
    },

    onMoveOption(e: WechatMiniprogram.TouchEvent) {
      const groupId = e.currentTarget.dataset.groupId as string;
      const optionId = e.currentTarget.dataset.optionId as string;
      const direction = e.currentTarget.dataset.direction as 'up' | 'down';
      const currentOptionGroups = moveOptionInGroups(this.data.currentOptionGroups, groupId, optionId, direction);
      const group = currentOptionGroups.find(item => item.id === groupId);
      if (group) saveGroupOptionOrder(this.data.currentCategoryId, groupId, group.options.map(option => option.id));
      this.setData({
        currentOptionGroups,
        currentOptions: flattenGroups(currentOptionGroups),
      });
      this.refreshCurrentOptions();
    },

    onToggleOption(e: WechatMiniprogram.TouchEvent) {
      if (this.data.sortMode) return;
      const option = e.currentTarget.dataset.option as Option;
      if (!option) return;
      const g = app.globalData;
      const catId = this.data.currentCategoryId;
      if (!g.selections[catId]) g.selections[catId] = [];

      const sel = g.selections[catId];
      const idx = sel.findIndex(o => o.id === option.id);
      const selectedIds = { ...this.data.selectedIds };

      if (idx >= 0) {
        sel.splice(idx, 1);
        if (option.isCustom) {
          selectedIds[option.id] = false;
          this.setData({ currentCustomOptions: this.data.currentCustomOptions.filter(o => o.id !== option.id) });
        } else {
          selectedIds[option.id] = false;
        }
      } else {
        sel.push(option);
        if (!option.isCustom) selectedIds[option.id] = true;
      }
      if (sel.length === 0) delete g.selections[catId];

      app.saveSelections();
      let total = 0;
      const counts: Record<string, number> = {};
      Object.entries(g.selections).forEach(([cid, opts]) => {
        counts[cid] = opts.length;
        total += opts.length;
      });
      this.setData({ selectedIds, selectedCounts: counts, totalCount: total });
    },

    onCustomInput(e: WechatMiniprogram.Input) {
      this.setData({ inputValue: e.detail.value });
    },

    async onAddCustom() {
      const name = this.data.inputValue.trim();
      if (!name) return;
      const normalizedName = normalizeOptionName(name);
      const existing = this.data.currentOptions.find(option => normalizeOptionName(option.name) === normalizedName);
      if (existing) {
        this.selectOptionIfNeeded(existing);
        this.setData({ inputValue: '' });
        return;
      }

      try {
        await upsertCustomOptions([{ categoryId: this.data.currentCategoryId, name }]);
        await this.loadCustomCategoryOptions();
        const cloudOptionId = buildCustomOptionId(this.data.currentCategoryId, normalizedName);
        const cloudOption = this.data.currentOptions.find(option => option.id === cloudOptionId);
        if (cloudOption) this.selectOptionIfNeeded(cloudOption);
        this.setData({ inputValue: '' });
      } catch (e) {
        console.warn('新增共享标签失败，已保留为本地自定义', e);
        const customOption: Option = { id: `custom_${Date.now()}_${customCounter++}`, name, emoji: '', isCustom: true };
        this.addLocalCustomOption(customOption);
        wx.showToast({ title: '云端新增失败，已临时添加', icon: 'none' });
      }
    },

    selectOptionIfNeeded(option: Option) {
      const g = app.globalData;
      const catId = this.data.currentCategoryId;
      if (!g.selections[catId]) g.selections[catId] = [];
      if (!g.selections[catId].some(item => item.id === option.id)) {
        g.selections[catId].push(option);
      }
      this.updateSelectionSummary({ ...this.data.selectedIds, [option.id]: true });
    },

    addLocalCustomOption(customOption: Option) {
      const g = app.globalData;
      const catId = this.data.currentCategoryId;
      if (!g.selections[catId]) g.selections[catId] = [];
      g.selections[catId].push(customOption);

      const customOpts = [...this.data.currentCustomOptions, customOption];
      this.setData({
        currentCustomOptions: customOpts,
        inputValue: '',
      });
      this.updateSelectionSummary({ ...this.data.selectedIds, [customOption.id]: true });
    },

    updateSelectionSummary(selectedIds: Record<string, boolean>) {
      const g = app.globalData;
      let total = 0;
      const counts: Record<string, number> = {};
      Object.entries(g.selections).forEach(([cid, opts]) => {
        counts[cid] = opts.length;
        total += opts.length;
      });
      app.saveSelections();
      this.setData({
        selectedIds,
        selectedCounts: counts,
        totalCount: total,
      });
    },

    onDeleteCustom(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string;
      const g = app.globalData;
      const catId = this.data.currentCategoryId;
      if (g.selections[catId]) {
        g.selections[catId] = g.selections[catId].filter(o => o.id !== id);
        if (g.selections[catId].length === 0) delete g.selections[catId];
      }
      const selectedIds = { ...this.data.selectedIds };
      delete selectedIds[id];
      let total = 0;
      const counts: Record<string, number> = {};
      Object.entries(g.selections).forEach(([cid, opts]) => {
        counts[cid] = opts.length;
        total += opts.length;
      });
      app.saveSelections();
      this.setData({
        currentCustomOptions: this.data.currentCustomOptions.filter(o => o.id !== id),
        selectedIds,
        selectedCounts: counts,
        totalCount: total,
      });
    },

    onDeleteCloudCustom(e: WechatMiniprogram.TouchEvent) {
      const option = e.currentTarget.dataset.option as Option;
      if (!option || !option.canDelete) return;
      wx.showModal({
        title: '删除标签',
        content: `确定删除「${option.name}」吗？`,
        confirmText: '删除',
        confirmColor: '#FF6B81',
        success: async res => {
          if (!res.confirm) return;
          try {
            await deleteCustomOption(this.data.currentCategoryId, option.name);
            this.removeOptionFromSelections(option.id);
            await this.loadCustomCategoryOptions();
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (err) {
            console.warn('删除共享标签失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        },
      });
    },

    removeOptionFromSelections(optionId: string) {
      const g = app.globalData;
      const catId = this.data.currentCategoryId;
      if (g.selections[catId]) {
        g.selections[catId] = g.selections[catId].filter(o => o.id !== optionId);
        if (g.selections[catId].length === 0) delete g.selections[catId];
      }
      app.saveSelections();
    },

    onShareAppMessage() {
      const g = app.globalData;
      const selections = Object.entries(g.selections)
        .filter(([_, opts]) => opts.length > 0)
        .map(([catId, opts]) => {
          const cat = (this.data.categories as Category[]).find(c => c.id === catId);
          return { categoryId: catId, categoryName: cat ? cat.name : '', options: opts };
        });
      if (selections.length === 0) return { title: '今天干什么？', path: '/pages/result/result' };
      const shareData: ShareData = { fromUser: g.nickname || '我', selections, timestamp: Date.now(), mode: 'selection' };
      return {
        title: `${g.nickname || '我'} 发来了今日选择 💌`,
        path: `/pages/welcome/welcome?data=${encodeShareData(shareData)}`,
      };
    },
  },
});
