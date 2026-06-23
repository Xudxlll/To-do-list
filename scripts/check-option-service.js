const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableHash(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36);
}

function sanitizeDocIdPart(value) {
  const readable = value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 24) || 'x';
  return `${readable}_${stableHash(value)}`;
}

function buildManagedDocId(optionId) {
  return `managed_${sanitizeDocIdPart(optionId)}`;
}

function buildOrderDocId(categoryId, groupId) {
  return `order_${sanitizeDocIdPart(categoryId)}_${sanitizeDocIdPart(groupId)}`;
}

const storage = new Map();
let currentCloudDb = null;
let callFunctionCalls = [];
global.wx = {
  getStorageSync(key) {
    return storage.has(key) ? deepClone(storage.get(key)) : undefined;
  },
  setStorageSync(key, value) {
    storage.set(key, deepClone(value));
  },
  removeStorageSync(key) {
    storage.delete(key);
  },
  cloud: {
    init() {},
    database() {
      if (!currentCloudDb) {
        throw new Error('这个测试不应直接走 wx.cloud.database');
      }
      return currentCloudDb;
    },
    async callFunction(payload) {
      callFunctionCalls.push(deepClone(payload));
      return { result: { ok: true } };
    },
  },
};

const { CATEGORIES } = require('../miniprogram/data/categories.ts');
const { buildCatalog, createStableOptionId } = require('../miniprogram/utils/optionCatalog.ts');
const service = require('../miniprogram/services/customOptions.ts');

const CACHE_KEY = 'categoryOptionCatalog:v2';
const COLLECTION_NAME = 'custom_options';

function makeLegacyRecord(index, overrides = {}) {
  return {
    _id: `legacy_${index}`,
    categoryId: 'eat',
    name: `云端旧标签${index}`,
    normalizedName: `云端旧标签${index}`,
    createdAt: 1000 + index,
    ...overrides,
  };
}

function makeManagedRecord(index, overrides = {}) {
  return {
    _id: `managed_${index}`,
    recordType: 'option',
    optionId: `option_${index}`,
    categoryId: 'eat',
    groupId: 'cuisine',
    source: 'custom',
    name: `云端管理标签${index}`,
    normalizedName: `云端管理标签${index}`,
    description: '',
    deleted: false,
    createdAt: 2000 + index,
    updatedAt: 3000 + index,
    ...overrides,
  };
}

function makeGroupOrderRecord(index, overrides = {}) {
  return {
    _id: `order_${index}`,
    recordType: 'group_order',
    categoryId: 'eat',
    groupId: 'cuisine',
    optionIds: [`option_${index}_1`, `option_${index}_2`],
    updatedAt: 4000 + index,
    ...overrides,
  };
}

class FakeDocRef {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    this.collection.docGetCalls.push(this.id);
    if (this.collection.failGetIds.has(this.id)) {
      throw new Error(`模拟读取失败：${this.id}`);
    }
    const value = this.collection.docs.get(this.id);
    if (!value) {
      return { data: null };
    }
    return { data: deepClone(value) };
  }

  async set(payload) {
    if (this.collection.failSetIds.has(this.id)) {
      throw new Error(`模拟写入失败：${this.id}`);
    }
    if (this.collection.setDelays.has(this.id)) {
      await new Promise(resolve => setTimeout(resolve, this.collection.setDelays.get(this.id)));
    }
    const data = deepClone(payload.data);
    this.collection.docs.set(this.id, { ...data, _id: this.id });
    const existingIndex = this.collection.records.findIndex(record => record._id === this.id);
    if (existingIndex >= 0) {
      this.collection.records[existingIndex] = deepClone({ ...data, _id: this.id });
    } else {
      this.collection.records.push(deepClone({ ...data, _id: this.id }));
    }
    this.collection.docSetCalls.push({ id: this.id, data });
    return {};
  }

  async update(payload) {
    const existing = this.collection.docs.get(this.id) || { _id: this.id };
    const data = { ...existing, ...deepClone(payload.data), _id: this.id };
    this.collection.docs.set(this.id, data);
    const existingIndex = this.collection.records.findIndex(record => record._id === this.id);
    if (existingIndex >= 0) {
      this.collection.records[existingIndex] = deepClone(data);
    } else {
      this.collection.records.push(deepClone(data));
    }
    this.collection.docUpdateCalls.push({ id: this.id, data: deepClone(payload.data) });
    return {};
  }

  async remove() {
    if (this.collection.failRemoveIds.has(this.id)) {
      throw new Error(`模拟删除失败：${this.id}`);
    }
    this.collection.docs.delete(this.id);
    this.collection.records = this.collection.records.filter(record => record._id !== this.id);
    this.collection.docRemoveCalls.push(this.id);
    return {};
  }
}

class FakeQuery {
  constructor(collection, predicate = () => true) {
    this.collection = collection;
    this.predicate = predicate;
    this.skipValue = 0;
    this.limitValue = Infinity;
    this.orderField = null;
    this.orderDirection = null;
  }

  where(filter) {
    return new FakeQuery(this.collection, record => this.predicate(record) && Object.keys(filter).every(key => record[key] === filter[key]));
  }

