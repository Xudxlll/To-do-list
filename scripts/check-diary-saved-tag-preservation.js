const fs = require('fs');
const assert = require('assert').strict;
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

const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');
const {
  prepareSavedDiaryTags,
  updateEditableDiaryTagName,
  syncDiaryCandidateTags,
} = require('../miniprogram/utils/diaryTagEditing.ts');

async function main() {
  const catalog = buildCatalog([]);
  const eatCategory = catalog.find(category => category.id === 'eat');
  const cuisineGroup = eatCategory.optionGroups.find(group => group.id === 'cuisine');
  const xiangcai = eatCategory.options.find(option => option.name === '湘菜');

  const savedTags = prepareSavedDiaryTags([
    {
      categoryId: 'eat',
      optionId: xiangcai.id,
      name: '用户确认过的湘菜标签',
      isCustom: false,
    },
  ], catalog);

  assert.equal(savedTags.length, 1, '已有日记应保留保存过的标签');
  assert.equal(savedTags[0].name, '用户确认过的湘菜标签', '已有日记不应用重新识别结果覆盖用户确认过的标签名');
  assert.equal(savedTags[0].optionId, xiangcai.id, '已有日记应保留原稳定 optionId');
  assert.equal(savedTags[0].groupId, cuisineGroup.id, '已有日记标签应从目录还原子分类，方便继续编辑');
  assert.equal(savedTags[0].groupName, cuisineGroup.title, '已有日记标签应从目录还原子分类名称');
  assert.equal(savedTags[0].editable, true, '已有日记标签再次保存前仍应可修改');

  const renamed = updateEditableDiaryTagName(savedTags, 0, '新增确认标签', catalog)[0];
  assert.equal(renamed.source, 'candidate', '已有标签改成新名字后应作为候选共享选项同步');
  assert.equal(renamed.groupId, cuisineGroup.id, '已有标签改名后应沿用可同步的原子分类');

  const synced = await syncDiaryCandidateTags([renamed], catalog, async input => ({
    id: 'option_preserved_tag_edit',
    groupId: input.groupId,
    name: input.name,
    emoji: '',
    isCustom: true,
    canDelete: true,
  }));
  assert.equal(synced[0].optionId, 'option_preserved_tag_edit', '修改后的已有标签应能同步到今天干什么目录');
  assert.equal(synced[0].name, '新增确认标签', '同步时应使用用户再次确认的标签名');
}

main().then(() => {
  console.log('diary saved tag preservation checks passed');
});
