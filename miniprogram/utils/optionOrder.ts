import { OptionGroup } from '../data/categories';

export type OptionOrderMap = Record<string, string[]>;

const STORAGE_KEY = 'categoryOptionOrder:v1';

function groupOrderKey(categoryId: string, groupId: string): string {
  return `${categoryId}:${groupId}`;
}

function cloneGroup(group: OptionGroup): OptionGroup {
  return { ...group, options: group.options.map(option => ({ ...option })) };
}

function normalizeOrder(savedIds: string[] | undefined, optionIds: string[]): string[] {
  const exists = optionIds.reduce((acc, id) => {
    acc[id] = true;
    return acc;
  }, {} as Record<string, boolean>);
  const ordered = (savedIds || []).filter(id => exists[id]);
  optionIds.forEach(id => {
    if (ordered.indexOf(id) < 0) ordered.push(id);
  });
  return ordered;
}

export function applyOptionOrder(groups: OptionGroup[], categoryId: string, orderMap: OptionOrderMap): OptionGroup[] {
  return groups.map(group => {
    const cloned = cloneGroup(group);
    const optionById = cloned.options.reduce((acc, option) => {
      acc[option.id] = option;
      return acc;
    }, {} as Record<string, typeof cloned.options[number]>);
    const order = normalizeOrder(orderMap[groupOrderKey(categoryId, group.id)], cloned.options.map(option => option.id));
    cloned.options = order.map(id => optionById[id]).filter(Boolean);
    return cloned;
  });
}

export function moveOptionInGroups(groups: OptionGroup[], groupId: string, optionId: string, direction: 'up' | 'down'): OptionGroup[] {
  return groups.map(group => {
    const cloned = cloneGroup(group);
    if (group.id !== groupId) return cloned;
    const index = cloned.options.findIndex(option => option.id === optionId);
    if (index < 0) return cloned;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cloned.options.length) return cloned;
    const next = cloned.options.slice();
    const current = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = current;
    cloned.options = next;
    return cloned;
  });
}

export function readOptionOrder(): OptionOrderMap {
  try {
    const value = wx.getStorageSync(STORAGE_KEY);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as OptionOrderMap : {};
  } catch {
    return {};
  }
}

export function saveGroupOptionOrder(categoryId: string, groupId: string, optionIds: string[]): OptionOrderMap {
  const orderMap = readOptionOrder();
  orderMap[groupOrderKey(categoryId, groupId)] = optionIds;
  wx.setStorageSync(STORAGE_KEY, orderMap);
  return orderMap;
}
