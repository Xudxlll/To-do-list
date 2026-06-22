import { RecognizedTag } from '../types/diary';
import { buildCustomOptionId, normalizeOptionName } from './categoryOptions';

export interface EditableRecognizedTag extends RecognizedTag {
  editKey: string;
}

export interface EditableTagCategory {
  id: string;
  name: string;
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
  name: string
): EditableRecognizedTag[] {
  const next = tags.slice();
  const tag = next[index];
  if (!tag) return next;

  const normalizedName = normalizeOptionName(name);
  next[index] = {
    ...tag,
    name,
    optionId: tag.source === 'candidate' ? buildCustomOptionId(tag.categoryId, normalizedName) : tag.optionId,
  };
  return next;
}

export function updateEditableDiaryTagCategory(
  tags: EditableRecognizedTag[],
  index: number,
  category: EditableTagCategory
): EditableRecognizedTag[] {
  const next = tags.slice();
  const tag = next[index];
  if (!tag) return next;

  const normalizedName = normalizeOptionName(tag.name);
  next[index] = {
    ...tag,
    categoryId: category.id,
    categoryName: category.name,
    optionId: buildCustomOptionId(category.id, normalizedName),
    source: 'candidate',
    isCustom: true,
    editable: true,
  };
  return next;
}
