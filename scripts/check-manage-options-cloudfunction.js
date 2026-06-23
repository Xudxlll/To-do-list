const assert = require('assert').strict;
const Module = require('module');
const path = require('path');

const setCalls = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeQuery() {
  const query = {
    where() {
      return query;
    },
    skip() {
      return query;
    },
    limit() {
      return query;
    },
    async get() {
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

  assert.equal(setCalls.length, 2, '云函数应写入 option 和 group_order 两类记录');
  assert.equal(setCalls[0].id.startsWith('managed_'), true, 'option 应使用 doc(id) 指定文档 ID');
  assert.equal(setCalls[1].id.startsWith('order_'), true, 'group_order 应使用 doc(id) 指定文档 ID');
  assert.equal('_id' in setCalls[0].data, false, 'option 写入 data 时不能携带 _id');
  assert.equal('_id' in setCalls[1].data, false, 'group_order 写入 data 时不能携带 _id');

  console.log('manageOptions cloudfunction checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
