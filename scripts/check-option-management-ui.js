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

function deepMergeData(target, patch) {
  Object.keys(patch).forEach(key => {
    target[key] = clone(patch[key]);
  });
}

function assertIncludes(source, text, message) {
  assert(source.includes(text), message);
}

function assertNotIncludes(source, text, message) {
  assert(!source.includes(text), message);
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
  'saveSharedGroupOrders',
  'searchCatalog',
  'moveOptionAcrossGroups',
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
  'draggingOptionId',
  'dragSourceGroupId',
  'dragTargetGroupId',
  'dragTargetIndex',
  'dragY',
  'dragGhostName',
  'dragSaving',
  'selectedPanelVisible',
  'selectedGroups',
  'selectedItems',
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
  'onOptionDragStart',
  'onOptionDragMove',
  'onOptionDragEnd',
  'onOptionDragCancel',
  'openSelectedPanel',
  'closeSelectedPanel',
  'onRemoveSelectedOption',
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
  'moveOptionInGroups',
].forEach(name => {
  assertNotIncludes(tsSource, name, `index.ts 不应再保留旧路径 ${name}`);
});

[
  'sortMode',
  'currentCustomOptions',
  'inputValue',
  'onMoveOption',
].forEach(name => {
  assertNotIncludes(tsSource, name, `index.ts 不应再保留旧 UI 状态 ${name}`);
});

assert(/bind:tap="toggleOptionGroup"/.test(wxmlSource), 'WXML 必须支持分组折叠切换');
assert(/catch:tap="openOptionEditor"/.test(wxmlSource), 'WXML 分组 header 必须提供新增入口');
assert(/data-group-id="{{group.id}}"/.test(wxmlSource), 'WXML 分组结构必须带 group id');
assert(/bind:input="onSearchInput"/.test(wxmlSource), 'WXML 必须提供搜索输入');
assert(/placeholder="搜一搜去干啥"/.test(wxmlSource), 'WXML 搜索栏 placeholder 应使用新的文案');
assert(/class="search-icon">🔍<\/text>/.test(wxmlSource), 'WXML 搜索图标应使用明显的放大镜');
assert(/searchResults/.test(wxmlSource), 'WXML 必须渲染搜索结果');
assert(/bind:tap="onSearchResultTap"/.test(wxmlSource), 'WXML 搜索结果必须可点击');
assert(/editorName/.test(wxmlSource), 'WXML 编辑器必须绑定名称输入');
assert(/editorDescription/.test(wxmlSource), 'WXML 编辑器必须绑定描述输入');
assert(/option-desc/.test(wxmlSource), 'WXML 必须保留 option-desc');
assert(/manageMode/.test(wxmlSource), 'WXML 必须包含管理模式分支');
assert(/catch:tap="onDeleteOption"/.test(wxmlSource), 'WXML 管理模式必须有删除入口');
assert(/scroll-into-view="{{scrollIntoView}}"/.test(wxmlSource), '右侧 scroll-view 必须绑定 scroll-into-view');
assert(/catch:longpress="onOptionDragStart"/.test(wxmlSource), 'WXML 管理态拖拽手柄必须使用 longpress 启动拖拽');
assert(/catch:touchmove="onOptionDragMove"/.test(wxmlSource), 'WXML 右侧内容容器必须捕获 touchmove');
assert(/catch:touchend="onOptionDragEnd"/.test(wxmlSource), 'WXML 右侧内容容器必须捕获 touchend');
assert(/catch:touchcancel="onOptionDragCancel"/.test(wxmlSource), 'WXML 右侧内容容器必须捕获 touchcancel');
assert(/id="option-{{item.id}}"/.test(wxmlSource), 'WXML 每个活动项必须保留 option id 方便定位');
assert(/option-group-dropzone/.test(wxmlSource), 'WXML 分组必须暴露 dropzone 容器');
assert(/dragGhostName/.test(wxmlSource), 'WXML 必须渲染拖拽 ghost');
assert(/dragSaving/.test(wxmlSource), 'WXML 必须渲染拖拽保存中状态');
assert(/option-empty/.test(wxmlSource), 'WXML 展开空分组时必须渲染 empty 状态');
assert(/drag-placeholder/.test(wxmlSource), 'WXML 必须渲染拖拽 source placeholder');
assert(/drag-target/.test(wxmlSource), 'WXML 必须渲染目标分组高亮');
assert(/drag-drop-line/.test(wxmlSource), 'WXML 拖拽目标位置必须渲染放置提示线');
assert(/wx:for-index="optionIndex"/.test(wxmlSource), 'WXML 放置提示线必须能读取列表项位置');
assert(/aria-label="拖拽排序"/.test(wxmlSource), 'WXML 拖拽手柄必须提供 aria-label');
assert(/☰|≡/.test(wxmlSource), 'WXML 拖拽手柄应使用熟悉的排序符号');

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
  assertNotIncludes(wxmlSource, name, `WXML 不应再保留旧路径 ${name}`);
});

