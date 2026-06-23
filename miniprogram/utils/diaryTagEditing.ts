import { Category, Option } from '../data/categories';
import { RecognizedTag } from '../types/diary';
import { SharedOptionInput } from '../types/options';
import { buildDiaryCandidateOptionId } from './diaryTagIds';
import { findOptionByName, normalizeOptionName } from './optionCatalog';

export interface EditableRecognizedTag extends RecognizedTag {
  editKey: string;
}

export interface EditableTagCategory {
  id: string;
  name: string;
}

export interface EditableTagGroup {
  id: string;
  title: string;
}

type MatchedOption = NonNullable<ReturnType<typeof findOptionByName>>;

export class DiaryCandidateTagSyncError extends Error {
  syncedTags: EditableRecognizedTag[];
  categories: Category[];
  originalError: unknown;

  constructor(message: string, syncedTags: EditableRecognizedTag[], categories: Category[], originalError?: unknown) {
    super(message);
    this.name = 'DiaryCandidateTagSyncError';
    this.syncedTags = syncedTags;
    this.categories = categories;
    this.originalError = originalError;
  }
}

export function isDiaryCandidateTagSyncError(error: unknown): error is DiaryCandidateTagSyncError {
  return Boolean(error && typeof error === 'object' && Array.isArray((error as DiaryCandidateTagSyncError).syncedTags));
}

function findCategory(categories: Category[], categoryId: string): Category | undefined {
  return categories.find(category => category.id === categoryId);
}

function findGroup(categories: Category[], categoryId: string, groupId: string): EditableTagGroup | undefined {
  return findCategory(categories, categoryId)?.optionGroups.find(group => group.id === groupId);
}

function isValidGroup(categories: Category[], categoryId: string, groupId: string): boolean {
  return Boolean(groupId && findGroup(categories, categoryId, groupId));
}

function getCategoryName(categories: Category[], categoryId: string, fallback = ''): string {
  return findCategory(categories, categoryId)?.name || fallback;
}

function optionSource(option: Option): 'preset' | 'custom' {
  return option.isCustom ? 'custom' : 'preset';
}

function optionToEditableTag(base: EditableRecognizedTag, matched: MatchedOption): EditableRecognizedTag {
  return {
    ...base,
    categoryId: matched.categoryId,
    categoryName: matched.categoryName,
    groupId: matched.groupId,
    groupName: matched.groupName,
    optionId: matched.option.id,
    name: matched.option.name,
    isCustom: matched.option.isCustom,
    source: optionSource(matched.option),
    editable: false,
  };
}

function buildCandidateTag(
  tag: EditableRecognizedTag,
  categories: Category[],
  categoryId: string,
  categoryName: string,
  name: string,
  groupId: string,
  groupName: string
): EditableRecognizedTag {
  const normalizedName = normalizeOptionName(name);
  const keepGroup = isValidGroup(categories, categoryId, groupId);
  return {
    ...tag,
    categoryId,
    categoryName,
    groupId: keepGroup ? groupId : '',
    groupName: keepGroup ? groupName : '',
    name,
    optionId: buildDiaryCandidateOptionId(categoryId, normalizedName),
    source: 'candidate',
    isCustom: true,
    editable: true,
  };
}

export function prepareEditableDiaryTags(tags: RecognizedTag[]): EditableRecognizedTag[] {
  return tags.map((tag, index) => ({
    ...tag,
    editKey: `${tag.categoryId}:${tag.optionId}:${index}`,
  }));
}

export function updateEditableDiaryTagName(
  tags: EditableRecognizedTag[],
  index: number,
  name: string,
  categories: Category[]
): EditableRecognizedTag[] {
  const next = tags.slice();
  const tag = next[index];
  if (!tag) return next;

  const existing = findOptionByName(categories, name, tag.categoryId);
  if (existing) {
    next[index] = optionToEditableTag(tag, existing);
    return next;
  }

  next[index] = buildCandidateTag(
    tag,
    categories,
    tag.categoryId,
    getCategoryName(categories, tag.categoryId, tag.categoryName),
    name,
    tag.groupId,
    tag.groupName
  );
  return next;
}

