const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const assert = require('assert').strict;

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
    Promise,
    setTimeout,
    ...extraSandbox,
  };
  vm.runInNewContext(compiled, sandbox, { filename });
  return module.exports;
}

const categories = loadTsModule('miniprogram/data/categories.ts');

function createShareData(fromUser, optionName) {
  return {
    fromUser,
    mode: 'selection',
    timestamp: Date.now(),
    selections: [{
      categoryId: 'eat',
      categoryName: '今天吃什么',
      options: [{ id: `option_${optionName}`, groupId: 'other', name: optionName, emoji: '', isCustom: true }],
    }],
  };
}

function loadResultComponent({ lockedPlan, partnerShareData }) {
  let componentDef = null;
  const appMock = {
    globalData: {
      nickname: 'A',
      selections: {},
      partnerShareData,
    },
    getDateString() {
      return '2026-06-24';
    },
    saveSelections() {},
    async saveLockedState() {},
    async clearLockedState() {},
  };

  loadTsModule('miniprogram/pages/result/result.ts', {
    Component(def) {
      componentDef = def;
    },
    getApp() {
      return appMock;
    },
    getCurrentPages() {
      return [{ options: {} }];
    },
    wx: {
      getStorageSync() { return null; },
      setStorageSync() {},
      removeStorageSync() {},
      reLaunch() {},
      navigateTo() {},
      showToast() {},
    },
    require(request) {
      if (request === '../../data/categories') return categories;
      if (request === '../../services/lockedPlans') {
        return {
          async getLockedPlan(date) {
            assert.equal(date, '2026-06-24', '结果页应按今天日期查询云端锁定计划');
            return lockedPlan;
          },
        };
      }
      return require(request);
    },
  });

  assert(componentDef, 'result 页面应注册 Component');
  const instance = {
    data: JSON.parse(JSON.stringify(componentDef.data)),
    setData(patch) {
      this.data = { ...this.data, ...patch };
    },
  };
  Object.entries(componentDef.methods).forEach(([name, fn]) => {
    instance[name] = fn.bind(instance);
  });
  return { componentDef, instance };
}

async function runCloudLockedPlanWinsTest() {
  const partnerShareData = createShareData('A', '火锅');
  const cloudShareData = createShareData('B', '椰子鸡');
  const { componentDef, instance } = loadResultComponent({
    partnerShareData,
    lockedPlan: {
      date: '2026-06-24',
      shareData: cloudShareData,
      createdAt: 1,
      updatedAt: 2,
    },
  });

  await componentDef.lifetimes.attached.call(instance);

  assert.equal(instance.data.isLocked, true, '普通结果页发现云端锁定计划后应进入锁定态');
  assert.equal(instance.data.navTitle, '今日已定 🔒', '云端锁定态应显示锁定标题');
  assert.equal(instance.data.summaryTitle, '今天的计划已确定！', '云端锁定态应显示已确定文案');
  assert.equal(instance.data.lockedShareData.fromUser, 'B', '页面应采用云端锁定的分享数据');
  assert.deepEqual(
    instance.data.partnerSelections[0].options.map(option => option.name),
    ['椰子鸡'],
    '页面应展示云端锁定结果，而不是 A 本地普通汇总'
  );
}

async function runPartnerViewFallbackTest() {
  const partnerShareData = createShareData('A', '火锅');
  const { componentDef, instance } = loadResultComponent({
    partnerShareData,
    lockedPlan: null,
  });

  await componentDef.lifetimes.attached.call(instance);

  assert.equal(instance.data.isLocked, false, '没有云端锁定计划时应保持普通汇总态');
  assert.equal(instance.data.navTitle, '收到选择', '普通汇总态标题不应被误改为锁定');
  assert.deepEqual(
    instance.data.partnerSelections[0].options.map(option => option.name),
    ['火锅'],
    '普通汇总态应展示当前分享数据'
  );
}

async function main() {
  await runCloudLockedPlanWinsTest();
  await runPartnerViewFallbackTest();
  console.log('result locked sync checks passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