[
  '.search-bar',
  '.group-header',
  '.management-actions',
  '.editor-modal',
  '.editor-textarea',
  '.drag-handle',
  '.drag-ghost',
  '.drag-saving',
  '.option-empty',
  '.drag-placeholder',
  '.drag-target',
  '.drag-drop-line',
].forEach(selector => {
  assertIncludes(wxssSource, selector, `WXSS 必须包含 ${selector}`);
});

assert(/\.search-icon[\s\S]*font-size:\s*32rpx/.test(wxssSource), 'WXSS 搜索图标应比正文更明显');
assert(/\.editor-input[\s\S]*height:\s*88rpx/.test(wxssSource), 'WXSS 名称输入框应有足够高度');
assert(/bind:tap="openSelectedPanel"/.test(wxmlSource), 'WXML 已选计数必须能点击打开已选面板');
assert(/selectedPanelVisible/.test(wxmlSource), 'WXML 必须包含已选面板显示状态');
assert(/catch:tap="onRemoveSelectedOption"/.test(wxmlSource), 'WXML 已选面板必须支持点击移除已选项');
assert(/selectedItems\.length === 0/.test(wxmlSource), 'WXML 已选面板空状态必须跟 selectedItems 保持同源');
assert(/wx:for="{{selectedItems}}"/.test(wxmlSource), 'WXML 已选面板必须直接渲染扁平 selectedItems');
assert(/<scroll-view wx:else class="selected-list"[\s\S]*scroll-y/.test(wxmlSource), 'WXML 已选面板必须使用 scroll-view 支持长列表滑动');
assert(!/selected-chip-meta/.test(wxmlSource), 'WXML 已选面板不应显示主分类或子分类');
assert(/selectedItem\.optionName/.test(wxmlSource), 'WXML 已选面板只需要显示选项名称');
assert(/\.selected-panel-overlay/.test(wxssSource), 'WXSS 必须包含已选面板遮罩样式');
assert(/\.selected-chip/.test(wxssSource), 'WXSS 必须包含已选项 chip 样式');
assert(/\.selected-panel[\s\S]*height:\s*78vh/.test(wxssSource), 'WXSS 已选面板高度应足够展示内容');
assert(/\.selected-list[\s\S]*flex-direction:\s*column/.test(wxssSource), 'WXSS 已选列表应按行展示');
assert(/\.selected-list[\s\S]*height:\s*58vh/.test(wxssSource), 'WXSS 已选列表应限制高度并在内部滚动');
assert(/\.selected-chip-name[\s\S]*white-space:\s*normal/.test(wxssSource), 'WXSS 已选项名称应完整换行展示');
assert(!/\.selected-chip-name[\s\S]*text-overflow:\s*ellipsis/.test(wxssSource), 'WXSS 已选项名称不应省略');

[
  'pointer-events',
  'max-width',
  'z-index',
].forEach(token => {
  assertIncludes(wxssSource, token, `WXSS 拖拽样式必须包含 ${token}`);
});

[
  'touch-action',
  'outline-offset',
  'inset:',
].forEach(token => {
  assertNotIncludes(wxssSource, token, `WXSS 不应包含 Skyline 不支持属性 ${token}`);
});

