const assert = require('assert').strict;
const Module = require('module');
const path = require('path');

const setCalls = [];
const getCalls = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeDoc(id) {
  return {
    async get() {
      getCalls.push(id);
      return { data: { _id: id, createdAt: 123 } };
    },
    async set(payload) {
      setCalls.push({ id, data: clone(payload.data) });
      return {};
    },
  };
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: Symbol('DYNAMIC_CURRENT_ENV'),
  init() {},
  database() {
    return {
      collection(name) {
        assert.equal(name, 'diaries', 'manageDiaries 只能写 diaries 集合');
        return {
          doc: makeDoc,
        };
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
  const functionPath = path.join(__dirname, '..', 'cloudfunctions/manageDiaries/index.js');
  delete require.cache[require.resolve(functionPath)];
  const manageDiaries = require(functionPath);

  const result = await manageDiaries.main({
    action: 'saveDiary',
    payload: {
      record: {
        _id: 'should_be_ignored',
        date: '2026-06-23',
        content: '云函数保存后的正文',
        mood: 'happy',
        moods: ['happy'],
        location: '家里',
        photoFileIds: ['cloud://env.diaries/2026-06-23/a.jpg'],
        tags: [{ categoryId: 'eat', optionId: 'hotpot', name: '火锅', isCustom: false }],
        createdAt: 1,
        updatedAt: 2,
      },
    },
  });

  assert.equal(getCalls[0], 'diary_2026_06_23', '云函数应按日期读取固定日记文档');
  assert.equal(setCalls.length, 1, '云函数应写入一次日记文档');
  assert.equal(setCalls[0].id, 'diary_2026_06_23', '云函数应按确定性文档 ID 保存');
  assert.equal('_id' in setCalls[0].data, false, '写入 data 时不能携带 _id');
  assert.equal(setCalls[0].data.content, '云函数保存后的正文', '云函数必须保存修改后的正文');
  assert.equal(setCalls[0].data.createdAt, 123, '已有日记应保留原 createdAt');
  assert.equal(result.ok, true, '保存成功应返回 ok');
  assert.equal(result.record._id, 'diary_2026_06_23', '返回记录应带固定文档 ID');

  console.log('manageDiaries cloudfunction checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
