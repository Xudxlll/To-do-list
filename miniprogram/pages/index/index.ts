import { Option, OptionGroup, encodeShareData, ShareData, Category } from '../../data/categories';
import { mergeCustomOptions } from '../../utils/categoryOptions';
import { listCustomOptions } from '../../services/customOptions';

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
    loadShareDataIfPresent() {
      const g = app.globalData;
      if (g.partnerShareData) {
        const sel: Record<string, Option[]> = {};
        g.partnerShareData.selections.forEach(s => {
          sel[s.categoryId] = s.options.map(o => ({ ...o }));
        });
        g.selections = sel;
        app.saveSelections();
        g.partnerShareData = null;
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
      this.setData({
        categories,
        currentCategoryId: currentCategory.id,
        currentCategory,
        currentOptions: currentCategory.options.map(o => ({ ...o })),
        currentOptionGroups: currentCategory.optionGroups.map(group => ({
          ...group,
          options: group.options.map(o => ({ ...o })),
        })),
      });
      this.refreshSelectionState();
    },

    selectCategory(catId: string) {
      const cat = (this.data.categories as Category[]).find(c => c.id === catId);
      if (!cat || catId === this.data.currentCategoryId) return;
      this.setData({
        currentCategoryId: catId,
        currentCategory: cat,
        currentOptions: cat.options.map(o => ({ ...o })),
        currentOptionGroups: cat.optionGroups.map(group => ({
          ...group,
          options: group.options.map(o => ({ ...o })),
        })),
        inputValue: '',
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
        const preset = o.isCustom ? null : presetById[o.id] || presetByName[o.name];
        if (preset) {
          presetSelected[preset.id] = true;
          if (preset.id !== o.id) {
            currentOpts[index] = preset;
            shouldSave = true;
          }
          return;
        }

        const fallbackOption = o.isCustom ? o : { ...o, isCustom: true };
        customOpts.push(fallbackOption);
        presetSelected[fallbackOption.id] = true;
        if (!o.isCustom) {
          currentOpts[index] = fallbackOption;
          shouldSave = true;
        }
      });
      if (shouldSave) app.saveSelections();
      this.setData({ selectedIds: presetSelected, currentCustomOptions: customOpts });
    },

    onSelectCategory(e: WechatMiniprogram.TouchEvent) {
      this.selectCategory(e.currentTarget.dataset.id as string);
    },

    onToggleOption(e: WechatMiniprogram.TouchEvent) {
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

    onAddCustom() {
      const name = this.data.inputValue.trim();
      if (!name) return;
      const customOption: Option = { id: `custom_${Date.now()}_${customCounter++}`, name, emoji: '', isCustom: true };
      const g = app.globalData;
      const catId = this.data.currentCategoryId;
      if (!g.selections[catId]) g.selections[catId] = [];
      g.selections[catId].push(customOption);

      const customOpts = [...this.data.currentCustomOptions, customOption];
      let total = 0;
      const counts: Record<string, number> = {};
      Object.entries(g.selections).forEach(([cid, opts]) => {
        counts[cid] = opts.length;
        total += opts.length;
      });
      app.saveSelections();
      this.setData({
        currentCustomOptions: customOpts,
        inputValue: '',
        selectedIds: { ...this.data.selectedIds, [customOption.id]: true },
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