[
  '.custom-input-row',
  '.sort-actions',
  '.sort-btn',
].forEach(selector => {
  assertNotIncludes(wxssSource, selector, `WXSS 不应再保留旧样式 ${selector}`);
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
          {
            id: 'bbq',
            groupId: 'cuisine',
            name: '烤肉',
            emoji: '🥩',
            isCustom: true,
            canDelete: true,
            description: '五花肉套餐',
          },
        ],
      },
      {
        id: 'dessert',
        title: '甜点',
        options: [
          {
            id: 'cake',
            groupId: 'dessert',
            name: '小蛋糕',
            emoji: '🍰',
            isCustom: true,
            canDelete: true,
            description: '饭后甜一点',
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
let deleteCalls = [];
let saveOrderCalls = [];
let serviceCallSequence = [];
let toastCalls = [];
let collapsedStorage = {};
let selectorLayoutPlan = { dropzones: [], items: [] };
let selectorShouldFail = false;
let saveOrderFailures = [];
let updateFailures = [];
let timerIdSeed = 0;
let timerQueue = [];
let intervalIdSeed = 0;
let intervalQueue = [];

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
  deleteCalls = [];
  saveOrderCalls = [];
  serviceCallSequence = [];
  toastCalls = [];
  collapsedStorage = {};
  selectorLayoutPlan = { dropzones: [], items: [] };
  selectorShouldFail = false;
  saveOrderFailures = [];
  updateFailures = [];
  timerIdSeed = 0;
  timerQueue = [];
  intervalIdSeed = 0;
  intervalQueue = [];
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

function findOption(categories, optionId) {
  for (const category of categories) {
    for (const group of category.optionGroups) {
      const option = group.options.find(item => item.id === optionId);
      if (option) return option;
    }
  }
  return null;
}

function setSelectorLayoutFromGroups(groups) {
  let top = 20;
  const dropzones = [];
  const items = [];
  groups.forEach(group => {
    const startTop = top;
    top += 40;
    group.options.forEach(option => {
      items.push({
        id: `option-${option.id}`,
        dataset: {
          optionId: option.id,
          groupId: group.id,
        },
        top,
        bottom: top + 44,
        left: 0,
        right: 300,
      });
      top += 52;
    });
    top += 12;
    dropzones.push({
      id: `dropzone-${group.id}`,
      dataset: {
        groupId: group.id,
      },
      top: startTop,
      bottom: top,
      left: 0,
      right: 300,
    });
  });
  selectorLayoutPlan = { dropzones, items };
}

function createSelectorQueryMock() {
  const tasks = [];
  const root = {
    in() {
      return root;
    },
    selectAll(selector) {
      return {
        fields(_config, callback) {
          tasks.push({ selector, callback });
          return root;
        },
      };
    },
    exec(callback) {
      tasks.forEach(task => {
        if (typeof task.callback !== 'function') return;
        if (selectorShouldFail) {
          task.callback([]);
          return;
        }
        if (task.selector === '.option-group-dropzone') {
          task.callback(clone(selectorLayoutPlan.dropzones));
          return;
        }
        if (task.selector === '.option-item') {
          task.callback(clone(selectorLayoutPlan.items));
          return;
        }
        task.callback([]);
      });
      if (typeof callback === 'function') {
        callback([]);
      }
    },
  };
  return root;
}

function applyOptionUpdateToCatalog(option, input) {
  const next = clone(cacheCatalog);
  const category = next.find(item => item.id === input.categoryId);
  if (!category) return;

  category.optionGroups.forEach(group => {
    group.options = group.options.filter(item => item.id !== option.id);
  });

  const targetGroup = category.optionGroups.find(group => group.id === input.groupId);
  if (!targetGroup) return;
  targetGroup.options.push({
    ...clone(option),
    groupId: input.groupId,
    name: input.name,
    description: input.description,
  });
  cacheCatalog = next;
}

function applyGroupOrdersToCatalog(categoryId, groups) {
  const next = clone(cacheCatalog);
  const category = next.find(item => item.id === categoryId);
  if (!category) return;

  groups.forEach(groupInput => {
    const group = category.optionGroups.find(item => item.id === groupInput.groupId);
    if (!group) return;
    const optionMap = group.options.reduce((acc, option) => {
      acc[option.id] = option;
      return acc;
    }, {});
    group.options = groupInput.optionIds.map(id => optionMap[id]).filter(Boolean);
  });
  cacheCatalog = next;
}

function buildOrderPayload(groups) {
  return groups
    .filter(group => Array.isArray(group.options))
    .map(group => ({
      groupId: group.id,
      optionIds: group.options.map(option => option.id),
    }));
}

function fakeSetTimeout(callback) {
  const timerId = ++timerIdSeed;
  timerQueue.push({
    id: timerId,
    callback,
    cleared: false,
  });
  return timerId;
}

function fakeClearTimeout(timerId) {
  timerQueue = timerQueue.map(timer => (
    timer.id === timerId ? { ...timer, cleared: true } : timer
  ));
}

function fakeSetInterval(callback, delay) {
  const timerId = ++intervalIdSeed;
  intervalQueue.push({
    id: timerId,
    callback,
    delay,
    cleared: false,
  });
  return timerId;
}

function fakeClearInterval(timerId) {
  intervalQueue = intervalQueue.map(timer => (
    timer.id === timerId ? { ...timer, cleared: true } : timer
  ));
}

async function flushTimers() {
  while (timerQueue.length > 0) {
    const next = timerQueue.shift();
    if (!next || next.cleared) continue;
    await next.callback();
  }
}

async function flushIntervals() {
  const activeTimers = intervalQueue.filter(timer => !timer.cleared);
  for (const timer of activeTimers) {
    await timer.callback();
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const realOptionOrderModule = require('../miniprogram/utils/optionOrder.ts');
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
        async deleteSharedOption(option) {
          deleteCalls.push(clone(option));
        },
        async listOptionCatalogRecords() {
          listCalls += 1;
          return clone(cacheCatalog);
        },
        readOptionCatalogCache() {
          readCacheCalls += 1;
          return clone(cacheCatalog);
        },
        async saveSharedGroupOrders(categoryId, groups) {
          saveOrderCalls.push({
            categoryId,
            groups: clone(groups),
          });
          serviceCallSequence.push(`order:${categoryId}`);
          const nextFailure = saveOrderFailures.shift();
          if (nextFailure) {
            throw nextFailure;
          }
          applyGroupOrdersToCatalog(categoryId, groups);
        },
        async updateSharedOption(option, input) {
          updateCalls.push({
            option: clone(option),
            input: clone(input),
          });
          serviceCallSequence.push(`update:${input.groupId}`);
          const nextFailure = updateFailures.shift();
          if (nextFailure) {
            throw nextFailure;
          }
          applyOptionUpdateToCatalog(option, input);
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
        moveOptionAcrossGroups: realOptionOrderModule.moveOptionAcrossGroups,
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
  global.setTimeout = fakeSetTimeout;
  global.clearTimeout = fakeClearTimeout;
  global.setInterval = fakeSetInterval;
  global.clearInterval = fakeClearInterval;
  global.getApp = () => appMock;
  global.Component = config => {
    capturedComponent = config;
  };
  global.getCurrentPages = () => [{ options: {} }];
  global.wx = {
    createSelectorQuery: createSelectorQueryMock,
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
  instance.renderCatalog(overrides.catalog || cacheCatalog, {
    categoryId: overrides.categoryId || 'play',
    collapsedGroups: overrides.collapsedGroups || {},
    searchQuery: overrides.searchQuery || '',
  });
  instance.setData({
    manageMode: Boolean(overrides.manageMode),
  });
}

function makeDragStartEvent(instance, optionId, groupId) {
  const option = findOption(instance.data.categories, optionId);
  return {
    currentTarget: {
      dataset: {
        option: clone(option),
        groupId,
      },
    },
  };
}

function makeTouchEvent(y) {
  return {
    touches: [{ clientY: y, pageY: y }],
  };
}

function makeTouchEndEvent(y) {
  return {
    changedTouches: [{ clientY: y, pageY: y }],
  };
}

function readCollapsedStorageSnapshot() {
  return clone(collapsedStorage['categoryCollapsedGroups:v1'] || {});
}

async function runManageSearchTapBehaviorTest() {
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

  toastCalls = [];
  createCalls = [];
  updateCalls = [];
  const otherCatalog = clone(BASE_CATALOG);
  otherCatalog[0].optionGroups.push({
    id: 'other',
    title: '其他',
    options: [{
      id: 'option_other_existing',
      groupId: 'other',
      name: '其他旧标签',
      emoji: '',
      isCustom: true,
      canDelete: true,
      description: '',
    }],
  });
  otherCatalog[0].options = otherCatalog[0].optionGroups.flatMap(group => group.options);
  seedCatalogState(instance, { categoryId: 'eat', catalog: otherCatalog });

  instance.setData({
    editorVisible: true,
    editorMode: 'edit',
    editingOptionId: 'option_other_existing',
    editorCategoryId: 'eat',
    editorGroupId: 'other',
    editorName: '其他新名字',
    editorDescription: '',
  });

  await instance.saveOptionEditor();

  assert.equal(updateCalls.length, 1, '编辑 other 分组活动时应调用 updateSharedOption');
  assert.equal(updateCalls[0].input.groupId, 'other', '编辑 other 分组活动时应保留 other 分组');
  assert.equal(toastCalls.at(-1)?.title, '已更新', '编辑 other 分组保存成功后应提示已更新');

  toastCalls = [];
  createCalls = [];
  updateCalls = [];

  instance.setData({
    editorVisible: true,
    editorMode: 'create',
    editingOptionId: '',
    editorCategoryId: 'eat',
    editorGroupId: 'other',
    editorName: '其他新增标签',
    editorDescription: '',
  });

  await instance.saveOptionEditor();

  assert.equal(createCalls.length, 1, '新增 other 分组活动时应调用 createSharedOption');
  assert.equal(createCalls[0].groupId, 'other', '新增 other 分组活动时应传入 other 分组');
  assert.equal(toastCalls.at(-1)?.title, '已添加', '新增 other 分组保存成功后应提示已添加');
}

async function runCloseEditorKeepsSavingDraftTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, { categoryId: 'eat' });

  instance.setData({
    editorVisible: true,
    editorMode: 'create',
    editorCategoryId: 'eat',
    editorCategoryName: '今天吃什么',
    editorGroupId: 'cuisine',
    editorGroupName: '主食',
    editorName: '不要丢',
    editorDescription: '保存中点击遮罩也要保留',
    editorSaving: true,
  });

  instance.closeOptionEditor({ type: 'tap' });

  assert.equal(instance.data.editorVisible, true, '保存中点击遮罩或关闭事件不应关闭编辑器');
  assert.equal(instance.data.editorName, '不要丢', '保存中误触关闭不应清空名称');
  assert.equal(instance.data.editorDescription, '保存中点击遮罩也要保留', '保存中误触关闭不应清空描述');
}

async function runNormalSearchTapBehaviorTest() {
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

async function runSelectedPanelBehaviorTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  const hotpot = clone(BASE_CATALOG[0].optionGroups[0].options[0]);
  const bbq = clone(BASE_CATALOG[0].optionGroups[0].options[1]);
  appMock.globalData.selections = {
    eat: [hotpot, bbq],
  };
  seedCatalogState(instance, { categoryId: 'eat' });

  instance.openSelectedPanel();

  assert.equal(instance.data.selectedPanelVisible, true, '点击已选计数后应打开已选面板');
  assert.equal(instance.data.selectedGroups.length, 1, '已选面板应按分类展示已选内容');
  assert.equal(instance.data.selectedGroups[0].categoryName, '今天吃什么', '已选面板应展示分类名');
  assert.deepEqual(instance.data.selectedGroups[0].options.map(option => option.name), ['火锅', '烤肉'], '已选面板应展示当前已选活动');
  assert.deepEqual(instance.data.selectedItems.map(item => item.optionName), ['火锅', '烤肉'], '已选面板应提供可直接渲染的扁平列表');

  instance.onRemoveSelectedOption({
    currentTarget: {
      dataset: {
        categoryId: 'eat',
        optionId: 'hotpot',
      },
    },
  });

  assert.deepEqual(appMock.globalData.selections, { eat: [bbq] }, '点击已选面板里的活动应从 selections 中移除');
  assert.equal(appMock.saveSelectionsCalls, 1, '移除已选项后应保存 selections');
  assert.equal(instance.data.totalCount, 1, '移除已选项后底部计数应同步更新');
  assert.deepEqual(instance.data.selectedGroups[0].options.map(option => option.name), ['烤肉'], '移除后已选面板应同步刷新');
  assert.deepEqual(instance.data.selectedItems.map(item => item.optionName), ['烤肉'], '移除后扁平已选列表应同步刷新');

  instance.closeSelectedPanel();
  assert.equal(instance.data.selectedPanelVisible, false, '关闭事件应隐藏已选面板');

  instance.setData({
    totalCount: 1,
    selectedGroups: [{
      categoryId: 'eat',
      categoryName: '今天吃什么',
      options: [bbq],
    }],
    selectedItems: [{
      categoryId: 'eat',
      categoryName: '今天吃什么',
      optionId: 'bbq',
      optionName: '烤肉',
    }],
  });
  appMock.globalData.selections = {};
  instance.openSelectedPanel();
  assert.deepEqual(instance.data.selectedGroups[0].options.map(option => option.name), ['烤肉'], '打开已选面板时应优先保留页面已同步好的清单');
  assert.deepEqual(instance.data.selectedItems.map(item => item.optionName), ['烤肉'], '打开已选面板时应优先保留页面已同步好的扁平清单');
}

async function runShowReadsCacheBehaviorTest() {
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
  await flushMicrotasks();

  assert.equal(readCacheCalls, 2, 'pageLifetimes.show 应先用缓存重建页面，再为后台刷新读取缓存');
  assert.equal(listCalls, 1, 'pageLifetimes.show 应在缓存重建后后台刷新云端目录');
  assert.deepEqual(instance.data.catalogRecords, cacheCatalog, 'pageLifetimes.show 应使用缓存重建页面');
  assert.deepEqual(appMock.globalData.selections, {
    eat: [clone(BASE_CATALOG[0].optionGroups[0].options[0])],
  }, 'pageLifetimes.show 应同步缓存后的 selections');
  assert.equal(appMock.saveSelectionsCalls, 1, 'pageLifetimes.show 刷新 selections 后应保存');
}

async function runPeriodicRefreshBehaviorTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);

  config.lifetimes.attached.call(instance);
  assert.equal(intervalQueue.length, 1, 'attached 应启动一个活动目录自动刷新定时器');
  assert.equal(intervalQueue[0].delay, 15000, '自动刷新间隔应为 15 秒');

  await flushIntervals();
  await flushMicrotasks();
  assert.equal(listCalls, 1, '定时器触发时应刷新一次云端活动目录');

  config.lifetimes.detached.call(instance);
  await flushIntervals();
  await flushMicrotasks();
  assert.equal(listCalls, 1, 'detached 后应停止自动刷新');
}

async function runInvalidDragEndDoesNotPersistTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  await instance.onOptionDragEnd();

  assert.equal(updateCalls.length, 0, '无有效目标时不应调用 updateSharedOption');
  assert.equal(saveOrderCalls.length, 0, '无有效目标时不应调用 saveSharedGroupOrders');
  assert.equal(instance.data.draggingOptionId, '', '无效结束后应清空拖拽状态');
  assert.equal(instance.data.dragSaving, false, '无效结束后不应残留保存中状态');
}

async function runDragStartReentryPreservesSnapshotTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(250));
  await flushTimers();
  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), false, '悬停自动展开后 dessert 应处于展开态');

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'bbq', 'cuisine'));
  assert.equal(instance.data.draggingOptionId, 'hotpot', '重入 start 不应覆盖当前 draggingOptionId');
  assert.equal(instance.data.dragGhostName, '火锅', '重入 start 不应覆盖当前 ghost 名称');

  instance.onOptionDragCancel();
  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), true, '重入后取消仍应恢复第一次拖拽前的折叠快照');
  assert.equal(Boolean(readCollapsedStorageSnapshot()['eat:dessert']), true, '重入后取消应把折叠快照写回 storage');
}

async function runSameGroupDragPersistsOrderTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'bbq', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(30));
  await instance.onOptionDragEnd();

  assert.equal(updateCalls.length, 0, '同组拖拽不应调用 updateSharedOption');
  assert.equal(saveOrderCalls.length, 1, '同组拖拽应调用 saveSharedGroupOrders');
  assert.deepEqual(saveOrderCalls[0], {
    categoryId: 'eat',
    groups: buildOrderPayload([
      {
        id: 'cuisine',
        options: [{ id: 'bbq' }, { id: 'hotpot' }],
      },
    ]),
  }, '同组拖拽只应保存受影响分组的新顺序');
  assert.deepEqual(
    instance.data.currentOptionGroups.find(group => group.id === 'cuisine')?.options.map(option => option.id),
    ['bbq', 'hotpot'],
    '同组拖拽成功后应更新当前 UI 顺序'
  );
}

async function runCrossGroupDragPersistsUpdateThenOrderTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(250));
  await flushTimers();
  await instance.onOptionDragEnd();

  assert.equal(updateCalls.length, 1, '跨组拖拽应先调用 updateSharedOption');
  assert.equal(saveOrderCalls.length, 1, '跨组拖拽应随后调用 saveSharedGroupOrders');
  assert.equal(serviceCallSequence[0], 'update:dessert', '跨组拖拽应先更新活动分组');
  assert.equal(serviceCallSequence[1], 'order:eat', '跨组拖拽应再保存分组顺序');
  assert.deepEqual(updateCalls[0].input, {
    categoryId: 'eat',
    groupId: 'dessert',
    name: '火锅',
    description: '麻辣锅底',
  }, '跨组拖拽应按目标分组更新活动');
  assert.deepEqual(saveOrderCalls[0], {
    categoryId: 'eat',
    groups: buildOrderPayload([
      {
        id: 'cuisine',
        options: [{ id: 'bbq' }],
      },
      {
        id: 'dessert',
        options: [{ id: 'cake' }, { id: 'hotpot' }],
      },
    ]),
  }, '跨组拖拽只应保存源分组和目标分组的完整顺序');
  assert.deepEqual(
    instance.data.currentOptionGroups.find(group => group.id === 'dessert')?.options.map(option => option.id),
    ['cake', 'hotpot'],
    '跨组拖拽成功后应更新目标分组内容'
  );
  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), false, '成功 drop 后应保留目标分组展开');
  assert.equal(Boolean(readCollapsedStorageSnapshot()['eat:dessert']), false, '成功 drop 后应持久化目标分组展开');
}

async function runDragEndUsesChangedTouchPositionTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(30));
  await instance.onOptionDragEnd(makeTouchEndEvent(250));

  assert.equal(updateCalls.length, 1, 'touchend changedTouches 的最终落点跨组时应调用 updateSharedOption');
  assert.equal(updateCalls[0].input.groupId, 'dessert', 'touchend 应使用释放瞬间坐标重新定位目标分组');
}

async function runDragSavingPreviewKeepsAutoExpandedTargetOpenTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(250));
  await flushTimers();

  const savePromise = instance.onOptionDragEnd();
  const dessertGroup = instance.data.currentOptionGroups.find(group => group.id === 'dessert');

  assert.equal(instance.data.dragSaving, true, '保存中预览应进入 dragSaving 状态');
  assert.equal(dessertGroup?.collapsed, false, '保存中预览应保留自动展开后的目标分组');
  assert.deepEqual(
    dessertGroup?.options.map(option => option.id),
    ['cake', 'hotpot'],
    '保存中预览应在展开目标分组中展示移动后的活动'
  );

  await savePromise;
}

async function runAutoExpandUsesLatestHoverYTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  const multiDessertCatalog = clone(BASE_CATALOG);
  multiDessertCatalog[0].optionGroups[1].options.push({
    id: 'pudding',
    groupId: 'dessert',
    name: '布丁',
    emoji: '🍮',
    isCustom: true,
    canDelete: true,
    description: '冷藏一下',
  });
  cacheCatalog = multiDessertCatalog;
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(220));
  instance.onOptionDragMove(makeTouchEvent(300));
  await flushTimers();
  await instance.onOptionDragEnd();

  assert.deepEqual(saveOrderCalls[0], {
    categoryId: 'eat',
    groups: buildOrderPayload([
      {
        id: 'cuisine',
        options: [{ id: 'bbq' }],
      },
      {
        id: 'dessert',
        options: [{ id: 'cake' }, { id: 'pudding' }, { id: 'hotpot' }],
      },
    ]),
  }, '自动展开后应按同一目标组内最新 hover y 计算插入位置');
}

