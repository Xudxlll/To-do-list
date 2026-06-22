import {
  Category,
  encodeShareData,
  hydrateSharedOption,
  Option,
  OptionGroup,
  Selection,
  ShareData,
} from '../../data/categories';
import {
  createSharedOption,
  deleteSharedOption,
  listOptionCatalogRecords,
  readOptionCatalogCache,
  updateSharedOption,
} from '../../services/customOptions';
import { OptionCatalogRecord, OptionSearchResult, OptionValidationCode } from '../../types/options';
import { buildCatalog, reconcileSelections, searchCatalog } from '../../utils/optionCatalog';
import { collapseAllGroups, CollapsedGroupMap, isGroupCollapsed, toggleGroup } from '../../utils/optionManagement';
import { readOptionOrder } from '../../utils/optionOrder';

type GroupViewModel = OptionGroup & { collapsed: boolean };
type EditorMode = 'create' | 'edit';

const COLLAPSED_STORAGE_KEY = 'categoryCollapsedGroups:v1';
const INITIAL_CATEGORIES = buildCatalog([], readOptionOrder());

const app = getApp<{
  globalData: {
    nickname: string;
    selections: Record<string, Option[]>;
    partnerShareData: ShareData | null;
  };
  saveSelections(): void;
}>();

function cloneOption(option: Option): Option {
  return { ...option };
}

function cloneOptions(options: Option[]): Option[] {
  return options.map(cloneOption);
}

function getCategoryName(categories: Category[], categoryId: string): string {
  return categories.find(category => category.id === categoryId)?.name || '';
}

function recordToSelectionList(categories: Category[], selectionsRecord: Record<string, Option[]>): Selection[] {
  return Object.entries(selectionsRecord)
    .filter(([_, options]) => Array.isArray(options) && options.length > 0)
    .map(([categoryId, options]) => ({
      categoryId,
      categoryName: getCategoryName(categories, categoryId),
      options: cloneOptions(options),
    }));
}

function selectionListToRecord(selections: Selection[]): Record<string, Option[]> {
  return selections.reduce((record, selection) => {
    if (!Array.isArray(selection.options) || selection.options.length === 0) {
      return record;
    }
    record[selection.categoryId] = selection.options
      .filter(option => typeof option.groupId === 'string' && option.groupId.length > 0)
      .map(option => ({
        id: option.id,
        groupId: option.groupId as string,
        name: option.name,
        emoji: option.emoji,
        isCustom: option.isCustom,
        canDelete: option.canDelete,
        description: option.description,
      }));
    return record;
  }, {} as Record<string, Option[]>);
}

function summarizeSelections(selectionsRecord: Record<string, Option[]>) {
  const selectedIds: Record<string, boolean> = {};
  const selectedCounts: Record<string, number> = {};
  let totalCount = 0;

  Object.entries(selectionsRecord).forEach(([categoryId, options]) => {
    selectedCounts[categoryId] = options.length;
    totalCount += options.length;
    options.forEach(option => {
      selectedIds[option.id] = true;
    });
  });

  return { selectedIds, selectedCounts, totalCount };
}

function buildCurrentGroups(
  category: Category,
  collapsedGroups: CollapsedGroupMap
): GroupViewModel[] {
  return category.optionGroups.map(group => ({
    ...group,
    options: cloneOptions(group.options),
    collapsed: isGroupCollapsed(category.id, group.id, collapsedGroups),
  }));
}

function readCollapsedGroups(): CollapsedGroupMap {
  try {
    const value = wx.getStorageSync(COLLAPSED_STORAGE_KEY);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.keys(value).reduce((map, key) => {
      map[key] = Boolean((value as Record<string, unknown>)[key]);
      return map;
    }, {} as CollapsedGroupMap);
  } catch {
    return {};
  }
}

function saveCollapsedGroups(collapsedGroups: CollapsedGroupMap): void {
  try {
    wx.setStorageSync(COLLAPSED_STORAGE_KEY, collapsedGroups);
  } catch {
    // storage 异常不阻断浏览和管理流程
  }
}

