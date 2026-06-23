const fs = require('fs');
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

const {
  prepareEditableDiaryTags,
  updateEditableDiaryTagName,
} = require('../miniprogram/utils/diaryTagEditing.ts');
const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');

const catalog = buildCatalog([]);
const eatCategory = catalog.find(category => category.id === 'eat');
const cuisineGroup = eatCategory.optionGroups.find(group => group.id === 'cuisine');

const [candidateTag] = prepareEditableDiaryTags([
  {
    categoryId: 'eat',
    categoryName: '今天吃什么',
    optionId: 'diary_candidate_eat_huoguo',
    name: '火锅',
    isCustom: true,
    source: 'candidate',
    groupId: cuisineGroup.id,
    groupName: cuisineGroup.title,
    editable: true,
  },
]);

const editedTags = updateEditableDiaryTagName([candidateTag], 0, '火锅店', catalog);
const editedTag = editedTags[0];

assert(candidateTag.editKey, '编辑标签应该有独立稳定的 editKey');
assert(
  editedTag.editKey === candidateTag.editKey,
  '输入修改标签名时 editKey 不应变化，避免输入框被重建导致输入法退焦'
);
assert(
  editedTag.optionId === 'diary_candidate_eat_火锅店',
  '候选标签临时 optionId 仍应随名称更新'
);
assert(editedTag.optionId.indexOf('cloud_') !== 0, '候选标签不应复用旧 cloud_* 选项 ID');
assert(editedTag.name === '火锅店', '候选标签名称应更新为用户输入值');
assert(editedTag.groupId === cuisineGroup.id, '候选标签改名后应保留仍有效的子分类');

const reboundTag = updateEditableDiaryTagName([candidateTag], 0, '湘菜', catalog)[0];
assert(reboundTag.optionId === eatCategory.options.find(option => option.name === '湘菜').id, '候选标签改成已有名称后应绑定已有选项');
assert(reboundTag.source !== 'candidate' && !reboundTag.editable, '候选标签绑定已有选项后应退出编辑态');

console.log('diary tag editing checks passed');
