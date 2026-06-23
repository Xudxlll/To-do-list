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

const { hydrateSharedOption, validateShareData } = loadCategories();

const legacySharedOption = { id: 'eat_hotpot_0', name: '火锅', emoji: '', isCustom: false };

assert(validateShareData({
  fromUser: '我',
  mode: 'selection',
  timestamp: Date.now(),
  selections: [{
    categoryId: 'eat',
    categoryName: '今天吃什么',
    options: [legacySharedOption],
  }],
}), '合法选择分享数据应通过校验');

const hydratedLegacyOption = hydrateSharedOption('eat', legacySharedOption);
assert(hydratedLegacyOption.groupId === 'hotpot', '旧分享进入运行时选择前应补齐稳定 groupId');

const correctedGroupOption = hydrateSharedOption('eat', { ...legacySharedOption, groupId: 'external_group' });
assert(correctedGroupOption.groupId === 'hotpot', '非法外部 groupId 应按 option id 回查真实固定组');

const matchedByNameOption = hydrateSharedOption('eat', {
  ...legacySharedOption,
  id: 'legacy_unknown_id',
  groupId: 'external_group',
});
assert(matchedByNameOption.groupId === 'hotpot', 'option id 未命中时应按 name 回查真实固定组');

const unresolvedOption = hydrateSharedOption('eat', {
  id: 'legacy_unknown_id',
  groupId: 'external_group',
  name: '未知选项',
  emoji: '',
  isCustom: true,
});
assert(unresolvedOption.groupId === '', '无法解析的旧分享选项应使用空 groupId 兼容值');

const trustedFixedGroupOption = hydrateSharedOption('eat', {
  ...legacySharedOption,
  id: 'legacy_unknown_id',
  groupId: 'grill',
});
assert(trustedFixedGroupOption.groupId === 'grill', '属于当前分类的固定 groupId 应保留');

assert(!validateShareData(null), 'null 不应通过校验');
assert(!validateShareData({ shareData: {} }), '错误结构不应通过校验');
assert(!validateShareData({ fromUser: '我', timestamp: Date.now(), selections: {} }), 'selections 非数组不应通过校验');
assert(!validateShareData({ fromUser: '我', timestamp: Date.now(), selections: [{ categoryId: 'eat', categoryName: '吃', options: {} }] }), 'options 非数组不应通过校验');
assert(validateShareData({ fromUser: '我', mode: 'freeText', timestamp: Date.now(), selections: [], freeText: '随性过' }), '随性过分享数据应通过校验');

console.log('share data validation checks passed');