function findOptionById(categories: Category[], optionId: string): Option | undefined {
  for (const category of categories) {
    for (const group of category.optionGroups) {
      const found = group.options.find(option => option.id === optionId);
      if (found) return found;
    }
  }
  return undefined;
}

function getValidationMessage(code?: string): string {
  const messageMap: Record<string, string> = {
    empty: '请先输入活动名称',
    too_long: '活动名称最多 30 个字',
    description_too_long: '补充说明最多 160 个字',
    category: '当前分类无效，请重新选择',
    group: '当前分组无效，请重新选择',
    duplicate: '这个活动已经存在了',
  };
  return messageMap[code || ''] || '保存失败，请稍后再试';
}

Component({
  data: {
    catalogRecords: [] as OptionCatalogRecord[],
    categories: INITIAL_CATEGORIES,
    currentCategoryId: INITIAL_CATEGORIES[0].id,
    currentCategory: INITIAL_CATEGORIES[0],
    currentOptionGroups: buildCurrentGroups(INITIAL_CATEGORIES[0], {}),
    selectedIds: {} as Record<string, boolean>,
    selectedCounts: {} as Record<string, number>,
    totalCount: 0,
    manageMode: false,
    collapsedGroups: {} as CollapsedGroupMap,
    allGroupsCollapsed: false,
    searchQuery: '',
    searchResults: [] as OptionSearchResult[],
    editorVisible: false,
    editorMode: 'create' as EditorMode,
    editingOptionId: '',
    editorCategoryId: '',
    editorCategoryName: '',
    editorGroupId: '',
    editorGroupName: '',
    editorName: '',
    editorDescription: '',
    editorSaving: false,
    scrollIntoView: '',
    returnToPartnerWelcome: false,
  },

  lifetimes: {
    attached() {
      this.loadShareDataIfPresent();
      this.setData({ collapsedGroups: readCollapsedGroups() });
    },
    ready() {
      void this.loadOptionCatalog();
    },
  },

  pageLifetimes: {
    show() {
      this.loadShareDataIfPresent();
      this.renderCatalog(readOptionCatalogCache(), {
        collapsedGroups: this.data.collapsedGroups,
        searchQuery: this.data.searchQuery,
      });
    },
  },

  methods: {
    onLoad(options: Record<string, string>) {
      this.setData({ returnToPartnerWelcome: options.returnTo === 'partnerWelcome' });
    },

    isPartnerWelcomeReturnRoute(): boolean {
      if (this.data.returnToPartnerWelcome) return true;
      const pages = getCurrentPages();
      const current = pages[pages.length - 1] as WechatMiniprogram.Page.Instance<Record<string, unknown>, Record<string, unknown>> & {
        options?: Record<string, string>;
      };
      return !!current && current.options?.returnTo === 'partnerWelcome';
    },

    loadShareDataIfPresent() {
      const globalData = app.globalData;
      if (!globalData.partnerShareData) return;

      const nextSelections: Record<string, Option[]> = {};
      globalData.partnerShareData.selections.forEach(selection => {
        nextSelections[selection.categoryId] = selection.options.map(option => hydrateSharedOption(selection.categoryId, option));
      });
      globalData.selections = nextSelections;
      app.saveSelections();

      if (!this.isPartnerWelcomeReturnRoute()) {
        globalData.partnerShareData = null;
      }
    },

    async loadOptionCatalog() {
      const legacyOrder = readOptionOrder();
      const cachedRecords = readOptionCatalogCache();
      this.renderCatalog(cachedRecords, { legacyOrder, collapsedGroups: this.data.collapsedGroups });

      try {
        const catalogRecords = await listOptionCatalogRecords();
        this.renderCatalog(catalogRecords, {
          legacyOrder,
          collapsedGroups: this.data.collapsedGroups,
          searchQuery: this.data.searchQuery,
        });
      } catch (error) {
        console.warn('加载活动目录失败，已回退到缓存/默认目录', error);
        wx.showToast({
          title: '活动目录刷新失败，先用当前内容',
          icon: 'none',
        });
      }
    },

    renderCatalog(
      records: OptionCatalogRecord[],
      options: {
        categoryId?: string;
        collapsedGroups?: CollapsedGroupMap;
        searchQuery?: string;
        legacyOrder?: Record<string, string[]>;
        scrollIntoView?: string;
      } = {}
    ) {
      const categories = buildCatalog(records, options.legacyOrder || readOptionOrder());
      const currentSelectionList = recordToSelectionList(categories, app.globalData.selections || {});
      const reconciledSelections = reconcileSelections(categories, currentSelectionList);
      const nextSelections = selectionListToRecord(reconciledSelections);
      if (JSON.stringify(app.globalData.selections || {}) !== JSON.stringify(nextSelections)) {
        app.globalData.selections = nextSelections;
        app.saveSelections();
      }

      const collapsedGroups = options.collapsedGroups || this.data.collapsedGroups || {};
      const categoryId = categories.some(category => category.id === (options.categoryId || this.data.currentCategoryId))
        ? (options.categoryId || this.data.currentCategoryId)
        : categories[0].id;
      const currentCategory = categories.find(category => category.id === categoryId) || categories[0];
      const currentOptionGroups = buildCurrentGroups(currentCategory, collapsedGroups);
      const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery : this.data.searchQuery;
      const searchResults = searchQuery.trim() ? searchCatalog(categories, searchQuery) : [];
      const { selectedIds, selectedCounts, totalCount } = summarizeSelections(nextSelections);

      this.setData({
        catalogRecords: records,
        categories,
        currentCategoryId: categoryId,
        currentCategory,
        currentOptionGroups,
        selectedIds,
        selectedCounts,
        totalCount,
        collapsedGroups,
        allGroupsCollapsed: currentOptionGroups.length > 0 && currentOptionGroups.every(group => group.collapsed),
        searchQuery,
        searchResults,
        scrollIntoView: typeof options.scrollIntoView === 'string' ? options.scrollIntoView : this.data.scrollIntoView,
      });
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

    selectCategory(categoryId: string) {
      if (categoryId === this.data.currentCategoryId) return;
      this.renderCatalog(this.data.catalogRecords, {
        categoryId,
        collapsedGroups: this.data.collapsedGroups,
        searchQuery: this.data.searchQuery,
        scrollIntoView: '',
      });
    },

    onSelectCategory(e: WechatMiniprogram.TouchEvent) {
      const categoryId = e.currentTarget.dataset.id as string;
      if (!categoryId) return;
      this.selectCategory(categoryId);
    },

    toggleManagementMode() {
      this.setData({
        manageMode: !this.data.manageMode,
        scrollIntoView: '',
      });
    },

    toggleOptionGroup(e: WechatMiniprogram.TouchEvent) {
      const groupId = e.currentTarget.dataset.groupId as string;
      if (!groupId) return;
      const nextCollapsedGroups = toggleGroup(this.data.currentCategoryId, groupId, this.data.collapsedGroups);
      saveCollapsedGroups(nextCollapsedGroups);
      this.renderCatalog(this.data.catalogRecords, {
        categoryId: this.data.currentCategoryId,
        collapsedGroups: nextCollapsedGroups,
        searchQuery: this.data.searchQuery,
      });
    },

    collapseAllOptionGroups() {
      const categoryId = this.data.currentCategoryId;
      const currentGroups = this.data.currentOptionGroups.map(group => ({
        id: group.id,
        title: group.title,
        options: cloneOptions(group.options),
      }));
      let nextCollapsedGroups: CollapsedGroupMap;

      if (this.data.allGroupsCollapsed) {
        nextCollapsedGroups = { ...this.data.collapsedGroups };
        currentGroups.forEach(group => {
          delete nextCollapsedGroups[`${categoryId}:${group.id}`];
        });
      } else {
        nextCollapsedGroups = collapseAllGroups(categoryId, currentGroups, this.data.collapsedGroups);
      }

      saveCollapsedGroups(nextCollapsedGroups);
      this.renderCatalog(this.data.catalogRecords, {
        categoryId,
        collapsedGroups: nextCollapsedGroups,
        searchQuery: this.data.searchQuery,
      });
    },

    onToggleOption(e: WechatMiniprogram.TouchEvent) {
      if (this.data.manageMode) return;
      const option = e.currentTarget.dataset.option as Option;
      if (!option) return;

      const selections = { ...(app.globalData.selections || {}) };
      const categoryId = this.data.currentCategoryId;
      const current = cloneOptions(selections[categoryId] || []);
      const existingIndex = current.findIndex(item => item.id === option.id);

      if (existingIndex >= 0) {
        current.splice(existingIndex, 1);
      } else {
        current.push(cloneOption(option));
      }

      if (current.length > 0) {
        selections[categoryId] = current;
      } else {
        delete selections[categoryId];
      }

      app.globalData.selections = selections;
      app.saveSelections();
      this.renderCatalog(this.data.catalogRecords, {
        categoryId,
        collapsedGroups: this.data.collapsedGroups,
        searchQuery: this.data.searchQuery,
      });
    },

    onSearchInput(e: WechatMiniprogram.Input) {
      const searchQuery = e.detail.value || '';
      this.renderCatalog(this.data.catalogRecords, {
        categoryId: this.data.currentCategoryId,
        collapsedGroups: this.data.collapsedGroups,
        searchQuery,
        scrollIntoView: '',
      });
    },

    onSearchResultTap(e: WechatMiniprogram.TouchEvent) {
      const result = e.currentTarget.dataset.result as OptionSearchResult;
      if (!result) return;

      const nextCollapsedGroups = { ...this.data.collapsedGroups };
      delete nextCollapsedGroups[`${result.categoryId}:${result.groupId}`];
      saveCollapsedGroups(nextCollapsedGroups);

      if (this.data.manageMode) {
        this.renderCatalog(this.data.catalogRecords, {
          categoryId: result.categoryId,
          collapsedGroups: nextCollapsedGroups,
          searchQuery: '',
          scrollIntoView: '',
        });
        this.focusOption(result.option.id);
        this.openOptionEditor({
          currentTarget: {
            dataset: {
              categoryId: result.categoryId,
              groupId: result.groupId,
              option: result.option,
            },
          },
        } as unknown as WechatMiniprogram.TouchEvent);
        return;
      }

      const selections = { ...(app.globalData.selections || {}) };
      const current = cloneOptions(selections[result.categoryId] || []);
      if (!current.some(option => option.id === result.option.id)) {
        current.push(cloneOption(result.option));
        selections[result.categoryId] = current;
        app.globalData.selections = selections;
        app.saveSelections();
      }

      this.renderCatalog(this.data.catalogRecords, {
        categoryId: result.categoryId,
        collapsedGroups: nextCollapsedGroups,
        searchQuery: '',
        scrollIntoView: '',
      });
      this.focusOption(result.option.id);
    },

    focusOption(optionId: string) {
      this.setData({ scrollIntoView: '' }, () => {
        this.setData({ scrollIntoView: `option-${optionId}` });
      });
    },

    openOptionEditor(e: WechatMiniprogram.TouchEvent) {
      const categoryId = (e.currentTarget.dataset.categoryId as string) || this.data.currentCategoryId;
      const groupId = e.currentTarget.dataset.groupId as string;
      const option = e.currentTarget.dataset.option as Option | undefined;
      if (!groupId) return;

      const category = this.data.categories.find(item => item.id === categoryId);
      const group = category?.optionGroups.find(item => item.id === groupId);
      if (!category || !group) return;

      this.setData({
        editorVisible: true,
        editorMode: option ? 'edit' : 'create',
        editingOptionId: option?.id || '',
        editorCategoryId: category.id,
        editorCategoryName: category.name,
        editorGroupId: group.id,
        editorGroupName: group.title,
        editorName: option?.name || '',
        editorDescription: option?.description || '',
        editorSaving: false,
      });
    },

    closeOptionEditor(force = false) {
      if (this.data.editorSaving && !force) return;
      this.setData({
        editorVisible: false,
        editorMode: 'create',
        editingOptionId: '',
        editorCategoryId: '',
        editorCategoryName: '',
        editorGroupId: '',
        editorGroupName: '',
        editorName: '',
        editorDescription: '',
      });
    },

    noop() {},

    onEditorNameInput(e: WechatMiniprogram.Input) {
      const editorName = (e.detail.value || '').slice(0, 30);
      this.setData({ editorName });
    },

    onEditorDescriptionInput(e: WechatMiniprogram.Input) {
      const editorDescription = (e.detail.value || '').slice(0, 160);
      this.setData({ editorDescription });
    },

    async saveOptionEditor() {
      if (this.data.editorSaving) return;
      const wasEdit = this.data.editorMode === 'edit';

      const input = {
        categoryId: this.data.editorCategoryId,
        groupId: this.data.editorGroupId,
        name: this.data.editorName.trim(),
        description: this.data.editorDescription.trim(),
      };

      if (!input.categoryId || !input.groupId) {
        wx.showToast({ title: '当前分组无效，请重新打开', icon: 'none' });
        return;
      }

      this.setData({ editorSaving: true });

      try {
        if (wasEdit) {
          const editingOption = findOptionById(this.data.categories, this.data.editingOptionId);
          if (!editingOption) {
            throw Object.assign(new Error('未找到待编辑活动'), { code: 'option_missing' });
          }
          await updateSharedOption(editingOption, input, this.data.categories);
        } else {
          await createSharedOption(input, this.data.categories);
        }

        this.renderCatalog(readOptionCatalogCache(), {
          categoryId: input.categoryId,
          collapsedGroups: this.data.collapsedGroups,
          searchQuery: this.data.searchQuery,
        });
        this.closeOptionEditor(true);
        wx.showToast({
          title: wasEdit ? '已更新' : '已添加',
          icon: 'success',
        });
      } catch (error) {
        const code = (error as Error & { code?: OptionValidationCode }).code;
        console.warn('保存活动失败', error);
        wx.showToast({
          title: getValidationMessage(code),
          icon: 'none',
        });
      } finally {
        this.setData({ editorSaving: false });
      }
    },

    onDeleteOption(e: WechatMiniprogram.TouchEvent) {
      const option = e.currentTarget.dataset.option as Option;
      const categoryId = (e.currentTarget.dataset.categoryId as string) || this.data.currentCategoryId;
      if (!option || !categoryId) return;

      wx.showModal({
        title: '删除活动',
        content: `确定删除「${option.name}」吗？`,
        confirmText: '删除',
        confirmColor: '#FF6B81',
        success: async res => {
          if (!res.confirm) return;

          try {
            await deleteSharedOption(option, categoryId);
            this.removeSelectionByOptionId(option.id);
            this.renderCatalog(readOptionCatalogCache(), {
              categoryId: this.data.currentCategoryId,
              collapsedGroups: this.data.collapsedGroups,
              searchQuery: this.data.searchQuery,
            });
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (error) {
            console.warn('删除活动失败', error);
            wx.showToast({ title: '删除失败，请稍后再试', icon: 'none' });
          }
        },
      });
    },

    removeSelectionByOptionId(optionId: string) {
      const nextSelections = Object.entries(app.globalData.selections || {}).reduce((record, [categoryId, options]) => {
        const filtered = cloneOptions(options).filter(option => option.id !== optionId);
        if (filtered.length > 0) {
          record[categoryId] = filtered;
        }
        return record;
      }, {} as Record<string, Option[]>);
      app.globalData.selections = nextSelections;
      app.saveSelections();
    },

    onShareAppMessage() {
      const globalData = app.globalData;
      const selections = Object.entries(globalData.selections)
        .filter(([_, options]) => options.length > 0)
        .map(([categoryId, options]) => ({
          categoryId,
          categoryName: getCategoryName(this.data.categories, categoryId),
          options,
        }));

      if (selections.length === 0) {
        return {
          title: '今天干什么？',
          path: '/pages/result/result',
        };
      }

      const shareData: ShareData = {
        fromUser: globalData.nickname || '我',
        selections,
        timestamp: Date.now(),
        mode: 'selection',
      };

      return {
        title: `${globalData.nickname || '我'} 发来了今日选择 💌`,
        path: `/pages/welcome/welcome?data=${encodeShareData(shareData)}`,
      };
    },
  },
});
