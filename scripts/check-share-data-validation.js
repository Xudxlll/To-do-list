const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function loadCategories() {
  const filename = path.join(__dirname, '..', 'miniprogram', 'data', 'categories.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
    encodeURIComponent,
    decodeURIComponent,
    JSON,
    String,
    Number,
    Array,
    Object,
  };
  vm.runInNewContext(compiled, sandbox, { filename });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { validateShareData } = loadCategories();

assert(validateShareData({
  fromUser: '我',
  mode: 'selection',
  timestamp: Date.now(),
  selections: [{
    categoryId: 'eat',
    categoryName: '今天吃什么',
    options: [{ id: 'eat_hotpot_0', name: '火锅', emoji: '', isCustom: false }],
  }],
}), '合法选择分享数据应通过校验');

assert(!validateShareData(null), 'null 不应通过校验');
assert(!validateShareData({ shareData: {} }), '错误结构不应通过校验');
assert(!validateShareData({ fromUser: '我', timestamp: Date.now(), selections: {} }), 'selections 非数组不应通过校验');
assert(!validateShareData({ fromUser: '我', timestamp: Date.now(), selections: [{ categoryId: 'eat', categoryName: '吃', options: {} }] }), 'options 非数组不应通过校验');
assert(validateShareData({ fromUser: '我', mode: 'freeText', timestamp: Date.now(), selections: [], freeText: '随性过' }), '随性过分享数据应通过校验');

console.log('share data validation checks passed');
