const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const Module = require('module');
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertIncludes(source, text, message) {
  assert(source.includes(text), message);
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const tsSource = readFile('miniprogram/pages/index/index.ts');
const wxmlSource = readFile('miniprogram/pages/index/index.wxml');
const wxssSource = readFile('miniprogram/pages/index/index.wxss');

[
  'listOptionCatalogRecords',
  'readOptionCatalogCache',
  'buildCatalog',
  'reconcileSelections',
  'createSharedOption',
  'updateSharedOption',
  'deleteSharedOption',
  'searchCatalog',
].forEach(name => {
  assertIncludes(tsSource, name, `index.ts 必须使用 ${name}`);
});

[
  'catalogRecords',
  'manageMode',
  'collapsedGroups',
  'searchQuery',
  'searchResults',
  'editorVisible',
  'editorMode',
  'editingOptionId',
  'editorCategoryId',
  'editorGroupId',
  'editorName',
  'editorDescription',
  'editorSaving',
  'scrollIntoView',
].forEach(name => {
  assertIncludes(tsSource, name, `index.ts data 必须包含 ${name}`);
});

[
  'toggleManagementMode',
  'toggleOptionGroup',
  'collapseAllOptionGroups',
  'openOptionEditor',
  'onSearchInput',
  'onSearchResultTap',
  'saveOptionEditor',
].forEach(name => {
  assertIncludes(tsSource, name, `index.ts 必须实现 ${name}`);
});

[
  'listCustomOptions',
  'upsertCustomOptions',
  'deleteCustomOption',
  'loadCustomCategoryOptions',
  'onCustomInput',
  'onAddCustom',
  'onDeleteCloudCustom',
  'onDeleteCustom',
].forEach(name => {
  assert(!tsSource.includes(name), `index.ts 不应再保留旧路径 ${name}`);
});

[
  'sortMode',
  'currentCustomOptions',
  'inputValue',
].forEach(name => {
  assert(!tsSource.includes(name), `index.ts 不应再保留旧 UI 状态 ${name}`);
});

assert(/bind:tap="toggleOptionGroup"/.test(wxmlSource), 'WXML 必须支持分组折叠切换');
assert(/catch:tap="openOptionEditor"/.test(wxmlSource), 'WXML 分组 header 必须提供新增入口');
assert(/data-group-id="{{group.id}}"/.test(wxmlSource), 'WXML 分组 header 必须带 group id');
assert(/bind:input="onSearchInput"/.test(wxmlSource), 'WXML 必须提供搜索输入');
assert(/searchResults/.test(wxmlSource), 'WXML 必须渲染搜索结果');
assert(/bind:tap="onSearchResultTap"/.test(wxmlSource), 'WXML 搜索结果必须可点击');
assert(/editorName/.test(wxmlSource), 'WXML 编辑器必须绑定名称输入');
assert(/editorDescription/.test(wxmlSource), 'WXML 编辑器必须绑定描述输入');
assert(/option-desc/.test(wxmlSource), 'WXML 必须保留 option-desc');
assert(/manageMode/.test(wxmlSource), 'WXML 必须包含管理模式分支');
assert(/catch:tap="openOptionEditor"/.test(wxmlSource), 'WXML 管理模式必须有编辑入口');
assert(/catch:tap="onDeleteOption"/.test(wxmlSource), 'WXML 管理模式必须有删除入口');
assert(/scroll-into-view="{{scrollIntoView}}"/.test(wxmlSource), '右侧 scroll-view 必须绑定 scroll-into-view');

[
  'custom-input-row',
  'sort-actions',
  'toggleSortMode',
  'onMoveOption',
  'onCustomInput',
  'onAddCustom',
  'onDeleteCloudCustom',
  'onDeleteCustom',
].forEach(name => {
  assert(!wxmlSource.includes(name), `WXML 不应再保留旧路径 ${name}`);
});

[
  '.search-bar',
  '.group-header',
  '.management-actions',
  '.editor-modal',
  '.editor-textarea',
].forEach(selector => {
  assertIncludes(wxssSource, selector, `WXSS 必须包含 ${selector}`);
});

[
  '.custom-input-row',
  '.sort-actions',
  '.sort-btn',
].forEach(selector => {
  assert(!wxssSource.includes(selector), `WXSS 不应再保留旧样式 ${selector}`);
});

const BASE_CATALOG = [
  {
    id: 'eat',
    name: '今天吃什么',
    shortName: '吃',
    icon: '🍜',
    optionGroups: [
      {
        id: 'cuisine',
        title: '主食',
        options: [
          {
            id: 'hotpot',
            groupId: 'cuisine',
            name: '火锅',
            emoji: '🍲',
            isCustom: true,
            canDelete: true,
            description: '麻辣锅底',
          },
        ],
      },
    ],
  },
  {
    id: 'play',
    name: '今天玩什么',
    shortName: '玩',
    icon: '🎲',
    optionGroups: [
      {
        id: 'indoor',
        title: '室内',
        options: [
          {
            id: 'movie',
            groupId: 'indoor',
            name: '看电影',
            emoji: '🎬',
            isCustom: false,
            canDelete: false,
            description: '找一部新片',
          },
        ],
      },
    ],
  },
];

let appMock;
let capturedComponent = null;
let cacheCatalog = clone(BASE_CATALOG);
let reconcileResult = null;
let readCacheCalls = 0;
let listCalls = 0;
let createCalls = [];
let updateCalls = [];
let toastCalls = [];
let collapsedStorage = {};

function resetRuntimeState() {
  appMock = {
    globalData: {
      nickname: '小许',
      selections: {},
      partnerShareData: null,
    },
    saveSelectionsCalls: 0,
    saveSelections() {
      this.saveSelectionsCalls += 1;
    },
  };
  capturedComponent = null;
  cacheCatalog = clone(BASE_CATALOG);
  reconcileResult = null;
  readCacheCalls = 0;
  listCalls = 0;
  createCalls = [];
  updateCalls = [];
  toastCalls = [];
  collapsedStorage = {};
}

function deepMergeData(target, patch) {
  Object.keys(patch).forEach(key => {
    target[key] = clone(patch[key]);
  });
}

function searchCatalog(categories, query) {
  const keyword = query.trim();
  if (!keyword) return [];
  const results = [];
  categories.forEach(category => {
    category.optionGroups.forEach(group => {
      group.options.forEach(option => {
        if (option.name.includes(keyword) || (option.description || '').includes(keyword)) {
          results.push({
            categoryId: category.id,
            categoryName: category.name,
            groupId: group.id,
            groupName: group.title,
            option: clone(option),
          });
        }
      });
    });
  });
  return results;
}

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (parent && parent.filename.endsWith(path.join('miniprogram', 'pages', 'index', 'index.ts'))) {
    if (request === '../../data/categories') {
      return {
        encodeShareData(data) {
          return JSON.stringify(data);
        },
        hydrateSharedOption(categoryId, option) {
          return { ...option, groupId: option.groupId || categoryId };
        },
      };
    }
    if (request === '../../services/customOptions') {
      return {
        async createSharedOption(input) {
          createCalls.push(clone(input));
        },
        async deleteSharedOption() {},
        async listOptionCatalogRecords() {
          listCalls += 1;
          return clone(cacheCatalog);
        },
        readOptionCatalogCache() {
          readCacheCalls += 1;
          return clone(cacheCatalog);
        },
        async updateSharedOption(option, input) {
          updateCalls.push({ option: clone(option), input: clone(input) });
        },
      };
    }
    if (request === '../../utils/optionCatalog') {
      return {
        buildCatalog(records) {
          return clone(records && records.length > 0 ? records : BASE_CATALOG);
        },
        reconcileSelections(_categories, selections) {
          return reconcileResult ? clone(reconcileResult) : clone(selections);
        },
        searchCatalog,
      };
    }
    if (request === '../../utils/optionManagement') {
      return {
        collapseAllGroups(categoryId, groups, current) {
          const next = { ...current };
          groups.forEach(group => {
            next[`${categoryId}:${group.id}`] = true;
          });
          return next;
        },
        isGroupCollapsed(categoryId, groupId, map) {
          return Boolean(map[`${categoryId}:${groupId}`]);
        },
        toggleGroup(categoryId, groupId, current) {
          const key = `${categoryId}:${groupId}`;
          const next = { ...current };
          if (next[key]) {
            delete next[key];
          } else {
            next[key] = true;
          }
          return next;
        },
      };
    }
    if (request === '../../utils/optionOrder') {
      return {
        readOptionOrder() {
          return {};
        },
      };
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};

function loadComponentConfig() {
  resetRuntimeState();
  global.getApp = () => appMock;
  global.Component = config => {
    capturedComponent = config;
  };
  global.getCurrentPages = () => [{ options: {} }];
  global.wx = {
    getStorageSync(key) {
      return clone(collapsedStorage[key]);
    },
    setStorageSync(key, value) {
      collapsedStorage[key] = clone(value);
    },
    navigateBack() {},
    reLaunch() {},
    showModal() {},
    showToast(payload) {
      toastCalls.push(clone(payload));
    },
  };

  const pagePath = path.join(__dirname, '..', 'miniprogram/pages/index/index.ts');
  delete require.cache[require.resolve(pagePath)];
  require(pagePath);
  assert(capturedComponent, '应成功捕获 index Component 配置');
  return capturedComponent;
}

function createInstance(config) {
  const instance = {
    data: clone(config.data),
    setData(patch, callback) {
      deepMergeData(this.data, patch);
      if (typeof callback === 'function') {
        callback();
      }
    },
  };

  Object.entries(config.methods).forEach(([name, fn]) => {
    instance[name] = fn;
  });
  instance.pageLifetimes = config.pageLifetimes;
  instance.lifetimes = config.lifetimes;
  return instance;
}

function seedCatalogState(instance, overrides = {}) {
  instance.renderCatalog(cacheCatalog, {
    categoryId: overrides.categoryId || 'play',
    collapsedGroups: overrides.collapsedGroups || {},
    searchQuery: overrides.searchQuery || '',
  });
  if (typeof overrides.manageMode === 'boolean') {
    instance.setData({ manageMode: overrides.manageMode });
  }
}

function runManageSearchTapBehaviorTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  const originalSelections = {
    play: [
      {
        id: 'movie',
        groupId: 'indoor',
        name: '看电影',
        emoji: '🎬',
        isCustom: false,
        canDelete: false,
        description: '找一部新片',
      },
    ],
  };
  appMock.globalData.selections = clone(originalSelections);
  seedCatalogState(instance, {
    categoryId: 'play',
    collapsedGroups: { 'eat:cuisine': true },
    searchQuery: '火锅',
    manageMode: true,
  });

  instance.onSearchResultTap({
    currentTarget: {
      dataset: {
        result: {
          categoryId: 'eat',
          categoryName: '今天吃什么',
          groupId: 'cuisine',
          groupName: '主食',
          option: clone(BASE_CATALOG[0].optionGroups[0].options[0]),
        },
      },
    },
  });

  assert.deepEqual(appMock.globalData.selections, originalSelections, '管理态点击搜索结果不应改动全局 selections');
  assert.equal(appMock.saveSelectionsCalls, 0, '管理态点击搜索结果不应触发保存 selections');
  assert.equal(instance.data.currentCategoryId, 'eat', '管理态点击搜索结果后应切到目标分类');
  assert.equal(Boolean(instance.data.collapsedGroups['eat:cuisine']), false, '管理态点击搜索结果后应展开目标分组');
  assert.equal(instance.data.scrollIntoView, 'option-hotpot', '管理态点击搜索结果后应定位到目标活动');
  assert.equal(instance.data.editorVisible, true, '管理态点击搜索结果后应直接打开编辑器');
  assert.equal(instance.data.editorMode, 'edit', '管理态点击搜索结果后应进入编辑态');
  assert.equal(instance.data.editingOptionId, 'hotpot', '管理态点击搜索结果后应带上待编辑活动 id');
}

async function runSaveEditorToastBehaviorTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, { categoryId: 'eat' });

  instance.setData({
    editorVisible: true,
    editorMode: 'edit',
    editingOptionId: 'hotpot',
    editorCategoryId: 'eat',
    editorGroupId: 'cuisine',
    editorName: '火锅局',
    editorDescription: '今晚微辣',
  });

  await instance.saveOptionEditor();

  assert.equal(updateCalls.length, 1, '编辑已有活动时应调用 updateSharedOption');
  assert.equal(createCalls.length, 0, '编辑已有活动时不应调用 createSharedOption');
  assert.equal(toastCalls.at(-1)?.title, '已更新', '编辑保存成功后应提示已更新');
  assert.equal(instance.data.editorVisible, false, '保存成功后应关闭编辑器');

  toastCalls = [];
  createCalls = [];
  updateCalls = [];

  instance.setData({
    editorVisible: true,
    editorMode: 'create',
    editingOptionId: '',
    editorCategoryId: 'eat',
    editorGroupId: 'cuisine',
    editorName: '逛夜市',
    editorDescription: '',
  });

  await instance.saveOptionEditor();

  assert.equal(createCalls.length, 1, '新增活动时应调用 createSharedOption');
  assert.equal(updateCalls.length, 0, '新增活动时不应调用 updateSharedOption');
  assert.equal(toastCalls.at(-1)?.title, '已添加', '新增保存成功后应提示已添加');
}

function runNormalSearchTapBehaviorTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  appMock.globalData.selections = {};
  seedCatalogState(instance, {
    categoryId: 'play',
    collapsedGroups: { 'eat:cuisine': true },
    searchQuery: '火锅',
    manageMode: false,
  });

  instance.onSearchResultTap({
    currentTarget: {
      dataset: {
        result: {
          categoryId: 'eat',
          categoryName: '今天吃什么',
          groupId: 'cuisine',
          groupName: '主食',
          option: clone(BASE_CATALOG[0].optionGroups[0].options[0]),
        },
      },
    },
  });

  assert.deepEqual(appMock.globalData.selections, {
    eat: [clone(BASE_CATALOG[0].optionGroups[0].options[0])],
  }, '普通态点击搜索结果后应保持该活动已选中');
  assert.equal(appMock.saveSelectionsCalls, 1, '普通态点击搜索结果后应保存 selections');
  assert.equal(instance.data.editorVisible, false, '普通态点击搜索结果不应打开编辑器');
  assert.equal(instance.data.scrollIntoView, 'option-hotpot', '普通态点击搜索结果后应定位到目标活动');
}

function runShowReadsCacheBehaviorTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  const staleCatalog = [
    {
      id: 'stale',
      name: '过期分类',
      shortName: '旧',
      icon: '🕰️',
      optionGroups: [
        {
          id: 'legacy',
          title: '旧分组',
          options: [],
        },
      ],
    },
  ];

  cacheCatalog = clone(BASE_CATALOG);
  reconcileResult = [
    {
      categoryId: 'eat',
      categoryName: '今天吃什么',
      options: [clone(BASE_CATALOG[0].optionGroups[0].options[0])],
    },
  ];
  appMock.globalData.selections = {
    stale: [
      {
        id: 'legacy',
        groupId: 'legacy',
        name: '旧活动',
        emoji: '',
        isCustom: false,
      },
    ],
  };

  instance.setData({
    catalogRecords: clone(staleCatalog),
    currentCategoryId: 'stale',
    currentCategory: clone(staleCatalog[0]),
    currentOptionGroups: clone(staleCatalog[0].optionGroups),
  });

  instance.pageLifetimes.show.call(instance);

  assert.equal(readCacheCalls, 1, 'pageLifetimes.show 应读取最新缓存');
  assert.equal(listCalls, 0, 'pageLifetimes.show 不应重复触发云端加载');
  assert.deepEqual(instance.data.catalogRecords, cacheCatalog, 'pageLifetimes.show 应使用缓存重建页面');
  assert.deepEqual(appMock.globalData.selections, {
    eat: [clone(BASE_CATALOG[0].optionGroups[0].options[0])],
  }, 'pageLifetimes.show 应同步缓存后的 selections');
  assert.equal(appMock.saveSelectionsCalls, 1, 'pageLifetimes.show 刷新 selections 后应保存');
}

runManageSearchTapBehaviorTest();
runNormalSearchTapBehaviorTest();
runShowReadsCacheBehaviorTest();
void runSaveEditorToastBehaviorTest().then(() => {
  console.log('option management ui checks passed');
});
