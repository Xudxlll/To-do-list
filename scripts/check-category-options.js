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

const { mergeCustomOptions } = require('../miniprogram/utils/categoryOptions.ts');

const categories = mergeCustomOptions([
  {
    _id: 'custom_eat_test',
    categoryId: 'eat',
    name: '芝士焗饭',
    normalizedName: '芝士焗饭',
    createdAt: Date.now(),
  },
]);

const eat = categories.find(category => category.id === 'eat');
const otherGroup = eat && eat.optionGroups.find(group => group.id === 'other');
const option = otherGroup && otherGroup.options.find(item => item.name === '芝士焗饭');

assert(option, '云端自定义标签应该进入对应大类的其他分组');
assert(option.canDelete === true, '云端自定义标签应该可以删除');

console.log('category option checks passed');
