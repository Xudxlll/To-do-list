import { Category, CATEGORIES, Option, OptionGroup } from '../data/categories';
import { CustomOptionRecord } from '../types/diary';

const OTHER_GROUP_ID = 'other';
const OTHER_GROUP_TITLE = '其他';

function cloneOption(option: Option): Option {
  return { ...option };
}

function cloneGroup(group: OptionGroup): OptionGroup {
  return { ...group, options: group.options.map(cloneOption) };
}

export function normalizeOptionName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

export function buildCustomOptionId(categoryId: string, normalizedName: string): string {
  return `cloud_${categoryId}_${normalizedName}`;
}

export function clonePresetCategories(): Category[] {
  return CATEGORIES.map(cat => {
    const optionGroups = cat.optionGroups.map(cloneGroup);
    return {
      ...cat,
      optionGroups,
      options: optionGroups.reduce((all, group) => all.concat(group.options), [] as Option[]),
    };
  });
}

export function mergeCustomOptions(customOptions: CustomOptionRecord[]): Category[] {
  const categories = clonePresetCategories();
  customOptions.forEach(record => {
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const normalizedName = typeof record.normalizedName === 'string' && record.normalizedName.trim()
      ? normalizeOptionName(record.normalizedName)
      : normalizeOptionName(name);
    if (!record.categoryId || !name || !normalizedName) return;

    const cat = categories.find(item => item.id === record.categoryId);
    if (!cat) return;

    const exists = cat.options.some(item => normalizeOptionName(item.name) === normalizedName);
    if (exists) return;

    let group = cat.optionGroups.find(item => item.id === OTHER_GROUP_ID);
    if (!group) {
      group = { id: OTHER_GROUP_ID, title: OTHER_GROUP_TITLE, options: [] };
      cat.optionGroups.push(group);
    }

    const option: Option = {
      id: buildCustomOptionId(record.categoryId, normalizedName),
      name,
      emoji: '',
      isCustom: false,
    };
    group.options.push(option);
    cat.options.push(option);
  });
  return categories;
}
