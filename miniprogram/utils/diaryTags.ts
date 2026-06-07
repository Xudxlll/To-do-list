import { Category, Option } from '../data/categories';
import { RecognizedTag } from '../types/diary';
import { buildCustomOptionId, normalizeOptionName } from './categoryOptions';

interface CategoryRule {
  categoryId: string;
  verbs: string[];
}

interface AliasRule {
  categoryId: string;
  optionName: string;
  keywords: string[];
}

interface GenericTagRule {
  categoryId: string;
  name: string;
  keywords: string[];
}

interface RecognizeOptions {
  includeCategoryIds?: string[];
  excludeCategoryIds?: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  { categoryId: 'eat', verbs: ['吃', '煮', '做饭', '外卖', '火锅', '烧烤'] },
  { categoryId: 'drink', verbs: ['喝', '奶茶', '咖啡', '微醺'] },
  { categoryId: 'play', verbs: ['玩', '体验', '手作', '密室', '剧本杀'] },
  { categoryId: 'goout', verbs: ['去', '逛', '散步', '看海', '公园', '商场'] },
  { categoryId: 'watch', verbs: ['看', '电影', '追剧', '演出', '展'] },
  { categoryId: 'sport', verbs: ['运动', '跑步', '骑行', '游泳', '爬山'] },
  { categoryId: 'home', verbs: ['宅', '收拾', '整理', '睡', '休息'] },
];

const ALIAS_RULES: AliasRule[] = [
  { categoryId: 'watch', optionName: '电影院', keywords: ['看电影'] },
  { categoryId: 'play', optionName: '逛商场', keywords: ['商场', '逛'] },
  { categoryId: 'play', optionName: '逛商场', keywords: ['商场', '逛街'] },
  { categoryId: 'play', optionName: '逛市集', keywords: ['市集', '逛'] },
  { categoryId: 'play', optionName: '逛超市', keywords: ['超市', '逛'] },
  { categoryId: 'play', optionName: '逛书店', keywords: ['书店', '逛'] },
];

const GENERIC_TAG_RULES: GenericTagRule[] = [
  { categoryId: 'drink', name: '奶茶', keywords: ['奶茶'] },
  { categoryId: 'drink', name: '咖啡', keywords: ['咖啡'] },
];

const GENERIC_CANDIDATE_NAMES: Record<string, boolean> = {
  商场: true,
  商场逛街: true,
  逛街: true,
  街: true,
  买东西: true,
};

const CONFLICT_RULES = [
  { preferredCategoryId: 'watch', preferredName: '电影院', removeCategoryId: 'home', removeName: '看电影' },
];

function optionToTag(category: Category, option: Option, source: 'preset' | 'custom'): RecognizedTag {
  return {
    categoryId: category.id,
    optionId: option.id,
    name: option.name,
    isCustom: source === 'custom',
    source,
    categoryName: category.name,
    editable: false,
  };
}

