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

function findOption(categories, optionId) {
  return categories.flatMap(category => category.options).find(option => option.id === optionId);
}

function countOption(categories, optionId) {
  return categories.flatMap(category => category.options).filter(option => option.id === optionId).length;
}

function getGroupOptionIds(categories, categoryId, groupId) {
  const category = categories.find(item => item.id === categoryId);
  const group = category && category.optionGroups.find(item => item.id === groupId);
  return group ? group.options.map(option => option.id) : [];
}

function getSelectionOptionIds(selections) {
  return selections.flatMap(item => item.options.map(option => option.id));
}

const { CATEGORIES } = require('../miniprogram/data/categories.ts');
const {
  buildCatalog,
  createStableOptionId,
  findOptionByName,
  normalizeOptionName,
  reconcileSelections,
  searchCatalog,
  validateOptionInput,
} = require('../miniprogram/utils/optionCatalog.ts');

const preset = CATEGORIES.find(category => category.id === 'eat');
assert(preset.optionGroups[0].options[0].groupId === 'cuisine', '默认选项应携带稳定 groupId');
assert(typeof normalizeOptionName === 'function', 'normalizeOptionName 应从 optionCatalog 导出');
assert(normalizeOptionName('  川 菜  ') === '川菜', 'normalizeOptionName 应复用稳定归一化逻辑');

const stableId = createStableOptionId(1700000000000, 'a-b_c!');
assert(stableId === 'option_loyw3v28_abc', 'createStableOptionId 应生成稳定前缀并清洗随机片段');
assert(/^option_[a-z0-9]+_[A-Za-z0-9]+$/.test(createStableOptionId(1, '!!!')), 'createStableOptionId 应保证随机片段非空');

const cuisineId = preset.optionGroups[0].options[0].id;
const hotpotId = preset.optionGroups[1].options[0].id;
const hotpotSecondId = preset.optionGroups[1].options[1].id;
const grillId = preset.optionGroups[2].options[0].id;
const grillSecondId = preset.optionGroups[2].options[1].id;

const groupOrderCatalog = buildCatalog([
  {
    recordType: 'group_order',
    categoryId: 'eat',
    groupId: 'hotpot',
    optionIds: [hotpotSecondId, 'deleted_hotpot_id', hotpotId],
    updatedAt: 10,
    _id: 'group-order-b',
  },
  {
    recordType: 'group_order',
    categoryId: 'eat',
    groupId: 'hotpot',
    optionIds: [hotpotId, hotpotSecondId],
    updatedAt: 10,
    _id: 'group-order-a',
  },
  {
    recordType: 'option',
    optionId: 'deleted_hotpot_id',
    categoryId: 'eat',
    groupId: 'hotpot',
    source: 'preset',
    name: '已删除火锅',
    normalizedName: '已删除火锅',
    description: '',
    deleted: true,
    createdAt: 1,
    updatedAt: 11,
  },
]);
assert(JSON.stringify(getGroupOptionIds(groupOrderCatalog, 'eat', 'hotpot')) === JSON.stringify([
  hotpotSecondId,
  hotpotId,
  preset.optionGroups[1].options[2].id,
  preset.optionGroups[1].options[3].id,
  preset.optionGroups[1].options[4].id,
  preset.optionGroups[1].options[5].id,
  preset.optionGroups[1].options[6].id,
  preset.optionGroups[1].options[7].id,
  preset.optionGroups[1].options[8].id,
  preset.optionGroups[1].options[9].id,
]), 'GroupOrderRecord 应按最新确定性版本排序，并过滤删除与缺失项后追加其余 live IDs');

const legacyOrderMap = {
  'eat:grill': [grillId, grillSecondId],
};
const legacyOrderCatalog = buildCatalog([], legacyOrderMap);
assert(JSON.stringify(getGroupOptionIds(legacyOrderCatalog, 'eat', 'grill').slice(0, 2)) === JSON.stringify([grillId, grillSecondId]), '无云 order 时应回退到本地 OptionOrderMap');

const cloudOrderCatalog = buildCatalog([
  {
    recordType: 'group_order',
    categoryId: 'eat',
    groupId: 'grill',
    optionIds: [grillSecondId, grillId],
    updatedAt: 20,
    _id: 'cloud-order',
  },
], legacyOrderMap);
assert(JSON.stringify(getGroupOptionIds(cloudOrderCatalog, 'eat', 'grill').slice(0, 2)) === JSON.stringify([grillSecondId, grillId]), '云端 group order 应覆盖本地 fallback');