async function runCrossGroupDragPersistsEmptySourceOrderTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  const sparseCatalog = clone(BASE_CATALOG);
  sparseCatalog[0].optionGroups[0].options = [clone(BASE_CATALOG[0].optionGroups[0].options[0])];
  cacheCatalog = sparseCatalog;
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(200));
  await instance.onOptionDragEnd();

  assert.deepEqual(saveOrderCalls[0], {
    categoryId: 'eat',
    groups: buildOrderPayload([
      {
        id: 'cuisine',
        options: [],
      },
      {
        id: 'dessert',
        options: [{ id: 'cake' }, { id: 'hotpot' }],
      },
    ]),
  }, '跨组拖拽移空源分组时也必须保存源分组空顺序');
}

async function runDragFailureRestoresPreDragStateTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  const beforeGroups = clone(instance.data.currentOptionGroups);
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);
  saveOrderFailures = [new Error('save order failed')];

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(250));
  await flushTimers();
  await instance.onOptionDragEnd();

  assert.equal(updateCalls.length, 2, '顺序保存失败时应尝试把活动分组回滚');
  assert.equal(saveOrderCalls.length, 2, '顺序保存失败时应尝试把原始顺序回滚');
  assert.deepEqual(instance.data.currentOptionGroups, beforeGroups, '保存失败后应恢复拖拽前 UI');
  assert.equal(toastCalls.at(-1)?.title, '排序保存失败，请重试', '保存失败后应提示用户重试');
  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), true, '保存失败后应恢复拖拽前折叠状态');
  assert.equal(Boolean(readCollapsedStorageSnapshot()['eat:dessert']), true, '保存失败后应把折叠快照写回 storage');
}

