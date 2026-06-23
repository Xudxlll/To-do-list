import { Option, OptionGroup } from '../data/categories';

export type OptionOrderMap = Record<string, string[]>;

export interface MoveAcrossGroupsResult {
  groups: OptionGroup[];
  moved: Option | null;
  source: OptionGroup | null;
  target: OptionGroup | null;
}

const STORAGE_KEY = 'categoryOptionOrder:v1';

function groupOrderKey(categoryId: string, groupId: string): string {
  return `${categoryId}:${groupId}`;
}

function cloneGroup(group: OptionGroup): OptionGroup {
  return { ...group, options: group.options.map(option => ({ ...option })) };
}

function cloneGroups(groups: OptionGroup[]): OptionGroup[] {
  return groups.map(cloneGroup);
}

function clampIndex(index: number, maxIndex: number): number {
  if (index < 0) return 0;
  if (index > maxIndex) return maxIndex;
  return index;
}

function invalidMoveResult(groups: OptionGroup[]): MoveAcrossGroupsResult {
  return {
    groups: cloneGroups(groups),
    moved: null,
    source: null,
    target: null,
  };
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
  return cloneGroups(groups).map(group => {
    if (group.id !== groupId) return group;
    const index = group.options.findIndex(option => option.id === optionId);
    if (index < 0) return group;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= group.options.length) return group;
    const next = group.options.slice();
    const current = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = current;
    group.options = next;
    return group;
  });
}

export function moveOptionAcrossGroups(
  groups: OptionGroup[],
  optionId: string,
  targetGroupId: string,
  targetIndex: number
): MoveAcrossGroupsResult {
  if (!Number.isFinite(targetIndex)) {
    return invalidMoveResult(groups);
  }

  const clonedGroups = cloneGroups(groups);
  const sourceGroup = clonedGroups.find(group => group.options.some(option => option.id === optionId)) || null;
  const targetGroup = clonedGroups.find(group => group.id === targetGroupId) || null;
  if (!sourceGroup || !targetGroup) {
    return { groups: clonedGroups, moved: null, source: null, target: null };
  }

  const sourceIndex = sourceGroup.options.findIndex(option => option.id === optionId);
  if (sourceIndex < 0) {
    return { groups: clonedGroups, moved: null, source: null, target: null };
  }

  const [moved] = sourceGroup.options.splice(sourceIndex, 1);
  if (!moved) {
    return { groups: clonedGroups, moved: null, source: null, target: null };
  }

  moved.groupId = targetGroupId;
  const insertIndex = clampIndex(targetIndex, targetGroup.id === sourceGroup.id ? sourceGroup.options.length : targetGroup.options.length);
  targetGroup.options.splice(insertIndex, 0, moved);

  return {
    groups: clonedGroups,
    moved: { ...moved },
    source: cloneGroup(sourceGroup),
    target: cloneGroup(targetGroup),
  };
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
