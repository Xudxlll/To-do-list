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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const callFunctionCalls = [];
global.wx = {
  cloud: {
    init() {},
    database() {
      throw new Error('保存日记成功走云函数时不应由小程序端直连数据库');
    },
    async callFunction(payload) {
      callFunctionCalls.push(clone(payload));
      return {
        result: {
          ok: true,
          record: {
            ...payload.data.payload.record,
            _id: 'diary_2026_06_23',
            updatedAt: 999,
          },
        },
      };
    },
  },
};

async function main() {
  const servicePath = path.join(__dirname, '..', 'miniprogram/services/diaries.ts');
  delete require.cache[require.resolve(servicePath)];
  const { saveDiary } = require(servicePath);

  const result = await saveDiary({
    date: '2026-06-23',
    content: '修改后的正文',
    mood: 'happy',
    moods: ['happy'],
    location: '家里',
    photoFileIds: ['cloud://env.diaries/2026-06-23/a.jpg'],
    tags: [{ categoryId: 'eat', optionId: 'hotpot', name: '火锅', isCustom: false }],
    createdAt: 1,
    updatedAt: 2,
  });

  assert.equal(callFunctionCalls.length, 1, '保存日记应优先调用 manageDiaries 云函数');
  assert.equal(callFunctionCalls[0].name, 'manageDiaries', '保存日记应调用 manageDiaries 云函数');
  assert.equal(callFunctionCalls[0].data.action, 'saveDiary', '保存日记应使用 saveDiary 动作');
  assert.equal(callFunctionCalls[0].data.payload.record.content, '修改后的正文', '修改后的正文必须传给云函数');
  assert.equal(result.content, '修改后的正文', '云函数保存成功后应返回最新日记');
  assert.equal(result._id, 'diary_2026_06_23', '返回结果应包含日记文档 ID');

  console.log('diary save cloudfunction checks passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