const validationCategoryId = 'eat';
const validationGroupId = 'cuisine';
const validationOptionId = preset.optionGroups[0].options[1].id;
assert(validateOptionInput(CATEGORIES, { categoryId: ' eat ', groupId: ' cuisine ', name: ' 新 标签 ' }).ok, '合法输入应通过校验');
assert(validateOptionInput(CATEGORIES, { categoryId: 'eat', groupId: 'cuisine', name: '   ' }).code === 'empty', '空名应被拒绝');
assert(validateOptionInput(CATEGORIES, { categoryId: 'eat', groupId: 'cuisine', name: 'x'.repeat(31) }).code === 'too_long', '名称超过 30 字应被拒绝');
assert(validateOptionInput(CATEGORIES, {
  categoryId: 'eat',
  groupId: 'cuisine',
  name: 'x',
  description: 'y'.repeat(161),
}).code === 'description_too_long', '描述超过 160 字应被拒绝');
assert(validateOptionInput(CATEGORIES, { categoryId: 'missing', groupId: 'cuisine', name: 'x' }).code === 'category', '非法分类应被拒绝');
assert(validateOptionInput(CATEGORIES, { categoryId: 'eat', groupId: 'missing', name: 'x' }).code === 'group', '非法分组应被拒绝');
assert(validateOptionInput(CATEGORIES, { categoryId: validationCategoryId, groupId: validationGroupId, name: '川 菜' }).code === 'duplicate', '同大分类规范化重名应被拒绝');
assert(validateOptionInput(CATEGORIES, { categoryId: validationCategoryId, groupId: validationGroupId, name: '川 菜' }, validationOptionId).code === 'ok', '编辑同一选项时应允许 excludeOptionId');

const searchCatalogResult = searchCatalog(CATEGORIES, '龙华商业中心');
assert(searchCatalogResult.length > 0, 'searchCatalog 应能匹配描述');
assert(searchCatalogResult[0].categoryName === '今天去哪逛', 'searchCatalog 结果应带回大分类名');
assert(searchCatalogResult[0].groupName === '商圈商场', 'searchCatalog 结果应带回子分类名');
assert(searchCatalog(CATEGORIES, '壹方天地').some(item => item.option.name === '壹方天地'), 'searchCatalog 应能匹配名称');

const namedOption = findOptionByName(CATEGORIES, '壹方天地');
assert(namedOption && namedOption.categoryId === 'goout' && namedOption.groupName === '商圈商场', 'findOptionByName 应支持按名称查找并返回分组信息');

const newManagedRecords = [
  {
    recordType: 'option', optionId: 'stable_managed_b', categoryId: 'eat', groupId: 'hotpot',
    source: 'custom', name: '完全同字段', normalizedName: '完全同字段', description: '',
    deleted: false, createdAt: 20, updatedAt: 20,
  },
  {
    recordType: 'option', optionId: 'stable_managed_a', categoryId: 'eat', groupId: 'hotpot',
    source: 'custom', name: '完全同字段', normalizedName: '完全同字段', description: '',
    deleted: false, createdAt: 20, updatedAt: 20,
  },
];
const getNewManagedIds = records => getGroupOptionIds(buildCatalog(records), 'eat', 'hotpot')
  .filter(id => id.startsWith('stable_managed_'));
const newManagedForwardIds = getNewManagedIds(newManagedRecords);
const newManagedReversedIds = getNewManagedIds([...newManagedRecords].reverse());
assert(JSON.stringify(newManagedForwardIds) === JSON.stringify(newManagedReversedIds), '完全同戳同字段的新 managed 项反转输入后组内顺序应一致');

const migratedCatalog = buildCatalog([
  {
    recordType: 'option',
    optionId: 'stable_option_migrated',
    categoryId: 'goout',
    groupId: 'park',
    source: 'custom',
    name: '迁移后的选项',
    normalizedName: '迁移后的选项',
    description: '最新描述',
    deleted: false,
    createdAt: 1,
    updatedAt: 30,
  },
]);
const migratedSelections = reconcileSelections(migratedCatalog, [{
  categoryId: 'eat',
  categoryName: '今天吃什么',
  options: [
    {
      id: 'stable_option_migrated',
      groupId: 'hotpot',
      name: '旧快照名字',
      emoji: '',
      isCustom: true,
      canDelete: true,
      description: '旧快照描述',
    },
  ],
}]);
assert(migratedSelections.length === 1, '稳定 ID 迁移到不同 category 时仍应保留旧分享条目');
assert(migratedSelections[0].categoryId === 'goout' && migratedSelections[0].categoryName === '今天去哪逛', '稳定 ID 迁移到不同 category 时应更新 Selection 分类信息');
assert(migratedSelections[0].options[0].name === '迁移后的选项' && migratedSelections[0].options[0].groupId === 'park', '稳定 ID 迁移到不同 category 时应返回最新选项');

