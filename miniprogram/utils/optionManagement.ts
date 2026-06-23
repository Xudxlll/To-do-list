import { OptionGroup } from '../data/categories';

export type CollapsedGroupMap = Record<string, boolean>;

export function groupCollapseKey(categoryId: string, groupId: string): string {
  return `${categoryId}:${groupId}`;
}

function cloneCollapsedMap(map: CollapsedGroupMap): CollapsedGroupMap {
  return { ...map };
}

function cloneGroup(group: OptionGroup): OptionGroup {
  return {
    ...group,
    options: group.options.map(option => ({ ...option })),
  };
}

function cloneGroups(groups: OptionGroup[]): OptionGroup[] {
  return groups.map(cloneGroup);
}

export function toggleGroup(
  categoryId: string,
  groupId: string,
  collapsedMap: CollapsedGroupMap
): CollapsedGroupMap {
  const next = cloneCollapsedMap(collapsedMap);
  const key = groupCollapseKey(categoryId, groupId);
  next[key] = !Boolean(next[key]);
  return next;
}

export function collapseAllGroups(
  categoryId: string,
  groups: OptionGroup[],
  collapsedMap: CollapsedGroupMap
): CollapsedGroupMap {
  const next = cloneCollapsedMap(collapsedMap);
  cloneGroups(groups).forEach(group => {
    next[groupCollapseKey(categoryId, group.id)] = true;
  });
  return next;
}

export function isGroupCollapsed(
  categoryId: string,
  groupId: string,
  collapsedMap: CollapsedGroupMap
): boolean {
  return Boolean(collapsedMap[groupCollapseKey(categoryId, groupId)]);
}
