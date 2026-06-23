import { CATEGORIES, Category, Option, OptionGroup, Selection } from '../data/categories';
import {
  GroupOrderRecord,
  LegacyCustomOptionRecord,
  ManagedOptionRecord,
  OptionCatalogRecord,
  OptionSearchResult,
  OptionValidationInput,
  OptionValidationResult,
} from '../types/options';
import { normalizeOptionName as normalizeOptionNameFromCategoryOptions } from './categoryOptions';

const OTHER_GROUP_ID = 'other';
const OTHER_GROUP_TITLE = '其他';

export const normalizeOptionName = normalizeOptionNameFromCategoryOptions;

function buildLegacyOptionId(categoryId: string, normalizedName: string): string {
  return `cloud_${categoryId}_${normalizedName}`;
}

function cloneOption(option: Option): Option {
  return { ...option };
}

function cloneGroup(group: OptionGroup): OptionGroup {
  return {
    ...group,
    options: group.options.map(cloneOption),
  };
}

export function clonePresetCatalog(): Category[] {
  return CATEGORIES.map(category => {
    const optionGroups = category.optionGroups.map(cloneGroup);
    return {
      ...category,
      optionGroups,
      options: optionGroups.flatMap(group => group.options),
    };
  });
}

function isManagedRecord(record: OptionCatalogRecord): record is ManagedOptionRecord {
  return 'recordType' in record && record.recordType === 'option';
}

function isGroupOrderRecord(record: OptionCatalogRecord): record is GroupOrderRecord {
  return 'recordType' in record && record.recordType === 'group_order';
}

function isLegacyRecord(record: OptionCatalogRecord): record is LegacyCustomOptionRecord {
  return !('recordType' in record);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function compareManagedRecords(left: ManagedOptionRecord, right: ManagedOptionRecord): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;

  const idComparison = compareText(left._id || '', right._id || '');
  if (idComparison !== 0) return idComparison;

  const leftKey = JSON.stringify([
    left.categoryId,
    left.groupId,
    left.source,
    left.name,
    left.normalizedName,
    left.description,
    left.deleted,
    left.optionId,
  ]);
  const rightKey = JSON.stringify([
    right.categoryId,
    right.groupId,
    right.source,
    right.name,
    right.normalizedName,
    right.description,
    right.deleted,
    right.optionId,
  ]);
  return compareText(leftKey, rightKey);
}

function compareGroupOrderRecords(left: GroupOrderRecord, right: GroupOrderRecord): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;

  const idComparison = compareText(left._id || '', right._id || '');
  if (idComparison !== 0) return idComparison;

  return compareText(JSON.stringify(left.optionIds), JSON.stringify(right.optionIds));
}

interface PreparedLegacyRecord {
  record: LegacyCustomOptionRecord;
  name: string;
  normalizedName: string;
  optionId: string;
}

function comparePreparedLegacyRecords(left: PreparedLegacyRecord, right: PreparedLegacyRecord): number {
  if (left.record.createdAt !== right.record.createdAt) {
    return left.record.createdAt - right.record.createdAt;
  }

  const idComparison = compareText(left.record._id || '', right.record._id || '');
  if (idComparison !== 0) return idComparison;

  const nameComparison = compareText(left.name, right.name);
  if (nameComparison !== 0) return nameComparison;

  return compareText(left.optionId, right.optionId);
}

function groupOrderKey(categoryId: string, groupId: string): string {
  return `${categoryId}:${groupId}`;
}

function normalizeOrder(savedIds: string[] | undefined, liveIds: string[]): string[] {
  const liveSet = new Set(liveIds);
  const ordered: string[] = [];
  const seen = new Set<string>();

  (savedIds || []).forEach(id => {
    if (!liveSet.has(id) || seen.has(id)) return;
    ordered.push(id);
    seen.add(id);
  });

  liveIds.forEach(id => {
    if (seen.has(id)) return;
    ordered.push(id);
    seen.add(id);
  });

  return ordered;
}

function getOrCreateOtherGroup(category: Category): OptionGroup {
  let group = category.optionGroups.find(item => item.id === OTHER_GROUP_ID);
  if (!group) {
    group = { id: OTHER_GROUP_ID, title: OTHER_GROUP_TITLE, options: [] };
    category.optionGroups.push(group);
  }
  return group;
}

function removeOption(categories: Category[], optionId: string): Option | undefined {
  let removed: Option | undefined;
  categories.forEach(category => {
    category.optionGroups.forEach(group => {
      group.options = group.options.filter(option => {
        if (option.id !== optionId) return true;
        if (!removed) removed = option;
        return false;
      });
    });
  });
  return removed;
}

function findCategory(categories: Category[], categoryId: string): Category | undefined {
  return categories.find(category => category.id === categoryId);
}

function buildSearchResult(category: Category, group: OptionGroup, option: Option): OptionSearchResult {
  return {
    categoryId: category.id,
    categoryName: category.name,
    groupId: group.id,
    groupName: group.title,
    option: cloneOption(option),
  };
}

