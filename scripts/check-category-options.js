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

const categoryOptions = require('../miniprogram/utils/categoryOptions.ts');
const { buildCatalog } = require('../miniprogram/utils/optionCatalog.ts');

const records = [
  {
    _id: 'custom_eat_test',
    categoryId: 'eat',
    name: '芝士焗饭',
    normalizedName: '芝士焗饭',
    createdAt: Date.now(),
  },
];

function assertMergedOption(categories, sourceName) {
  const eat = categories.find(category => category.id === 'eat');
  const otherGroup = eat && eat.optionGroups.find(group => group.id === 'other');
  const option = otherGroup && otherGroup.options.find(item => item.name === '芝士焗饭');

  assert(option, `${sourceName} 应该把云端自定义标签合并到对应大类的其他分组`);
  assert(option.canDelete === true, `${sourceName} 合并的云端自定义标签应该可以删除`);
}

assert(typeof categoryOptions.mergeCustomOptions === 'undefined', 'categoryOptions 不应再保留重复 mergeCustomOptions 实现');
assert(typeof categoryOptions.buildCustomOptionId === 'undefined', 'categoryOptions 不应再导出旧 buildCustomOptionId');
assert(categoryOptions.normalizeOptionName('  A  B ') === 'ab', 'categoryOptions 可继续作为 normalizeOptionName 的安全兼容入口');
assertMergedOption(buildCatalog(records), 'buildCatalog');

console.log('category option checks passed');