const splitCatalog = buildCatalog([
  {
    recordType: 'option', optionId: 'stable_split_goout_first',
    categoryId: 'goout', groupId: 'park', source: 'custom', name: '跨类公园',
    normalizedName: '跨类公园', description: '', deleted: false, createdAt: 1, updatedAt: 31,
  },
  {
    recordType: 'option', optionId: 'stable_split_eat',
    categoryId: 'eat', groupId: 'grill', source: 'custom', name: '跨类烧烤',
    normalizedName: '跨类烧烤', description: '', deleted: false, createdAt: 1, updatedAt: 32,
  },
  {
    recordType: 'option', optionId: 'stable_split_goout_second',
    categoryId: 'goout', groupId: 'sea', source: 'custom', name: '跨类海边',
    normalizedName: '跨类海边', description: '', deleted: false, createdAt: 1, updatedAt: 33,
  },
]);
const splitSelections = reconcileSelections(splitCatalog, [{
  categoryId: 'eat',
  categoryName: '今天吃什么',
  options: [
    { id: 'stable_split_goout_first', groupId: 'hotpot', name: '旧公园', emoji: '', isCustom: true },
    { id: 'stable_split_eat', groupId: 'hotpot', name: '旧烧烤', emoji: '', isCustom: true },
    { id: 'stable_split_goout_second', groupId: 'hotpot', name: '旧海边', emoji: '', isCustom: true },
  ],
}]);
assert(JSON.stringify(splitSelections.map(item => item.categoryId)) === JSON.stringify(['goout', 'eat']), '一个旧 Selection 解析到多个分类时应按分类首次出现顺序拆组');
assert(JSON.stringify(splitSelections[0].options.map(option => option.id)) === JSON.stringify([
  'stable_split_goout_first',
  'stable_split_goout_second',
]), '拆组后应保留输入内同分类选项的解析顺序');
assert(JSON.stringify(splitSelections[1].options.map(option => option.id)) === JSON.stringify(['stable_split_eat']), '拆组后每个 Selection 应只包含实际分类的选项');

const reconcileCatalog = buildCatalog([
  {
    recordType: 'option',
    optionId: 'stable_option_live',
    categoryId: 'eat',
    groupId: 'grill',
    source: 'custom',
    name: '稳定新名',
    normalizedName: '稳定新名',
    description: '稳定新描述',
    deleted: false,
    createdAt: 1,
    updatedAt: 20,
  },
  {
    recordType: 'option',
    optionId: 'stable_option_deleted',
    categoryId: 'eat',
    groupId: 'grill',
    source: 'custom',
    name: '已删除项',
    normalizedName: '已删除项',
    description: '已删除描述',
    deleted: true,
    createdAt: 1,
    updatedAt: 21,
  },
  {
    recordType: 'option',
    optionId: 'stable_option_compat',
    categoryId: 'eat',
    groupId: 'hotpot',
    source: 'custom',
    name: '同名兼容项',
    normalizedName: '同名兼容项',
    description: '当前描述',
    deleted: false,
    createdAt: 1,
    updatedAt: 22,
  },
]);
const reconciledSelections = reconcileSelections(reconcileCatalog, [{
  categoryId: 'eat',
  categoryName: '今天吃什么',
  options: [
    {
      id: 'stable_option_live',
      groupId: 'hotpot',
      name: '旧名字',
      emoji: '',
      isCustom: true,
      canDelete: true,
      description: '旧描述',
    },
    {
      id: 'legacy_unknown_id',
      groupId: 'other',
      name: '同名兼容项',
      emoji: '',
      isCustom: true,
      canDelete: true,
      description: '旧快照描述',
    },
    {
      id: 'stable_option_deleted',
      groupId: 'grill',
      name: '已删除项',
      emoji: '',
      isCustom: true,
      canDelete: true,
      description: '旧删除描述',
    },
  ],
}]);
assert(reconciledSelections.length === 1, 'reconcileSelections 应保留分类结构');
assert(JSON.stringify(getSelectionOptionIds(reconciledSelections)) === JSON.stringify(['stable_option_live', 'stable_option_compat']), 'reconcileSelections 应刷新稳定 ID、兼容同名旧快照并过滤已删除项');
assert(reconciledSelections[0].options[0].name === '稳定新名' && reconciledSelections[0].options[0].groupId === 'grill' && reconciledSelections[0].options[0].description === '稳定新描述', 'reconcileSelections 应按稳定 ID 刷新 name/description/groupId');
assert(reconciledSelections[0].options[1].id === 'stable_option_compat' && reconciledSelections[0].options[1].description === '当前描述', 'reconcileSelections 应按同名旧快照兼容匹配当前选项');