export function updateEditableDiaryTagCategory(
  tags: EditableRecognizedTag[],
  index: number,
  category: EditableTagCategory,
  categories: Category[]
): EditableRecognizedTag[] {
  const next = tags.slice();
  const tag = next[index];
  if (!tag) return next;

  const existing = findOptionByName(categories, tag.name, category.id);
  if (existing) {
    next[index] = optionToEditableTag(tag, existing);
    return next;
  }

  next[index] = buildCandidateTag(tag, categories, category.id, category.name, tag.name, '', '');
  return next;
}

export function updateEditableDiaryTagGroup(
  tags: EditableRecognizedTag[],
  index: number,
  group: EditableTagGroup
): EditableRecognizedTag[] {
  const next = tags.slice();
  const tag = next[index];
  if (!tag) return next;

  next[index] = {
    ...tag,
    groupId: group.id,
    groupName: group.title,
    source: 'candidate',
    isCustom: true,
    editable: true,
  };
  return next;
}

function formatSyncError(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { errMsg?: string; message?: string };
    return err.errMsg || err.message || '候选标签同步失败';
  }
  return String(error || '候选标签同步失败');
}

function appendSyncedOption(categories: Category[], categoryId: string, groupId: string, option: Option): Category[] {
  const normalizedName = normalizeOptionName(option.name);
  return categories.map(category => {
    if (category.id !== categoryId) return category;
    if (category.options.some(item => normalizeOptionName(item.name) === normalizedName)) return category;

    const syncedOption = { ...option };
    const optionGroups = category.optionGroups.map(group => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        options: group.options.concat(syncedOption),
      };
    });

    return {
      ...category,
      optionGroups,
      options: optionGroups.reduce((all, group) => all.concat(group.options), [] as Option[]),
    };
  });
}

function buildSyncError(
  message: string,
  syncedTags: EditableRecognizedTag[],
  remainingTags: EditableRecognizedTag[],
  categories: Category[],
  originalError?: unknown
): DiaryCandidateTagSyncError {
  return new DiaryCandidateTagSyncError(message, syncedTags.concat(remainingTags), categories, originalError);
}

export async function syncDiaryCandidateTags(
  tags: EditableRecognizedTag[],
  categories: Category[],
  createOption: (input: SharedOptionInput, categories: Category[]) => Promise<Option>
): Promise<EditableRecognizedTag[]> {
  const syncedTags: EditableRecognizedTag[] = [];
  let workingCategories = categories;

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    const name = tag.name.trim();
    if (tag.source !== 'candidate' || !name) {
      syncedTags.push(tag);
      continue;
    }

    const existing = findOptionByName(workingCategories, name, tag.categoryId);
    if (existing) {
      syncedTags.push(optionToEditableTag(tag, existing));
      continue;
    }

    const category = findCategory(workingCategories, tag.categoryId);
    const group = category?.optionGroups.find(item => item.id === tag.groupId);
    if (!category || !group) {
      throw buildSyncError(
        '候选标签保存前需要选择有效子分类',
        syncedTags,
        tags.slice(index),
        workingCategories
      );
    }

    let option: Option;
    try {
      option = await createOption({
        categoryId: category.id,
        groupId: group.id,
        name,
      }, workingCategories);
    } catch (error) {
      throw buildSyncError(formatSyncError(error), syncedTags, tags.slice(index), workingCategories, error);
    }
    workingCategories = appendSyncedOption(workingCategories, category.id, group.id, option);

    syncedTags.push({
      ...tag,
      categoryId: category.id,
      categoryName: category.name,
      groupId: option.groupId,
      groupName: group.title,
      optionId: option.id,
      name: option.name,
      isCustom: option.isCustom,
      source: optionSource(option),
      editable: false,
    });
  }

  return syncedTags;
}