function dedupeTags(tags: RecognizedTag[]): RecognizedTag[] {
  const seen: Record<string, boolean> = {};
  return tags.filter(tag => {
    const key = `${tag.categoryId}:${normalizeOptionName(tag.name)}`;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function removeConflictingTags(tags: RecognizedTag[]): RecognizedTag[] {
  return CONFLICT_RULES.reduce((current, rule) => {
    const hasPreferred = current.some(tag => tag.categoryId === rule.preferredCategoryId && tag.name === rule.preferredName);
    if (!hasPreferred) return current;
    return current.filter(tag => !(tag.categoryId === rule.removeCategoryId && tag.name === rule.removeName));
  }, tags);
}

function contentHasAll(content: string, keywords: string[]): boolean {
  return keywords.every(keyword => content.indexOf(keyword) >= 0);
}

function allowCategory(categoryId: string, options: RecognizeOptions): boolean {
  if (options.includeCategoryIds && options.includeCategoryIds.indexOf(categoryId) < 0) return false;
  if (options.excludeCategoryIds && options.excludeCategoryIds.indexOf(categoryId) >= 0) return false;
  return true;
}

function addAliasTags(content: string, categories: Category[], tags: RecognizedTag[], options: RecognizeOptions): void {
  ALIAS_RULES.forEach(rule => {
    if (!allowCategory(rule.categoryId, options)) return;
    if (!contentHasAll(content, rule.keywords)) return;
    const category = categories.find(item => item.id === rule.categoryId);
    const option = category && category.options.find(item => item.name === rule.optionName);
    if (!category || !option) return;
    tags.push(optionToTag(category, option, option.id.indexOf('cloud_') === 0 ? 'custom' : 'preset'));
  });
}

function addGenericTags(content: string, categories: Category[], tags: RecognizedTag[], options: RecognizeOptions): void {
  GENERIC_TAG_RULES.forEach(rule => {
    if (!allowCategory(rule.categoryId, options)) return;
    if (!contentHasAll(content, rule.keywords)) return;
    const category = categories.find(item => item.id === rule.categoryId);
    if (!category) return;
    const normalizedName = normalizeOptionName(rule.name);
    if (isCoveredByExistingTags(rule.name, tags)) return;
    tags.push({
      categoryId: category.id,
      optionId: buildCustomOptionId(category.id, normalizedName),
      name: rule.name,
      isCustom: true,
      source: 'candidate',
      categoryName: category.name,
      editable: true,
    });
  });
}

function stripCandidateNoise(candidate: string): string {
  let next = candidate.trim();
  let changed = true;
  while (changed) {
    const current = next;
    next = next
      .replace(/^(了|一个|一次|一下|去|到|的|和|跟|一起)/, '')
      .replace(/(了|一下|一次|一个|的)$/g, '');
    changed = current !== next;
  }
  return next;
}

function extractCandidateName(content: string, verb: string): string {
  const index = content.indexOf(verb);
  if (index < 0) return '';
  const tail = content.slice(index + verb.length).replace(/[，。！？、,.!?]/g, ' ');
  const token = tail.trim().split(/\s+/)[0] || '';
  const candidate = stripCandidateNoise(token).slice(0, 12);
  return candidate.length >= 2 ? candidate : '';
}

function isCoveredByExistingTags(candidateName: string, tags: RecognizedTag[]): boolean {
  const normalizedName = normalizeOptionName(candidateName);
  if (!normalizedName) return true;
  if (GENERIC_CANDIDATE_NAMES[candidateName]) return true;

  const matchedNames = tags.map(tag => normalizeOptionName(tag.name)).filter(Boolean);
  if (matchedNames.some(name => name === normalizedName || name.indexOf(normalizedName) >= 0)) return true;

  const containedMatches = matchedNames.filter(name => normalizedName.indexOf(name) >= 0);
  return containedMatches.length > 0;
}

export function recognizeDiaryTags(content: string, categories: Category[], options: RecognizeOptions = {}): RecognizedTag[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const tags: RecognizedTag[] = [];
  categories.forEach(category => {
    if (!allowCategory(category.id, options)) return;
    category.options.forEach(option => {
      if (option.name && trimmed.indexOf(option.name) >= 0) {
        tags.push(optionToTag(category, option, option.id.indexOf('cloud_') === 0 ? 'custom' : 'preset'));
      }
    });
  });
  addAliasTags(trimmed, categories, tags, options);
  addGenericTags(trimmed, categories, tags, options);

  CATEGORY_RULES.forEach(rule => {
    if (!allowCategory(rule.categoryId, options)) return;
    const category = categories.find(item => item.id === rule.categoryId);
    if (!category) return;
    rule.verbs.forEach(verb => {
      if (trimmed.indexOf(verb) < 0) return;
      const candidateName = extractCandidateName(trimmed, verb);
      if (!candidateName) return;
      const normalizedName = normalizeOptionName(candidateName);
      const exists = category.options.some(option => normalizeOptionName(option.name) === normalizedName);
      if (exists) return;
      if (isCoveredByExistingTags(candidateName, tags)) return;
      tags.push({
        categoryId: category.id,
        optionId: buildCustomOptionId(category.id, normalizedName),
        name: candidateName,
        isCustom: true,
        source: 'candidate',
        categoryName: category.name,
        editable: true,
      });
    });
  });

  return dedupeTags(tags);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskLocationInContent(content: string, location: string): string {
  const trimmedLocation = location.trim();
  if (!trimmedLocation) return content;
  return content.replace(new RegExp(escapeRegExp(trimmedLocation), 'g'), ' ');
}

function recognizeLocationTag(location: string, categories: Category[]): RecognizedTag[] {
  const name = location.trim();
  if (!name) return [];
  const category = categories.find(item => item.id === 'goout');
  if (!category) return [];
  const normalizedName = normalizeOptionName(name);
  const option = category.options.find(item => normalizeOptionName(item.name) === normalizedName);
  if (option) return [optionToTag(category, option, option.id.indexOf('cloud_') === 0 ? 'custom' : 'preset')];

  return [{
    categoryId: category.id,
    optionId: buildCustomOptionId(category.id, normalizedName),
    name,
    isCustom: true,
    source: 'candidate',
    categoryName: category.name,
    editable: true,
  }];
}

export function recognizeDiaryTagsForDiary(content: string, location: string, categories: Category[]): RecognizedTag[] {
  const contentTags = recognizeDiaryTags(maskLocationInContent(content, location), categories, { excludeCategoryIds: ['goout'] });
  const locationTags = recognizeLocationTag(location, categories);
  return removeConflictingTags(dedupeTags(contentTags.concat(locationTags)));
}