function findOptionResultById(
  categories: Category[],
  optionId: string,
  categoryId?: string
): OptionSearchResult | undefined {
  const categoryList = categoryId ? categories.filter(category => category.id === categoryId) : categories;
  for (const category of categoryList) {
    for (const group of category.optionGroups) {
      const option = group.options.find(item => item.id === optionId);
      if (option) return buildSearchResult(category, group, option);
    }
  }
  return undefined;
}

export function findOptionByName(
  categories: Category[],
  name: string,
  categoryId?: string
): OptionSearchResult | undefined {
  const normalizedQuery = normalizeOptionName(name);
  if (!normalizedQuery) return undefined;

  const categoryList = categoryId ? categories.filter(category => category.id === categoryId) : categories;
  for (const category of categoryList) {
    for (const group of category.optionGroups) {
      const option = group.options.find(item => normalizeOptionName(item.name) === normalizedQuery);
      if (option) return buildSearchResult(category, group, option);
    }
  }
  return undefined;
}

export function searchCatalog(categories: Category[], query: string): OptionSearchResult[] {
  const normalizedQuery = normalizeOptionName(query);
  if (!normalizedQuery) return [];

  const results: Array<OptionSearchResult & {
    score: number;
    categoryIndex: number;
    groupIndex: number;
    optionIndex: number;
  }> = [];

  categories.forEach((category, categoryIndex) => {
    category.optionGroups.forEach((group, groupIndex) => {
      group.options.forEach((option, optionIndex) => {
        const normalizedName = normalizeOptionName(option.name);
        const normalizedDescription = normalizeOptionName(option.description || '');
        let score = -1;
        if (normalizedName === normalizedQuery) score = 0;
        else if (normalizedName.includes(normalizedQuery)) score = 1;
        else if (normalizedDescription.includes(normalizedQuery)) score = 2;
        if (score < 0) return;

        results.push({
          ...buildSearchResult(category, group, option),
          score,
          categoryIndex,
          groupIndex,
          optionIndex,
        });
      });
    });
  });

  results.sort((left, right) => (
    left.score - right.score
    || left.categoryIndex - right.categoryIndex
    || left.groupIndex - right.groupIndex
    || left.optionIndex - right.optionIndex
    || compareText(left.option.id, right.option.id)
  ));

  return results.map(({ score, categoryIndex, groupIndex, optionIndex, ...result }) => result);
}

function getFixedGroupIds(categoryId: string): Set<string> {
  const presetCategory = CATEGORIES.find(category => category.id === categoryId);
  return new Set((presetCategory?.optionGroups || []).map(group => group.id));
}

export function validateOptionInput(
  categories: Category[],
  input: OptionValidationInput,
  excludeOptionId?: string
): OptionValidationResult {
  const categoryId = typeof input.categoryId === 'string' ? input.categoryId.trim() : '';
  const groupId = typeof input.groupId === 'string' ? input.groupId.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';

  if (!name) return { ok: false, code: 'empty' };
  if (name.length > 30) return { ok: false, code: 'too_long' };
  if (description.length > 160) return { ok: false, code: 'description_too_long' };

  const category = findCategory(categories, categoryId);
  if (!category) return { ok: false, code: 'category' };

  if (!getFixedGroupIds(categoryId).has(groupId)) return { ok: false, code: 'group' };

  const normalizedName = normalizeOptionName(name);
  const duplicate = category.options.some(option => (
    option.id !== excludeOptionId && normalizeOptionName(option.name) === normalizedName
  ));
  if (duplicate) return { ok: false, code: 'duplicate' };

  return { ok: true, code: 'ok' };
}

export function createStableOptionId(
  now: number = Date.now(),
  randomPart: string = Math.random().toString(36).slice(2, 8)
): string {
  const cleanedRandomPart = String(randomPart).replace(/[^A-Za-z0-9]/g, '');
  return `option_${now.toString(36)}_${cleanedRandomPart || 'x'}`;
}

function applyLegacyRecords(categories: Category[], records: LegacyCustomOptionRecord[]): void {
  const latestLegacyRecords = new Map<string, PreparedLegacyRecord>();
  records.forEach(record => {
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const normalizedName = typeof record.normalizedName === 'string' && record.normalizedName.trim()
      ? normalizeOptionName(record.normalizedName)
      : normalizeOptionName(name);
    if (!findCategory(categories, record.categoryId) || !name || !normalizedName) return;

    const optionId = buildLegacyOptionId(record.categoryId, normalizedName);
    const preparedRecord = { record, name, normalizedName, optionId };
    const current = latestLegacyRecords.get(optionId);
    if (!current || comparePreparedLegacyRecords(preparedRecord, current) > 0) {
      latestLegacyRecords.set(optionId, preparedRecord);
    }
  });

  Array.from(latestLegacyRecords.values())
    .sort(comparePreparedLegacyRecords)
    .forEach(({ record, name, normalizedName, optionId }) => {
      const category = findCategory(categories, record.categoryId);
      if (!category) return;

      const exists = category.options.some(option => (
        option.id === optionId || normalizeOptionName(option.name) === normalizedName
      ));
      if (exists) return;

      const option: Option = {
        id: optionId,
        groupId: OTHER_GROUP_ID,
        name,
        emoji: '',
        isCustom: true,
        canDelete: true,
      };
      getOrCreateOtherGroup(category).options.push(option);
    });
}

