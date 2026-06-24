const assert = require('assert').strict;
const Module = require('module');
const path = require('path');

const setCalls = [];
let duplicateQueryRecords = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeQuery() {
  const query = {
    filter: null,
    where() {
      query.filter = arguments[0];
      return query;
    },
    skip() {
      return query;
    },
    limit() {
      return query;
    },
    async get() {
      if (query.filter && query.filter.categoryId && query.filter.normalizedName) {
        return {
          data: duplicateQueryRecords.filter(record => (
            record.categoryId === query.filter.categoryId &&
            record.normalizedName === query.filter.normalizedName
          )).map(clone),
        };
      }
      return { data: [] };
    },
  };
  return query;
}

function makeCollection(name) {
  return {
    ...makeQuery(),
    doc(id) {
      return {
        async set(payload) {
          setCalls.push({ collection: name, id, data: clone(payload.data) });
          return {};
        },
      };
    },
  };
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: Symbol('DYNAMIC_CURRENT_ENV'),
  init() {},
  getWXContext() {
    return { OPENID: 'tester-openid' };
  },
  database() {
    return {
      collection: makeCollection,
      async runTransaction(handler) {
        return handler({
          collection: makeCollection,
        });
      },
    };
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return fakeCloud;
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  const functionPath = path.join(__dirname, '..', 'cloudfunctions/manageOptions/index.js');
  delete require.cache[require.resolve(functionPath)];
  const manageOptions = require(functionPath);

  await manageOptions.main({
    action: 'createOption',
    payload: {
      record: {
        _id: 'managed_should_be_ignored',
        recordType: 'option',
        optionId: 'option_test',
        categoryId: 'eat',
        groupId: 'cuisine',
        source: 'custom',
        name: '云函数测试',
        normalizedName: '云函数测试',
        description: '',
        deleted: false,
        createdAt: 1,
        updatedAt: 2,
      },
    },
  });

  await manageOptions.main({
    action: 'saveGroupOrders',
    payload: {
      records: [
        {
          _id: 'order_should_be_ignored',
          recordType: 'group_order',
          categoryId: 'eat',
          groupId: 'cuisine',
          optionIds: ['option_test'],
          updatedAt: 3,
        },
      ],
    },
  });

  await manageOptions.main({
    action: 'createOption',
    payload: {
      record: {
        _id: 'managed_other_should_be_ignored',
        recordType: 'option',
        optionId: 'option_other_test',
        categoryId: 'eat',
        groupId: 'other',
        source: 'custom',
        name: '其他分组测试',
        normalizedName: '其他分组测试',
        description: '',
        deleted: false,
        createdAt: 4,
        updatedAt: 5,
      },
    },
  });

  await manageOptions.main({
    action: 'saveGroupOrders',
    payload: {
      records: [
        {
          _id: 'order_other_should_be_ignored',
          recordType: 'group_order',
          categoryId: 'eat',
          groupId: 'other',
          optionIds: ['option_other_test'],
          updatedAt: 6,
        },
      ],
    },
  });

  duplicateQueryRecords = [
    {
      _id: 'managed_deleted_chicken',
      recordType: 'option',
      optionId: 'option_deleted_chicken',
      categoryId: 'eat',
      groupId: 'other',
      source: 'custom',
      name: '鸡煲',
      normalizedName: '鸡煲',
      description: '',
      deleted: false,
      createdAt: 10,
      updatedAt: 10,
    },
    {
      _id: 'managed_deleted_chicken',
      recordType: 'option',
      optionId: 'option_deleted_chicken',
      categoryId: 'eat',
      groupId: 'other',
      source: 'custom',
      name: '鸡煲',
      normalizedName: '鸡煲',
      description: '',
      deleted: true,
      createdAt: 10,
      updatedAt: 20,
    },
  ];
  await manageOptions.main({
    action: 'createOption',
    payload: {
      record: {
        _id: 'managed_recreated_chicken_should_be_ignored',
        recordType: 'option',
        optionId: 'option_recreated_chicken',
        categoryId: 'eat',
        groupId: 'other',
        source: 'custom',
        name: '鸡煲',
        normalizedName: '鸡煲',
        description: '',
        deleted: false,
        createdAt: 7,
        updatedAt: 8,
      },
    },
  });

  assert.equal(setCalls.length, 5, '云函数应写入 option、group_order、other 分组记录以及已删除同名的重建记录');
  assert.equal(setCalls[0].id.startsWith('managed_'), true, 'option 应使用 doc(id) 指定文档 ID');
  assert.equal(setCalls[1].id.startsWith('order_'), true, 'group_order 应使用 doc(id) 指定文档 ID');
  assert.equal(setCalls[2].data.groupId, 'other', 'other 分组也应允许新增自定义标签');
  assert.equal(setCalls[3].data.groupId, 'other', 'other 分组也应允许保存排序');
  assert.equal(setCalls[4].data.name, '鸡煲', '被 tombstone 删除过的同名活动应允许重新新增');
  assert.equal('_id' in setCalls[0].data, false, 'option 写入 data 时不能携带 _id');
  assert.equal('_id' in setCalls[1].data, false, 'group_order 写入 data 时不能携带 _id');

  console.log('manageOptions cloudfunction checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