  field() {
    return this;
  }

  orderBy(field, direction) {
    this.orderField = field;
    this.orderDirection = direction;
    this.collection.orderByCalls.push({ field, direction });
    return this;
  }

  skip(value) {
    this.skipValue = value;
    this.collection.skipCalls.push(value);
    return this;
  }

  limit(value) {
    this.limitValue = value;
    this.collection.limitCalls.push(value);
    return this;
  }

  async get() {
    if (this.collection.failOnSkip.has(this.skipValue)) {
      throw new Error(`模拟分页失败：skip=${this.skipValue}`);
    }
    const filtered = this.collection.records.filter(record => this.predicate(record));
    const ordered = this.orderField === '_id' && this.orderDirection === 'asc'
      ? [...filtered].sort((left, right) => String(left._id || '').localeCompare(String(right._id || '')))
      : filtered;
    const sliced = deepClone(ordered.slice(this.skipValue, this.skipValue + this.limitValue));
    if (this.collection.getDelays.has(this.skipValue)) {
      await new Promise(resolve => setTimeout(resolve, this.collection.getDelays.get(this.skipValue)));
    }
    return { data: deepClone(sliced) };
  }
}

class FakeCollection extends FakeQuery {
  constructor(records = []) {
    super(null);
    this.collection = this;
    this.records = records.map(deepClone);
    this.docs = new Map(this.records.map(record => [record._id, record]));
    this.skipCalls = [];
    this.limitCalls = [];
    this.orderByCalls = [];
    this.docSetCalls = [];
    this.docUpdateCalls = [];
    this.docRemoveCalls = [];
    this.docGetCalls = [];
    this.failOnSkip = new Set();
    this.failSetIds = new Set();
    this.failRemoveIds = new Set();
    this.failGetIds = new Set();
    this.setDelays = new Map();
    this.getDelays = new Map();
  }

  doc(id) {
    return new FakeDocRef(this, id);
  }

  where(filter) {
    return new FakeQuery(this, record => Object.keys(filter).every(key => record[key] === filter[key]));
  }

  addRecord(record) {
    const next = deepClone(record);
    this.records.push(next);
    this.docs.set(next._id, next);
  }
}

function applyCollectionOptions(collection, options = {}) {
  if (options.failSetIds) options.failSetIds.forEach(id => collection.failSetIds.add(id));
  if (options.failRemoveIds) options.failRemoveIds.forEach(id => collection.failRemoveIds.add(id));
  if (options.failGetIds) options.failGetIds.forEach(id => collection.failGetIds.add(id));
  if (options.setDelays) {
    Object.keys(options.setDelays).forEach(id => collection.setDelays.set(id, options.setDelays[id]));
  }
  if (options.getDelays) {
    Object.keys(options.getDelays).forEach(skip => collection.getDelays.set(Number(skip), options.getDelays[skip]));
  }
}

class FakeDb {
  constructor(seed = {}, options = {}) {
    this.collections = new Map();
    this.runTransactionCalls = 0;
    this.transactionSetCalls = [];
    this.transactionRemoveCalls = [];
    this.enableRunTransaction = Boolean(options.runTransaction);
    Object.keys(seed).forEach(name => {
      this.collections.set(name, new FakeCollection(seed[name]));
      applyCollectionOptions(this.collections.get(name), options);
    });
    this.options = options;
    if (this.enableRunTransaction) {
      this.runTransaction = async (handler) => {
        this.runTransactionCalls += 1;
        const db = this;
        const shadowCollections = new Map();
        const getShadowCollection = (name) => {
          if (!shadowCollections.has(name)) {
            const source = db.collection(name);
            const shadow = new FakeCollection(source.records);
            shadow.failOnSkip = new Set(source.failOnSkip);
            shadow.failSetIds = new Set(source.failSetIds);
            shadow.failRemoveIds = new Set(source.failRemoveIds);
            shadow.failGetIds = new Set(source.failGetIds);
            shadow.setDelays = new Map(source.setDelays);
            shadow.getDelays = new Map(source.getDelays);
            shadowCollections.set(name, shadow);
          }
          return shadowCollections.get(name);
        };
        const transaction = {
          collection: (name) => {
            const collection = getShadowCollection(name);
            return {
              doc: (id) => ({
                async get() {
                  return collection.doc(id).get();
                },
                async set(payload) {
                  db.transactionSetCalls.push({ id, data: deepClone(payload.data), collection: name });
                  return collection.doc(id).set(payload);
                },
                async remove() {
                  db.transactionRemoveCalls.push({ id, collection: name });
                  return collection.doc(id).remove();
                },
              }),
            };
          },
        };
        try {
          const result = await handler(transaction);
          shadowCollections.forEach((shadow, name) => {
            const target = db.collection(name);
            target.records = shadow.records.map(deepClone);
            target.docs = new Map(target.records.map(record => [record._id, deepClone(record)]));
            target.docSetCalls.push(...shadow.docSetCalls.map(deepClone));
            target.docUpdateCalls.push(...shadow.docUpdateCalls.map(deepClone));
            target.docRemoveCalls.push(...shadow.docRemoveCalls.map(deepClone));
          });
          return result;
        } catch (error) {
          throw error;
        }
      };
    }
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new FakeCollection());
      applyCollectionOptions(this.collections.get(name), this.options);
    }
    return this.collections.get(name);
  }
}

