const fs = require('fs');
const ts = require('typescript');

global.wx = {
  storage: {},
  getStorageSync(key) {
    return this.storage[key];
  },
  setStorageSync(key, value) {
    this.storage[key] = value;
  },
};

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

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}: expected ${e}, received ${a}`);
}

const { applyOptionOrder, moveOptionInGroups, saveGroupOptionOrder, readOptionOrder } = require('../miniprogram/utils/optionOrder.ts');

const groups = [
  {
    id: 'food',
    title: '吃',
    options: [
      { id: 'a', name: 'A', emoji: '', isCustom: false },
      { id: 'b', name: 'B', emoji: '', isCustom: false },
      { id: 'c', name: 'C', emoji: '', isCustom: false },
    ],
  },
  {
    id: 'drink',
    title: '喝',
    options: [
      { id: 'd', name: 'D', emoji: '', isCustom: false },
      { id: 'e', name: 'E', emoji: '', isCustom: false },
    ],
  },
];

saveGroupOptionOrder('eat', 'food', ['c', 'a', 'b']);
const ordered = applyOptionOrder(groups, 'eat', readOptionOrder());
assertEqual(ordered[0].options.map(option => option.id), ['c', 'a', 'b'], '应应用已保存的分组排序');
assertEqual(ordered[1].options.map(option => option.id), ['d', 'e'], '不应影响其他分组');

const moved = moveOptionInGroups(ordered, 'food', 'a', 'up');
assertEqual(moved[0].options.map(option => option.id), ['a', 'c', 'b'], '应能上移当前选项');
assertEqual(moved[1].options.map(option => option.id), ['d', 'e'], '移动不应影响其他分组');

console.log('option order checks passed');
