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
  appendManualDiaryTag,
  appendExistingDiaryTag,
  prepareEditableDiaryTags,
  searchDiaryTagOptions,
  updateEditableDiaryTagName,
  syncDiaryCandidateTags,
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
assert(reboundTag.source !== 'candidate' && reboundTag.editable, '候选标签绑定已有选项后仍应可继续修改');

const [presetTag] = prepareEditableDiaryTags([
  {
    categoryId: 'eat',
    categoryName: '今天吃什么',
    optionId: eatCategory.options.find(option => option.name === '湘菜').id,
    name: '湘菜',
    isCustom: false,
    source: 'preset',
    groupId: cuisineGroup.id,
    groupName: cuisineGroup.title,
    editable: false,
  },
]);

assert(presetTag.editable, '自动识别出的已有标签也应允许修改');

const renamedPresetTag = updateEditableDiaryTagName([presetTag], 0, '私房菜', catalog)[0];
assert(renamedPresetTag.editKey === presetTag.editKey, '已有标签改名时 editKey 也应保持稳定');
assert(renamedPresetTag.source === 'candidate', '已有标签改成新名称后应作为候选新标签同步');
assert(renamedPresetTag.editable, '已有标签改成新名称后仍应保持可编辑');
assert(renamedPresetTag.groupId === cuisineGroup.id, '已有标签改名后应沿用原子分类，保证可以直接同步');

const manualTags = appendManualDiaryTag([], catalog);
assert(manualTags.length === 1, '手动添加标签应新增一条可编辑标签');
assert(manualTags[0].source === 'candidate', '手动添加标签应按候选共享选项处理');
assert(manualTags[0].editable, '手动添加标签应允许输入和修改');
assert(manualTags[0].categoryId === catalog[0].id, '手动添加标签默认使用第一个主分类');
assert(manualTags[0].groupId === catalog[0].optionGroups[0].id, '手动添加标签默认使用第一个子分类');
assert(manualTags[0].name === '', '手动添加标签默认留空等待用户输入');
assert(manualTags[0].editKey.indexOf('manual:') === 0, '手动添加标签应有稳定的手动 editKey 前缀');

const namedManualTag = updateEditableDiaryTagName(manualTags, 0, '手动新活动', catalog)[0];
assert(namedManualTag.source === 'candidate', '手动标签输入新名字后仍应作为候选共享选项');
assert(namedManualTag.groupId === manualTags[0].groupId, '手动标签输入后应保留默认子分类');

const gooutCatalog = buildCatalog([
  {
    recordType: 'option',
    optionId: 'option_shekou_seaworld',
    categoryId: 'goout',
    groupId: 'citywalk',
    source: 'custom',
    name: '蛇口海上世界',
    normalizedName: '蛇口海上世界',
    description: '',
    deleted: false,
    createdAt: 1,
    updatedAt: 1,
  },
]);
const searchMatches = searchDiaryTagOptions('海上世界', gooutCatalog, []);
assert(searchMatches.length > 0, '搜索已有标签应支持用部分地点名命中完整标签');
assert(searchMatches[0].option.name === '蛇口海上世界', '部分匹配应返回已有标签“蛇口海上世界”');
const withExistingTag = appendExistingDiaryTag([], searchMatches[0]);
assert(withExistingTag.length === 1, '点击搜索结果应加入一个已选标签');
assert(withExistingTag[0].optionId === 'option_shekou_seaworld', '加入已有标签应保留稳定 optionId');
assert(withExistingTag[0].source === 'custom', '加入已有自定义标签不应当作 candidate 新建');
assert(
  !searchDiaryTagOptions('海上世界', gooutCatalog, withExistingTag)
    .some(result => result.option.id === 'option_shekou_seaworld'),
  '已加入的搜索结果不应重复显示'
);

syncDiaryCandidateTags([renamedPresetTag], catalog, async input => ({
  id: 'option_synced_from_preset_edit',
  groupId: input.groupId,
  name: input.name,
  emoji: '',
  isCustom: true,
  canDelete: true,
})).then(synced => {
  assert(synced[0].optionId === 'option_synced_from_preset_edit', '修改后的已有标签应同步成共享选项');
  assert(synced[0].name === '私房菜', '同步后的共享选项应使用修改后的标签名');
  console.log('diary tag editing checks passed');
});
