import { Category, Option } from '../data/categories';
import { RecognizedTag } from '../types/diary';
import { buildCustomOptionId, normalizeOptionName } from './categoryOptions';

interface CategoryRule {
  categoryId: string;
  verbs: string[];
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

function extractCandidateName(content: string, verb: string): string {
  const index = content.indexOf(verb);
  if (index < 0) return '';
  const tail = content.slice(index + verb.length).replace(/[，。！？、,.!?]/g, ' ');
  const token = tail.trim().split(/\s+/)[0] || '';
  let candidate = token;
  let changed = true;
  while (changed) {
    const next = candidate.replace(/^(了|一个|一次|一下|去|到|的)/, '');
    changed = next !== candidate;
    candidate = next;
  }
  candidate = candidate.slice(0, 12);
  return candidate.length >= 2 ? candidate : '';
}

export function recognizeDiaryTags(content: string, categories: Category[]): RecognizedTag[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const tags: RecognizedTag[] = [];
  categories.forEach(category => {
    category.options.forEach(option => {
      if (option.name && trimmed.indexOf(option.name) >= 0) {
        tags.push(optionToTag(category, option, option.id.indexOf('cloud_') === 0 ? 'custom' : 'preset'));
      }
    });
  });

  CATEGORY_RULES.forEach(rule => {
    const category = categories.find(item => item.id === rule.categoryId);
    if (!category) return;
    rule.verbs.forEach(verb => {
      if (trimmed.indexOf(verb) < 0) return;
      const candidateName = extractCandidateName(trimmed, verb);
      if (!candidateName) return;
      const normalizedName = normalizeOptionName(candidateName);
      const exists = category.options.some(option => normalizeOptionName(option.name) === normalizedName);
      if (exists) return;
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