function resetStorage() {
  storage.clear();
  callFunctionCalls = [];
}

function setCloudDb(db) {
  currentCloudDb = db;
}

function getCollection(db) {
  return db.collection(COLLECTION_NAME);
}

async function main() {
  assert.equal(typeof service.listOptionCatalogRecords, 'function', '应导出 listOptionCatalogRecords');
  assert.equal(typeof service.readOptionCatalogCache, 'function', '应导出 readOptionCatalogCache');
  assert.equal(typeof service.saveOptionCatalogCache, 'function', '应导出 saveOptionCatalogCache');
  assert.equal(typeof service.createSharedOption, 'function', '应导出 createSharedOption');
  assert.equal(typeof service.updateSharedOption, 'function', '应导出 updateSharedOption');
  assert.equal(typeof service.deleteSharedOption, 'function', '应导出 deleteSharedOption');
  assert.equal(typeof service.saveSharedGroupOrders, 'function', '应导出 saveSharedGroupOrders');

  resetStorage();
  setCloudDb(null);

  const seededCache = [makeManagedRecord(1, { _id: 'cached_record', optionId: 'option_cached' })];
  service.saveOptionCatalogCache(seededCache);
  const cacheSnapshot = service.readOptionCatalogCache();
  assert.deepEqual(cacheSnapshot, seededCache, '读写缓存应该保持内容一致');
  seededCache[0].name = '被修改的原始对象';
  assert.equal(service.readOptionCatalogCache()[0].name, '云端管理标签1', '保存到缓存的记录应该是可序列化克隆');

  storage.set(CACHE_KEY, { invalid: true });
  assert.deepEqual(service.readOptionCatalogCache(), [], '非数组缓存应该回退为空数组');

  const pageRecords = Array.from({ length: 23 }, (_, index) => makeLegacyRecord(index + 1));
  const pageDb = new FakeDb({ [COLLECTION_NAME]: pageRecords });
  const loaded = await service.listOptionCatalogRecords(pageDb);
  assert.deepEqual(getCollection(pageDb).skipCalls, [0, 20], '分页读取应该按 20 条一页滚动');
  assert.deepEqual(getCollection(pageDb).orderByCalls, [
    { field: '_id', direction: 'asc' },
    { field: '_id', direction: 'asc' },
  ], '分页读取每页都应该显式按 _id asc 排序');
  assert.equal(loaded.length, 23, '23 条数据应该完整读出');
  assert.equal(loaded[0].name, '云端旧标签1', '读取结果应该保留合法记录');
  assert.deepEqual(service.readOptionCatalogCache(), loaded, '完整读取成功后应该刷新本地缓存');

  resetStorage();
  const scrambledRecords = [
    makeLegacyRecord(23),
    makeLegacyRecord(5),
    makeLegacyRecord(1),
    makeLegacyRecord(19),
    makeLegacyRecord(12),
    makeLegacyRecord(9),
    makeLegacyRecord(2),
    makeLegacyRecord(17),
    makeLegacyRecord(8),
    makeLegacyRecord(14),
    makeLegacyRecord(4),
    makeLegacyRecord(22),
    makeLegacyRecord(7),
    makeLegacyRecord(18),
    makeLegacyRecord(10),
    makeLegacyRecord(16),
    makeLegacyRecord(3),
    makeLegacyRecord(21),
    makeLegacyRecord(6),
    makeLegacyRecord(20),
    makeLegacyRecord(13),
    makeLegacyRecord(11),
    makeLegacyRecord(15),
  ];
  const scrambledDb = new FakeDb({ [COLLECTION_NAME]: scrambledRecords });
  const scrambledLoaded = await service.listOptionCatalogRecords(scrambledDb);
  assert.equal(scrambledLoaded.length, 23, '乱序输入也应该完整返回 23 条');
  const expectedScrambledOrder = scrambledRecords
    .map(record => record._id)
    .sort((left, right) => String(left).localeCompare(String(right)));
  assert.deepEqual(scrambledLoaded.map(record => record._id), expectedScrambledOrder, '乱序输入应该按 _id asc 稳定排序且不重不漏');

  const noisyRecords = [
    makeLegacyRecord(1),
    makeLegacyRecord(2, { name: '   ', normalizedName: '   ' }),
    makeManagedRecord(1),
    makeManagedRecord(2, { source: 'other' }),
    makeManagedRecord(3, { deleted: true }),
    makeGroupOrderRecord(1),
    makeGroupOrderRecord(2, { groupId: 'other' }),
    makeGroupOrderRecord(3, { optionIds: 'not-an-array' }),
  ];
  const noisyDb = new FakeDb({ [COLLECTION_NAME]: noisyRecords });
  const normalized = await service.listOptionCatalogRecords(noisyDb);
  assert.equal(normalized.length, 4, '无效 legacy/managed/order 记录应该被过滤掉');
  assert.equal(normalized.some(record => record._id === 'legacy_2'), false, '空名 legacy 记录不应保留');
  assert.equal(normalized.some(record => record._id === 'managed_2'), false, '非法 source managed 记录不应保留');
  assert.equal(normalized.some(record => record._id === 'order_2'), false, '非固定组 order 记录不应保留');

  resetStorage();
  const raceSeedRecords = Array.from({ length: 21 }, (_, index) => makeLegacyRecord(index + 1));
  const raceDb = new FakeDb({ [COLLECTION_NAME]: raceSeedRecords }, { getDelays: { 20: 40 } });
  const raceListPromise = service.listOptionCatalogRecords(raceDb);
  await new Promise(resolve => setTimeout(resolve, 5));
  const raceCreated = await service.createSharedOption(
    { categoryId: 'eat', groupId: 'cuisine', name: '并发补充', description: '' },
    CATEGORIES,
    raceDb,
    { now: 9000, randomPart: 'race' }
  );
  const raceLoaded = await raceListPromise;
  assert.equal(raceLoaded.length, 22, '延迟列表完成后应保留旧云记录和并发创建记录');
  assert.equal(raceLoaded.some(record => 'recordType' in record && record.recordType === 'option' && record.optionId === raceCreated.id), true, '延迟列表返回值应包含并发创建的 managed 记录');
  assert.equal(service.readOptionCatalogCache().some(record => 'recordType' in record && record.recordType === 'option' && record.optionId === raceCreated.id), true, '延迟列表刷新后的 cache 应包含并发创建的 managed 记录');
  assert.equal(service.readOptionCatalogCache().some(record => !('recordType' in record) && record._id === raceSeedRecords[0]._id), true, '延迟列表刷新后的 cache 应保留旧云记录');

  const legacyOnlyRecords = Array.from({ length: 23 }, (_, index) => makeLegacyRecord(index + 1));
  const mixedLegacyAndManaged = [
    ...legacyOnlyRecords,
    makeManagedRecord(99, { _id: 'managed_should_not_leak', optionId: 'option_should_not_leak', name: '不应出现' }),
  ];
  const legacyDb = new FakeDb({ [COLLECTION_NAME]: mixedLegacyAndManaged });
  setCloudDb(legacyDb);
  assert.equal(typeof service.listCustomOptions, 'undefined', '不应继续导出旧 listCustomOptions 兼容入口');
  assert.equal(typeof service.upsertCustomOptions, 'undefined', '不应继续导出旧 upsertCustomOptions 兼容入口');
  assert.equal(typeof service.deleteCustomOption, 'undefined', '不应继续导出旧 deleteCustomOption 兼容入口');
  const legacyCatalogRecords = await service.listOptionCatalogRecords(legacyDb);
  assert.deepEqual(getCollection(legacyDb).skipCalls, [0, 20], 'catalog 入口应该按 20 条分页读取 legacy 数据');
  assert.equal(legacyCatalogRecords.filter(record => !('recordType' in record)).length, 23, 'catalog 入口应该继续返回完整 legacy 数据');
  assert.equal(legacyCatalogRecords.some(record => 'recordType' in record && record.optionId === 'option_should_not_leak'), true, 'catalog 入口应同时保留 managed 记录');
  assert.deepEqual(service.readOptionCatalogCache().length, 24, 'catalog 入口调用后缓存应由完整 catalog 结果维护');

  resetStorage();
  const coldManagedDocId = buildManagedDocId('option_cold');
  const coldExistingDb = new FakeDb({
    [COLLECTION_NAME]: [
      makeManagedRecord(7, {
        _id: coldManagedDocId,
        optionId: 'option_cold',
        categoryId: 'eat',
        groupId: 'cuisine',
        source: 'custom',
        name: '冷标签',
        normalizedName: '冷标签',
        description: '旧描述',
        createdAt: 111,
        updatedAt: 222,
      }),
    ],
  });
  const coldUpdated = await service.updateSharedOption(
    { id: 'option_cold', groupId: 'cuisine', name: '冷标签', emoji: '', isCustom: true, canDelete: true, description: '旧描述' },
    { categoryId: 'eat', groupId: 'cuisine', name: '冷标签升级', description: '新描述' },
    CATEGORIES,
    coldExistingDb
  );
  assert.equal(coldUpdated.id, 'option_cold', '冷缓存编辑不应改变 optionId');
  assert.equal(getCollection(coldExistingDb).docGetCalls.includes(coldManagedDocId), true, '冷缓存编辑应该先从 db 读取旧 managed 文档');
  assert.equal(getCollection(coldExistingDb).docs.get(coldManagedDocId).createdAt, 111, '冷缓存编辑应该保留原 createdAt');
  assert.equal(getCollection(coldExistingDb).docs.get(coldManagedDocId).source, 'custom', '冷缓存编辑应该保留原 source');

  resetStorage();
  const coldDeleteDb = new FakeDb({
    [COLLECTION_NAME]: [
      makeManagedRecord(8, {
        _id: coldManagedDocId,
        optionId: 'option_cold',
        categoryId: 'eat',
        groupId: 'cuisine',
        source: 'custom',
        name: '冷标签',
        normalizedName: '冷标签',
        description: '旧描述',
        createdAt: 333,
        updatedAt: 444,
      }),
    ],
  });
  const coldDeleted = await service.deleteSharedOption(
    { id: 'option_cold', groupId: 'cuisine', name: '冷标签', emoji: '', isCustom: true, canDelete: true, description: '旧描述' },
    'eat',
    coldDeleteDb
  );
  assert.equal(coldDeleted.deleted, true, '冷缓存删除应该写 tombstone');
  assert.equal(getCollection(coldDeleteDb).docGetCalls.includes(coldManagedDocId), true, '冷缓存删除应该先从 db 读取旧 managed 文档');
  assert.equal(getCollection(coldDeleteDb).docs.get(coldManagedDocId).createdAt, 333, '冷缓存删除应该保留原 createdAt');
  assert.equal(getCollection(coldDeleteDb).docs.get(coldManagedDocId).source, 'custom', '冷缓存删除应该保留原 source');

  resetStorage();
  const presetOption = CATEGORIES.find(category => category.id === 'eat').optionGroups[0].options[0];
  const originalNow = Date.now;
  Date.now = () => 5000;
  try {
    const presetUpdated = await service.updateSharedOption(
      presetOption,
      { categoryId: 'eat', groupId: 'cuisine', name: '湘菜升级', description: '预设兜底' },
      CATEGORIES,
      new FakeDb()
    );
    assert.equal(presetUpdated.id, presetOption.id, '预设兜底编辑不应改变 optionId');
    assert.equal(presetUpdated.isCustom, false, '预设兜底编辑不应冒充自定义');
    assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'option' && record.optionId === presetOption.id), true, '预设兜底编辑应该进入缓存');
    const presetCacheRecord = service.readOptionCatalogCache().find(record => record.recordType === 'option' && record.optionId === presetOption.id);
    assert(presetCacheRecord, '预设兜底编辑后应能在 cache 中找到记录');
    assert.equal(presetCacheRecord.createdAt, 5000, '预设兜底编辑应该使用当前时间作为 createdAt');
    assert.equal(presetCacheRecord.source, 'preset', '预设兜底编辑应该允许用 option.isCustom 推断 source');
  } finally {
    Date.now = originalNow;
  }

  resetStorage();
  const transactionOrderDb = new FakeDb({
    [COLLECTION_NAME]: [
      {
        _id: buildOrderDocId('eat', 'cuisine'),
        recordType: 'group_order',
        categoryId: 'eat',
        groupId: 'cuisine',
        optionIds: ['old_cuisine'],
        updatedAt: 1,
      },
      {
        _id: buildOrderDocId('eat', 'grill'),
        recordType: 'group_order',
        categoryId: 'eat',
        groupId: 'grill',
        optionIds: ['old_grill'],
        updatedAt: 1,
      },
    ],
  }, { runTransaction: true });
  await service.saveSharedGroupOrders('eat', [
    { groupId: 'cuisine', optionIds: ['new_cuisine'] },
    { groupId: 'grill', optionIds: ['new_grill'] },
  ], transactionOrderDb);
  assert.equal(transactionOrderDb.runTransactionCalls, 1, '支持 runTransaction 时应走事务路径');
  assert.equal(transactionOrderDb.transactionSetCalls.length, 2, '事务路径应在同一 transaction 内写入全部 group order');
  assert.equal(getCollection(transactionOrderDb).docs.get(buildOrderDocId('eat', 'cuisine')).optionIds[0], 'new_cuisine', '事务路径应写入新顺序');

  resetStorage();
  service.saveOptionCatalogCache([
    {
      recordType: 'group_order',
      _id: buildOrderDocId('eat', 'cuisine'),
      categoryId: 'eat',
      groupId: 'cuisine',
      optionIds: ['old_cuisine'],
      updatedAt: 1,
    },
    {
      recordType: 'group_order',
      _id: buildOrderDocId('eat', 'grill'),
      categoryId: 'eat',
      groupId: 'grill',
      optionIds: ['old_grill'],
      updatedAt: 1,
    },
  ]);
  const atomicFailDb = new FakeDb({
    [COLLECTION_NAME]: [
      {
        _id: buildOrderDocId('eat', 'cuisine'),
        recordType: 'group_order',
        categoryId: 'eat',
        groupId: 'cuisine',
        optionIds: ['old_cuisine'],
        updatedAt: 1,
      },
      {
        _id: buildOrderDocId('eat', 'grill'),
        recordType: 'group_order',
        categoryId: 'eat',
        groupId: 'grill',
        optionIds: ['old_grill'],
        updatedAt: 1,
      },
    ],
  }, {
    runTransaction: true,
    failSetIds: new Set([buildOrderDocId('eat', 'grill')]),
  });
  let atomicFail = false;
  try {
    await service.saveSharedGroupOrders('eat', [
      { groupId: 'cuisine', optionIds: ['new_cuisine'] },
      { groupId: 'grill', optionIds: ['new_grill'] },
    ], atomicFailDb);
  } catch (error) {
    atomicFail = true;
  }
  assert.equal(atomicFail, true, '事务第二笔失败时应抛出错误');
  assert.equal(getCollection(atomicFailDb).docs.get(buildOrderDocId('eat', 'cuisine')).optionIds[0], 'old_cuisine', '事务第二笔失败时第一笔不应落库');
  assert.equal(getCollection(atomicFailDb).docs.get(buildOrderDocId('eat', 'grill')).optionIds[0], 'old_grill', '事务第二笔失败时第二笔也不应落库');
  assert.equal(service.readOptionCatalogCache()[0].optionIds[0], 'old_cuisine', '事务第二笔失败时 cache 不应更新');

  resetStorage();
  service.saveOptionCatalogCache([
    {
      recordType: 'group_order',
      _id: buildOrderDocId('eat', 'cuisine'),
      categoryId: 'eat',
      groupId: 'cuisine',
      optionIds: ['old_cuisine'],
      updatedAt: 1,
    },
    {
      recordType: 'group_order',
      _id: buildOrderDocId('eat', 'grill'),
      categoryId: 'eat',
      groupId: 'grill',
      optionIds: ['old_grill'],
      updatedAt: 1,
    },
  ]);
  const unsupportedOrderDb = new FakeDb({
    [COLLECTION_NAME]: [
      {
        _id: buildOrderDocId('eat', 'cuisine'),
        recordType: 'group_order',
        categoryId: 'eat',
        groupId: 'cuisine',
        optionIds: ['old_cuisine'],
        updatedAt: 1,
      },
      {
        _id: buildOrderDocId('eat', 'grill'),
        recordType: 'group_order',
        categoryId: 'eat',
        groupId: 'grill',
        optionIds: ['old_grill'],
        updatedAt: 1,
      },
    ],
  });
  let unsupportedOrderFailed = false;
  try {
    await service.saveSharedGroupOrders('eat', [
      { groupId: 'cuisine', optionIds: ['new_cuisine'] },
      { groupId: 'grill', optionIds: ['new_grill'] },
    ], unsupportedOrderDb);
  } catch (error) {
    unsupportedOrderFailed = true;
    assert.equal(error.code, 'transaction_unsupported', '无事务时应该明确返回 transaction_unsupported');
  }
  assert.equal(unsupportedOrderFailed, true, '无事务时应直接失败');
  assert.equal(getCollection(unsupportedOrderDb).docSetCalls.length, 0, '无事务时不应写云端');
  assert.equal(getCollection(unsupportedOrderDb).docRemoveCalls.length, 0, '无事务时不应删除云端');
  assert.equal(service.readOptionCatalogCache()[0].optionIds[0], 'old_cuisine', '无事务时 cache 不应更新');

  resetStorage();
  const createDocIdA = buildManagedDocId(createStableOptionId(100, 'aaa'));
  const createDocIdB = buildManagedDocId(createStableOptionId(101, 'bbb'));
  const concurrencyDb = new FakeDb({}, {
    setDelays: {
      [createDocIdA]: 30,
      [createDocIdB]: 0,
    },
  });
  const [createdA, createdB] = await Promise.all([
    service.createSharedOption(
      { categoryId: 'eat', groupId: 'cuisine', name: '并发一', description: '' },
      CATEGORIES,
      concurrencyDb,
      { now: 100, randomPart: 'aaa' }
    ),
    service.createSharedOption(
      { categoryId: 'eat', groupId: 'cuisine', name: '并发二', description: '' },
      CATEGORIES,
      concurrencyDb,
      { now: 101, randomPart: 'bbb' }
    ),
  ]);
  assert.equal(createdA.id !== createdB.id, true, '并发创建应生成不同 optionId');
  assert.equal(service.readOptionCatalogCache().filter(record => record.recordType === 'option').length, 2, '并发创建后 cache 应包含两条 managed 记录');
  assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'option' && record.optionId === createdA.id), true, '并发创建后 cache 应保留第一条');
  assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'option' && record.optionId === createdB.id), true, '并发创建后 cache 应保留第二条');

  const staleCreateDb = new FakeDb({
    [COLLECTION_NAME]: [
      makeManagedRecord(50, {
        optionId: 'option_remote_duplicate',
        categoryId: 'eat',
        groupId: 'cuisine',
        name: '云端同名',
        normalizedName: '云端同名',
        deleted: false,
      }),
    ],
  });
  await assert.rejects(
    () => service.createSharedOption(
      { categoryId: 'eat', groupId: 'cuisine', name: '云端同名', description: '' },
      CATEGORIES,
      staleCreateDb,
      { now: 200, randomPart: 'dup' }
    ),
    error => error.code === 'duplicate',
    '云端已有同名有效选项时，即使本地目录陈旧也应拒绝新增'
  );
  assert.equal(getCollection(staleCreateDb).docSetCalls.length, 0, '云端重名新增失败时不应写入 managed 文档');

  const staleUpdateDb = new FakeDb({
    [COLLECTION_NAME]: [
      makeManagedRecord(51, {
        _id: buildManagedDocId('option_update_self'),
        optionId: 'option_update_self',
        categoryId: 'eat',
        groupId: 'cuisine',
        source: 'custom',
        name: '原标签',
        normalizedName: '原标签',
      }),
      makeManagedRecord(52, {
        _id: buildManagedDocId('option_update_duplicate'),
        optionId: 'option_update_duplicate',
        categoryId: 'eat',
        groupId: 'cuisine',
        source: 'custom',
        name: '云端编辑同名',
        normalizedName: '云端编辑同名',
      }),
    ],
  });
  await assert.rejects(
    () => service.updateSharedOption(
      { id: 'option_update_self', groupId: 'cuisine', name: '原标签', emoji: '', isCustom: true, canDelete: true },
      { categoryId: 'eat', groupId: 'cuisine', name: '云端编辑同名', description: '' },
      CATEGORIES,
      staleUpdateDb
    ),
    error => error.code === 'duplicate',
    '云端已有同名有效选项时，即使本地目录陈旧也应拒绝编辑'
  );
  assert.equal(getCollection(staleUpdateDb).docSetCalls.length, 0, '云端重名编辑失败时不应写入 managed 文档');

  const failingDb = new FakeDb({ [COLLECTION_NAME]: pageRecords });
  getCollection(failingDb).failOnSkip.add(20);
  service.saveOptionCatalogCache([makeManagedRecord(2, { _id: 'old_cache', optionId: 'option_old_cache' })]);
  setCloudDb(failingDb);
  let failed = false;
  try {
    await service.listOptionCatalogRecords(failingDb);
  } catch (error) {
    failed = true;
  }
  assert.equal(failed, true, '分页读取中途失败应该抛出错误');
  assert.equal(service.readOptionCatalogCache()[0]._id, 'old_cache', '中途失败不应覆盖旧缓存');
  setCloudDb(null);

  resetStorage();
  const createDb = new FakeDb();
  const createInput = { categoryId: 'eat', groupId: 'cuisine', name: '  火锅拼盘  ', description: '  适合两个人  ' };
  const created = await service.createSharedOption(createInput, CATEGORIES, createDb, { now: 100, randomPart: 'abc' });
  assert.equal(created.id, createStableOptionId(100, 'abc'), '测试注入的稳定 ID 应该生效');
  assert.equal(created.groupId, 'cuisine', '创建后的 option 应保留目标分组');
  assert.equal(created.name, '火锅拼盘', '创建时应该修剪名称');
  assert.equal(created.description, '适合两个人', '创建时应该修剪描述');
  assert.equal(created.isCustom, true, '创建后的 option 应标记为自定义');
  assert.equal(created.canDelete, true, '创建后的 option 应可删除');
  assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'option' && record.optionId === created.id), true, '创建成功后应该刷新缓存');
  const createdDocId = buildManagedDocId(created.id);
  assert.equal(getCollection(createDb).docs.has(createdDocId), true, 'managed 文档 ID 应写入固定前缀');
  assert.equal(getCollection(createDb).docs.get(createdDocId).source, 'custom', '创建的 managed 记录 source 应为 custom');
  assert.equal(getCollection(createDb).docs.get(createdDocId).description, '适合两个人', '创建的 managed 记录描述应该被修剪');

  const catalogAfterCreate = buildCatalog(service.readOptionCatalogCache());
  const updated = await service.updateSharedOption(
    created,
    { categoryId: 'eat', groupId: 'grill', name: '  烤肉拼盘  ', description: '  更适合晚上  ' },
    catalogAfterCreate,
    createDb
  );
  assert.equal(updated.id, created.id, '更新不应改变 optionId');
  assert.equal(updated.groupId, 'grill', '更新应该允许切换固定分组');
  assert.equal(updated.name, '烤肉拼盘', '更新后名称应修剪');
  assert.equal(updated.description, '更适合晚上', '更新后描述应修剪');
  assert.equal(getCollection(createDb).docs.get(createdDocId).createdAt, 100, '更新应该保留 createdAt');
  assert.equal(getCollection(createDb).docs.get(createdDocId).source, 'custom', '更新应该保留 source');

  const deleted = await service.deleteSharedOption(updated, 'eat', createDb);
  assert.equal(deleted.deleted, true, '删除应该写入 tombstone');
  assert.equal(getCollection(createDb).docs.get(createdDocId).deleted, true, '删除不应 remove 文档，而应写入 deleted=true');
  assert.equal(getCollection(createDb).docs.get(createdDocId).name, '烤肉拼盘', '删除时应该保留名称');
  assert.equal(getCollection(createDb).docs.get(createdDocId).groupId, 'grill', '删除时应该保留分组');

  const orderDb = new FakeDb({
    [COLLECTION_NAME]: [
      makeManagedRecord(11, { optionId: 'option_11', groupId: 'cuisine', name: 'A', normalizedName: 'A' }),
      makeManagedRecord(12, { optionId: 'option_12', groupId: 'cuisine', name: 'B', normalizedName: 'B' }),
    ],
  }, { runTransaction: true });
  const ordered = await service.saveSharedGroupOrders('eat', [
    { groupId: 'cuisine', optionIds: ['option_12', 'option_11'] },
    { groupId: 'grill', optionIds: ['option_20', 'option_21'] },
  ], orderDb);
  assert.equal(ordered.length, 2, '应该为每个固定组保存顺序记录');
  assert.equal(getCollection(orderDb).docs.get(buildOrderDocId('eat', 'cuisine')).optionIds[0], 'option_12', '顺序记录应按传入 optionIds 保存');
  assert.equal(getCollection(orderDb).docs.get(buildOrderDocId('eat', 'grill')).optionIds[1], 'option_21', '顺序记录应完整保存 optionIds');
  assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'group_order'), true, '保存顺序后应该刷新缓存');

  const emptySourceOrder = await service.saveSharedGroupOrders('eat', [
    { groupId: 'cuisine', optionIds: [] },
    { groupId: 'grill', optionIds: ['option_12', 'option_11'] },
  ], orderDb);
  assert.equal(emptySourceOrder.length, 2, '移空源分组时仍应保存两个受影响分组顺序');
  assert.deepEqual(getCollection(orderDb).docs.get(buildOrderDocId('eat', 'cuisine')).optionIds, [], '源分组被移空时应保存空顺序');
  const cachedEmptyOrder = service.readOptionCatalogCache()
    .find(record => record.recordType === 'group_order' && record.categoryId === 'eat' && record.groupId === 'cuisine');
  assert.deepEqual(cachedEmptyOrder.optionIds, [], '源分组空顺序应保留在本地目录缓存里');
  const reloadedEmptyOrder = (await service.listOptionCatalogRecords(orderDb))
    .find(record => record.recordType === 'group_order' && record.categoryId === 'eat' && record.groupId === 'cuisine');
  assert.deepEqual(reloadedEmptyOrder.optionIds, [], '源分组空顺序重新从云端读取时不应被归一化丢弃');

  resetStorage();
  const cloudProxyDb = new FakeDb({
    [COLLECTION_NAME]: [
      makeManagedRecord(70, {
        _id: buildManagedDocId('option_proxy_existing'),
        optionId: 'option_proxy_existing',
        categoryId: 'eat',
        groupId: 'cuisine',
        source: 'custom',
        name: '云函数旧标签',
        normalizedName: '云函数旧标签',
        description: '旧描述',
        deleted: false,
        createdAt: 700,
        updatedAt: 701,
      }),
    ],
  });
  setCloudDb(cloudProxyDb);
  const proxiedCreated = await service.createSharedOption(
    { categoryId: 'eat', groupId: 'cuisine', name: '云函数新增', description: '走代理' },
    CATEGORIES,
    undefined,
    { now: 800, randomPart: 'proxy' }
  );
  const proxiedUpdated = await service.updateSharedOption(
    { id: 'option_proxy_existing', groupId: 'cuisine', name: '云函数旧标签', emoji: '', isCustom: true, canDelete: true, description: '旧描述' },
    { categoryId: 'eat', groupId: 'grill', name: '云函数编辑', description: '也走代理' },
    CATEGORIES
  );
  const proxiedDeleted = await service.deleteSharedOption(
    proxiedUpdated,
    'eat'
  );
  const proxiedOrders = await service.saveSharedGroupOrders('eat', [
    { groupId: 'cuisine', optionIds: [proxiedCreated.id] },
    { groupId: 'grill', optionIds: ['option_proxy_existing'] },
  ]);

  assert.deepEqual(callFunctionCalls.map(call => call.name), [
    'manageOptions',
    'manageOptions',
    'manageOptions',
    'manageOptions',
  ], '默认写操作必须统一调用 manageOptions 云函数');
  assert.deepEqual(callFunctionCalls.map(call => call.data.action), [
    'createOption',
    'updateOption',
    'deleteOption',
    'saveGroupOrders',
  ], '云函数代理必须区分新增、编辑、删除和排序动作');
  assert.equal(getCollection(cloudProxyDb).docSetCalls.length, 0, '默认写操作不应由小程序端直接 set custom_options');
  assert.equal(cloudProxyDb.runTransactionCalls, 0, '默认排序不应由小程序端直接开启数据库事务');
  assert.equal(proxiedDeleted.deleted, true, '云函数删除成功后本地仍应得到 tombstone');
  assert.equal(proxiedOrders.length, 2, '云函数排序成功后本地仍应得到顺序记录');
  assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'option' && record.optionId === proxiedCreated.id), true, '云函数新增成功后应刷新本地缓存');
  assert.equal(service.readOptionCatalogCache().some(record => record.recordType === 'group_order' && record.groupId === 'grill'), true, '云函数排序成功后应刷新本地缓存');
  setCloudDb(null);

  let fixedOrderFailed = false;
  try {
    await service.saveSharedGroupOrders('eat', [
      { groupId: 'other', optionIds: ['x'] },
    ], orderDb);
  } catch (error) {
    fixedOrderFailed = true;
  }
  assert.equal(fixedOrderFailed, true, '不允许保存非固定组顺序');

  console.log('option service checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
