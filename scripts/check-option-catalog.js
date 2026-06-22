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

const { CATEGORIES } = require('../miniprogram/data/categories.ts');
const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');

const preset = CATEGORIES.find(category => category.id === 'eat');
assert(preset.optionGroups[0].options[0].groupId === 'cuisine', '默认选项应携带稳定 groupId');

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

console.log('option catalog checks passed');