function applyManagedRecords(categories: Category[], records: ManagedOptionRecord[]): void {
  const latestManagedRecords = new Map<string, ManagedOptionRecord>();
  records.forEach(record => {
    const current = latestManagedRecords.get(record.optionId);
    if (!current || compareManagedRecords(record, current) > 0) {
      latestManagedRecords.set(record.optionId, record);
    }
  });

  Array.from(latestManagedRecords.values())
    .sort(compareManagedRecords)
    .forEach(record => {
      if (record.deleted) {
        removeOption(categories, record.optionId);
        return;
      }

      const category = findCategory(categories, record.categoryId);
      const presetCategory = CATEGORIES.find(item => item.id === record.categoryId);
      const isFixedGroup = presetCategory?.optionGroups.some(item => item.id === record.groupId);
      const group = isFixedGroup && category
        ? category.optionGroups.find(item => item.id === record.groupId)
        : undefined;
      if (!category || !group) return;

      const existing = removeOption(categories, record.optionId);
      group.options.push({
        ...cloneOption(existing || {
          id: record.optionId,
          groupId: record.groupId,
          name: record.name,
          emoji: '',
          isCustom: record.source === 'custom',
          canDelete: record.source === 'custom',
          description: record.description || undefined,
        }),
        id: record.optionId,
        groupId: record.groupId,
        name: record.name,
        emoji: existing ? existing.emoji : '',
        isCustom: record.source === 'custom',
        canDelete: record.source === 'custom',
        description: record.description || undefined,
      });
    });
}

function applyGroupOrders(
  categories: Category[],
  records: GroupOrderRecord[],
  legacyOrderMap: Record<string, string[]>
): void {
  const latestGroupOrders = new Map<string, GroupOrderRecord>();
  records.forEach(record => {
    const key = groupOrderKey(record.categoryId, record.groupId);
    const current = latestGroupOrders.get(key);
    if (!current || compareGroupOrderRecords(record, current) > 0) {
      latestGroupOrders.set(key, record);
    }
  });

  categories.forEach(category => {
    category.optionGroups.forEach(group => {
      const key = groupOrderKey(category.id, group.id);
      const liveIds = group.options.map(option => option.id);
      const optionById = group.options.reduce((map, option) => {
        map.set(option.id, option);
        return map;
      }, new Map<string, Option>());
      const orderRecord = latestGroupOrders.get(key);
      const legacyOrder = Array.isArray(legacyOrderMap[key]) ? legacyOrderMap[key] : undefined;
      const orderedIds = normalizeOrder(orderRecord?.optionIds || legacyOrder, liveIds);
      group.options = orderedIds.map(id => optionById.get(id)).filter((option): option is Option => Boolean(option));
    });
  });
}

export function buildCatalog(
  records: OptionCatalogRecord[],
  legacyOrderMap: Record<string, string[]> = {}
): Category[] {
  const categories = clonePresetCatalog();

  applyLegacyRecords(categories, records.filter(isLegacyRecord));
  applyManagedRecords(categories, records.filter(isManagedRecord));
  applyGroupOrders(categories, records.filter(isGroupOrderRecord), legacyOrderMap);

  categories.forEach(category => {
    category.options = category.optionGroups.flatMap(group => group.options);
  });
  return categories;
}

export function reconcileSelections(categories: Category[], selections: Selection[]): Selection[] {
  return selections.reduce((allSelections, selection) => {
    const reconciledByCategory = new Map<string, Selection>();
    selection.options.forEach(option => {
      const exactMatch = findOptionResultById(categories, option.id);
      const resolvedOption = exactMatch || findOptionByName(categories, option.name, selection.categoryId);
      if (!resolvedOption) return;

      let reconciledSelection = reconciledByCategory.get(resolvedOption.categoryId);
      if (!reconciledSelection) {
        reconciledSelection = {
          categoryId: resolvedOption.categoryId,
          categoryName: resolvedOption.categoryName,
          options: [],
        };
        reconciledByCategory.set(resolvedOption.categoryId, reconciledSelection);
      }

      reconciledSelection.options.push({
        id: resolvedOption.option.id,
        groupId: resolvedOption.option.groupId,
        name: resolvedOption.option.name,
        emoji: resolvedOption.option.emoji,
        isCustom: resolvedOption.option.isCustom,
        canDelete: resolvedOption.option.canDelete,
        description: resolvedOption.option.description,
      });
    });

    allSelections.push(...Array.from(reconciledByCategory.values()));
    return allSelections;
  }, [] as Selection[]);
}