const catalog = buildCatalog([
  {
    recordType: 'option',
    optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat',
    groupId: 'hotpot',
    source: 'preset',
    name: '改名湘菜',
    normalizedName: '改名湘菜',
    description: '新的描述',
    deleted: false,
    createdAt: 1,
    updatedAt: 2,
  },
]);
const moved = catalog.find(category => category.id === 'eat').optionGroups
  .find(group => group.id === 'hotpot').options
  .find(option => option.name === '改名湘菜');
assert(moved && moved.description === '新的描述', '覆盖记录应改名、改描述并跨组移动默认项');

const latestCatalog = buildCatalog([
  {
    recordType: 'option', optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat', groupId: 'hotpot', source: 'preset', name: '旧覆盖',
    normalizedName: '旧覆盖', description: '旧描述', deleted: false, createdAt: 1, updatedAt: 2,
  },
  {
    recordType: 'option', optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat', groupId: 'grill', source: 'preset', name: '最新覆盖',
    normalizedName: '最新覆盖', description: '最新描述', deleted: false, createdAt: 1, updatedAt: 3,
  },
]);
assert(findOption(latestCatalog, preset.optionGroups[0].options[0].id).name === '最新覆盖', '应按 updatedAt 应用最新覆盖');

const tiedManagedRecords = [
  {
    _id: 'record-z', recordType: 'option', optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat', groupId: 'hotpot', source: 'preset', name: '较早创建',
    normalizedName: '较早创建', description: '', deleted: false, createdAt: 1, updatedAt: 10,
  },
  {
    _id: 'record-a', recordType: 'option', optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat', groupId: 'hotpot', source: 'preset', name: '同戳较新创建',
    normalizedName: '同戳较新创建', description: '', deleted: false, createdAt: 2, updatedAt: 10,
  },
  {
    _id: 'record-b', recordType: 'option', optionId: preset.optionGroups[0].options[0].id,
    categoryId: 'eat', groupId: 'hotpot', source: 'preset', name: '确定性胜出',
    normalizedName: '确定性胜出', description: '', deleted: false, createdAt: 2, updatedAt: 10,
  },
];
const tiedForward = findOption(buildCatalog(tiedManagedRecords), preset.optionGroups[0].options[0].id);
const tiedReversed = findOption(buildCatalog([...tiedManagedRecords].reverse()), preset.optionGroups[0].options[0].id);
assert(tiedForward.name === '确定性胜出', 'updatedAt 同值时应依次按 createdAt 和 _id 选择');
assert(tiedReversed.name === tiedForward.name, '相同 managed 记录颠倒输入顺序应得到一致结果');

const deletedCatalog = buildCatalog([{
  recordType: 'option', optionId: preset.optionGroups[0].options[1].id,
  categoryId: 'eat', groupId: 'cuisine', source: 'preset', name: '川菜',
  normalizedName: '川菜', description: '', deleted: true, createdAt: 1, updatedAt: 2,
}]);
assert(!findOption(deletedCatalog, preset.optionGroups[0].options[1].id), 'tombstone 应删除默认项');

const legacyId = 'cloud_eat_芝士焗饭';
const legacyOverrideCatalog = buildCatalog([
  { categoryId: 'eat', name: '芝士焗饭', normalizedName: '芝士焗饭', createdAt: 1 },
  {
    recordType: 'option', optionId: legacyId,
    categoryId: 'eat', groupId: 'grill', source: 'custom', name: '芝士焗饭新版',
    normalizedName: '芝士焗饭新版', description: '新版描述', deleted: false, createdAt: 1, updatedAt: 2,
  },
]);
const legacyOverride = findOption(legacyOverrideCatalog, legacyId);
assert(legacyOverride && legacyOverride.groupId === 'grill' && legacyOverride.isCustom, 'managed 记录应按稳定 ID 覆盖 legacy 项');