async function runDragStartQueryFailureTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
  });
  selectorShouldFail = true;

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));

  assert.equal(instance.data.draggingOptionId, '', '布局测量失败时不应进入拖拽态');
  assert.equal(toastCalls.at(-1)?.icon, 'none', '布局测量失败时应给出非阻塞提示');
}

async function runDragCancelRestoresCollapsedSnapshotTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(250));
  await flushTimers();
  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), false, '自动展开后当前 UI 应显示目标分组已展开');

  instance.onOptionDragCancel();

  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), true, '取消拖拽后应恢复拖拽前折叠状态');
  assert.equal(Boolean(readCollapsedStorageSnapshot()['eat:dessert']), true, '取消拖拽后应把折叠快照写回 storage');
}

async function runInvalidDragEndRestoresCollapsedSnapshotTest() {
  const config = loadComponentConfig();
  const instance = createInstance(config);
  seedCatalogState(instance, {
    categoryId: 'eat',
    manageMode: true,
    collapsedGroups: { 'eat:dessert': true },
  });
  setSelectorLayoutFromGroups(instance.data.currentOptionGroups);

  await instance.onOptionDragStart(makeDragStartEvent(instance, 'hotpot', 'cuisine'));
  instance.onOptionDragMove(makeTouchEvent(250));
  await flushTimers();
  instance.onOptionDragMove(makeTouchEvent(1000));
  await instance.onOptionDragEnd();

  assert.equal(Boolean(instance.data.collapsedGroups['eat:dessert']), true, '无有效目标结束后应恢复折叠快照');
  assert.equal(Boolean(readCollapsedStorageSnapshot()['eat:dessert']), true, '无有效目标结束后应把折叠快照写回 storage');
}

async function main() {
  await runManageSearchTapBehaviorTest();
  await runNormalSearchTapBehaviorTest();
  await runSelectedPanelBehaviorTest();
  await runShowReadsCacheBehaviorTest();
  await runPeriodicRefreshBehaviorTest();
  await runSaveEditorToastBehaviorTest();
  await runCloseEditorKeepsSavingDraftTest();
  await runInvalidDragEndDoesNotPersistTest();
  await runDragStartReentryPreservesSnapshotTest();
  await runSameGroupDragPersistsOrderTest();
  await runCrossGroupDragPersistsUpdateThenOrderTest();
  await runDragEndUsesChangedTouchPositionTest();
  await runDragSavingPreviewKeepsAutoExpandedTargetOpenTest();
  await runAutoExpandUsesLatestHoverYTest();
  await runCrossGroupDragPersistsEmptySourceOrderTest();
  await runDragFailureRestoresPreDragStateTest();
  await runDragStartQueryFailureTest();
  await runDragCancelRestoresCollapsedSnapshotTest();
  await runInvalidDragEndRestoresCollapsedSnapshotTest();
  console.log('option management ui checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
