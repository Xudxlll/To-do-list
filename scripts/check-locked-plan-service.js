const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function loadTsModule(relativePath, extraSandbox = {}) {
  const filename = path.join(__dirname, '..', relativePath);
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
    require: extraSandbox.require || require,
    console,
    Date,
    String,
    Number,
    Array,
    Object,
    JSON,
    ...extraSandbox,
  };
  vm.runInNewContext(compiled, sandbox, { filename });
  return module.exports;
}

const categories = loadTsModule('miniprogram/data/categories.ts');
const service = loadTsModule('miniprogram/services/lockedPlans.ts', {
  require(request) {
    if (request === '../config/cloud') {
      return {
        CLOUD_COLLECTIONS: { lockedPlans: 'locked_plans' },
        getCloudDb() {
          throw new Error('这个脚本只测试纯数据辅助函数');
        },
      };
    }
    if (request === '../data/categories') return categories;
    return require(request);
  },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const shareData = {
  fromUser: '我',
  mode: 'selection',
  timestamp: Date.now(),
  selections: [{
    categoryId: 'eat',
    categoryName: '今天吃什么',
    options: [{ id: 'eat_hotpot_0', name: '火锅', emoji: '', isCustom: false }],
  }],
};

assert(service.lockedPlanDocId('2026-06-05') === 'locked_plan_2026_06_05', '锁定计划应按日期生成稳定文档 ID');
assert(service.normalizeLockedPlanRecord({ date: '2026-06-05', shareData, createdAt: 1, updatedAt: 2 }, '2026-06-05'), '合法云端锁定计划应通过校验');
assert(!service.normalizeLockedPlanRecord({ date: '2026-06-04', shareData, createdAt: 1, updatedAt: 2 }, '2026-06-05'), '日期不匹配的锁定计划应被丢弃');
assert(!service.normalizeLockedPlanRecord({ date: '2026-06-05', shareData: { selections: {} }, createdAt: 1, updatedAt: 2 }, '2026-06-05'), '损坏分享数据应被丢弃');

console.log('locked plan service checks passed');