const duplicateLegacyCatalog = buildCatalog([
  { categoryId: 'eat', name: '芝士焗饭', normalizedName: '芝士焗饭', createdAt: 1 },
  { categoryId: 'eat', name: ' 芝士焗饭 ', normalizedName: '芝 士 焗 饭', createdAt: 2 },
  { categoryId: 'eat', name: '湘菜', normalizedName: '湘菜', createdAt: 3 },
]);
assert(countOption(duplicateLegacyCatalog, legacyId) === 1, '重复 legacy 记录应按稳定 ID 和 normalizedName 去重');
assert(countOption(duplicateLegacyCatalog, 'cloud_eat_湘菜') === 0, 'legacy 不得复制同分类 preset 同名项');

const tiedLegacyRecords = [
  { _id: 'legacy-a', categoryId: 'eat', name: '芝士 焗饭旧名', normalizedName: '芝士焗饭同款', createdAt: 10 },
  { _id: 'legacy-b', categoryId: 'eat', name: '芝士焗饭新名', normalizedName: '芝士焗饭同款', createdAt: 20 },
  { _id: 'legacy-c', categoryId: 'eat', name: '麻辣拌', normalizedName: '麻辣拌', createdAt: 15 },
];
const tiedLegacyForward = buildCatalog(tiedLegacyRecords);
const tiedLegacyReversed = buildCatalog([...tiedLegacyRecords].reverse());
const tiedLegacyForwardOptions = getGroupOptionIds(tiedLegacyForward, 'eat', 'other').map(id => {
  const option = findOption(tiedLegacyForward, id);
  return [option.id, option.name];
});
const tiedLegacyReversedOptions = getGroupOptionIds(tiedLegacyReversed, 'eat', 'other').map(id => {
  const option = findOption(tiedLegacyReversed, id);
  return [option.id, option.name];
});
assert(JSON.stringify(tiedLegacyForwardOptions) === JSON.stringify(tiedLegacyReversedOptions), 'legacy 记录正序和逆序应生成相同选项顺序与名称');
assert(findOption(tiedLegacyForward, 'cloud_eat_芝士焗饭同款').name === '芝士焗饭新名', '同 category 和 normalizedName 的 legacy 记录应由 createdAt 较新者胜出');

const invalidTargetCatalog = buildCatalog([{
  recordType: 'option', optionId: preset.optionGroups[0].options[2].id,
  categoryId: 'eat', groupId: 'missing_group', source: 'preset', name: '不应生效',
  normalizedName: '不应生效', description: '', deleted: false, createdAt: 1, updatedAt: 2,
}]);
assert(findOption(invalidTargetCatalog, preset.optionGroups[0].options[2].id).name === '赣菜', '无效目标组应保留原 preset');

const presetSnapshot = JSON.stringify(CATEGORIES);
const clonedCatalog = buildCatalog([]);
clonedCatalog[0].optionGroups[0].options[0].name = '只改克隆';
assert(JSON.stringify(CATEGORIES) === presetSnapshot, '构建和修改克隆不得污染 CATEGORIES');

const tombstonedLegacyCatalog = buildCatalog([
  { categoryId: 'eat', name: '芝士焗饭', normalizedName: '芝士焗饭', createdAt: 1 },
  { categoryId: 'eat', name: '芝士焗饭', normalizedName: '芝士焗饭', createdAt: 2 },
  {
    recordType: 'option', optionId: legacyId,
    categoryId: 'eat', groupId: 'other', source: 'custom', name: '芝士焗饭',
    normalizedName: '芝士焗饭', description: '', deleted: true, createdAt: 1, updatedAt: 3,
  },
]);
assert(countOption(tombstonedLegacyCatalog, legacyId) === 0, 'tombstone 必须删除所有同 ID legacy 副本且不得复活');

const otherInputCatalog = buildCatalog([{
  recordType: 'option', optionId: 'option_other_saved',
  categoryId: 'eat', groupId: 'other', source: 'custom', name: '其他分组新增',
  normalizedName: '其他分组新增', description: '', deleted: false, createdAt: 1, updatedAt: 2,
}]);
assert(validateOptionInput(otherInputCatalog, {
  categoryId: 'eat',
  groupId: 'other',
  name: '其他分组编辑后',
  description: '',
}).ok === true, 'other 分组应允许新增和编辑输入');
assert(countOption(otherInputCatalog, 'option_other_saved') === 1, 'other 分组的 managed 记录应能合并进目录');

console.log('option catalog checks passed');
