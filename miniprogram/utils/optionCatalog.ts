import { CATEGORIES, Category, Option, OptionGroup } from '../data/categories';
import {
  LegacyCustomOptionRecord,
  ManagedOptionRecord,
  OptionCatalogRecord,
} from '../types/options';
import { buildCustomOptionId, normalizeOptionName } from './categoryOptions';

const OTHER_GROUP_ID = 'other';
const OTHER_GROUP_TITLE = '其他';

function cloneGroup(group: OptionGroup): OptionGroup {
  return {
    ...group,
    options: group.options.map(option => ({ ...option })),
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
    left.categoryId, left.groupId, left.source, left.name, left.normalizedName,
    left.description, left.deleted,
  ]);
  const rightKey = JSON.stringify([
    right.categoryId, right.groupId, right.source, right.name, right.normalizedName,
    right.description, right.deleted,
  ]);
  return compareText(leftKey, rightKey);
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

export function buildCatalog(records: OptionCatalogRecord[]): Category[] {
  const categories = clonePresetCatalog();

  records.filter(isLegacyRecord).forEach(record => {
    const category = categories.find(item => item.id === record.categoryId);
    const name = record.name.trim();
    const normalizedName = normalizeOptionName(record.normalizedName || name);
    if (!category || !name || !normalizedName) return;

    const existingOptions = category.optionGroups.flatMap(group => group.options);
    const optionId = buildCustomOptionId(record.categoryId, normalizedName);
    const exists = existingOptions.some(option => (
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

  const latestManagedRecords = new Map<string, ManagedOptionRecord>();
  records.filter(isManagedRecord).forEach(record => {
    const current = latestManagedRecords.get(record.optionId);
    if (!current || compareManagedRecords(record, current) > 0) {
      latestManagedRecords.set(record.optionId, record);
    }
  });

  latestManagedRecords.forEach(record => {
    if (record.deleted) {
      removeOption(categories, record.optionId);
      return;
    }

    const category = categories.find(item => item.id === record.categoryId);
    const presetCategory = CATEGORIES.find(item => item.id === record.categoryId);
    const isFixedGroup = presetCategory?.optionGroups.some(item => item.id === record.groupId);
    const group = isFixedGroup && category
      ? category.optionGroups.find(item => item.id === record.groupId)
      : undefined;
    if (!category || !group) return;

    const existing = removeOption(categories, record.optionId);

    group.options.push({
      ...existing,
      id: record.optionId,
      groupId: record.groupId,
      name: record.name,
      emoji: existing ? existing.emoji : '',
      isCustom: record.source === 'custom',
      canDelete: record.source === 'custom',
      description: record.description || undefined,
    });
  });

  categories.forEach(category => {
    category.options = category.optionGroups.flatMap(group => group.options);
  });
  return categories;
}
