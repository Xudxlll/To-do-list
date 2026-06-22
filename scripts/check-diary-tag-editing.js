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

const [candidateTag] = prepareEditableDiaryTags([
  {
    categoryId: 'eat',
    categoryName: '今天吃什么',
    optionId: 'cloud_eat_huoguo',
    name: '火锅',
    isCustom: true,
    source: 'candidate',
    editable: true,
  },
]);

const editedTags = updateEditableDiaryTagName([candidateTag], 0, '火锅店');
const editedTag = editedTags[0];

assert(candidateTag.editKey, '编辑标签应该有独立稳定的 editKey');
assert(
  editedTag.editKey === candidateTag.editKey,
  '输入修改标签名时 editKey 不应变化，避免输入框被重建导致输入法退焦'
);
assert(
  editedTag.optionId === 'cloud_eat_火锅店',
  '候选标签保存用的 optionId 仍应随名称更新'
);
assert(editedTag.name === '火锅店', '候选标签名称应更新为用户输入值');

console.log('diary tag editing checks passed');
