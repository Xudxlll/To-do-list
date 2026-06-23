const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require.extensions['.ts'] = function registerTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { CATEGORIES } = require('../miniprogram/data/categories.ts');
const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');
const { recognizeDiaryTags, recognizeDiaryTagsForDiary } = require('../miniprogram/utils/diaryTags.ts');

const tags = recognizeDiaryTags('今天吃了火锅烤肉，去商场逛街了', CATEGORIES);
const names = tags.map(tag => tag.name);

assert(names.includes('火锅'), '应该识别已有标签：火锅');
assert(names.includes('烤肉'), '应该识别已有标签：烤肉');

['火锅烤肉', '商场逛街了', '逛街了', '街了'].forEach(name => {
  assert(!names.includes(name), `不应该生成重复/噪声标签：${name}`);
});

const customCandidates = tags.filter(tag => tag.source === 'candidate').map(tag => tag.name);
assert(customCandidates.length === 0, `这句话不应该生成新标签，实际生成：${customCandidates.join('、')}`);

const locationTags = recognizeDiaryTags(['今天一起散步', '深圳湾公园'].join(' '), CATEGORIES);
const locationNames = locationTags.map(tag => tag.name);
assert(locationNames.includes('深圳湾公园'), '地点内容应该参与自动识别标签');

const separatedTags = recognizeDiaryTagsForDiary('今天吃了火锅，然后去深圳湾公园散步', '深圳湾公园', CATEGORIES);
const separatedNames = separatedTags.map(tag => tag.name);
assert(separatedNames.includes('火锅'), '正文仍应识别非地点标签');
assert(separatedNames.includes('深圳湾公园'), '地点字段应识别去哪逛标签');
assert(
  separatedTags.filter(tag => tag.categoryId === 'goout' && tag.name === '深圳湾公园').length === 1,
  '正文和地点不能重复识别同一个地点标签'
);

const genericLocationTags = recognizeDiaryTagsForDiary('今天吃了火锅烤肉，去商场逛街了', '商场', CATEGORIES);
assert(
  genericLocationTags.some(tag => tag.categoryId === 'goout' && tag.name === '商场'),
  '地点字段填写泛化地点时，应作为今天去哪逛标签'
);
assert(
  genericLocationTags.some(tag => tag.categoryId === 'eat' && tag.name === '火锅'),
  '地点字段不能影响正文里的吃饭标签识别'
);

const contentOnlyGooutTags = recognizeDiaryTagsForDiary('今天去了深圳湾公园散步', '', CATEGORIES);
assert(
  !contentOnlyGooutTags.some(tag => tag.categoryId === 'goout'),
  '正文里的地点不应再生成今天去哪逛标签'
);

const movieTags = recognizeDiaryTagsForDiary('今天喝了奶茶看电影', '', CATEGORIES);
assert(
  movieTags.some(tag => tag.categoryId === 'watch' && tag.name === '电影院'),
  '看电影应优先识别到今天看什么'
);
assert(
  movieTags.some(tag => tag.categoryId === 'drink' && tag.name === '奶茶'),
  '奶茶应识别到今天喝什么'
);
assert(
  !movieTags.some(tag => tag.categoryId === 'home' && tag.name === '看电影'),
  '看电影不应同时重复识别到宅家模式'
);

const catalog = buildCatalog([]);
const eatCategory = catalog.find(category => category.id === 'eat');
const existing = eatCategory.options.find(option => option.name === '湘菜');
const existingGroup = eatCategory.optionGroups.find(group => group.id === existing.groupId);
const matched = recognizeDiaryTagsForDiary('晚上去吃湘菜', '', catalog);
assert(matched[0].optionId === existing.id && matched[0].source !== 'candidate', '已有标签应复用稳定 ID');
assert(matched[0].groupId === existing.groupId, '已有标签应携带当前子分类 ID');
assert(matched[0].groupName === existingGroup.title, '已有标签应携带当前子分类名称');

const deletedCatalog = buildCatalog([
  {
    recordType: 'option',
    optionId: existing.id,
    categoryId: 'eat',
    groupId: existing.groupId,
    source: 'preset',
    name: existing.name,
    normalizedName: '湘菜',
    description: '',
    deleted: true,
    createdAt: 1,
    updatedAt: 2,
  },
]);
const deletedMatches = recognizeDiaryTagsForDiary('晚上去吃湘菜', '', deletedCatalog);
assert(
  !deletedMatches.some(tag => tag.optionId === existing.id && tag.source !== 'candidate'),
  '已删除选项不应通过最终目录继续命中旧稳定 ID'
);

console.log('diary tag checks passed');
