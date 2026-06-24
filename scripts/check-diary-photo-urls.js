const fs = require('fs');
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

const requestedFileIds = [];
const calledFunctions = [];
let directGetTempFileUrlCalled = false;

global.wx = {
  cloud: {
    async callFunction(payload) {
      calledFunctions.push(payload);
      return {
        result: {
          ok: true,
          fileList: payload.data.fileList.map(fileID => ({
            fileID,
            tempFileURL: `https://function.example.com/${encodeURIComponent(fileID)}`,
          })),
        },
      };
    },
    async getTempFileURL({ fileList }) {
      directGetTempFileUrlCalled = true;
      requestedFileIds.push(...fileList);
      return {
        fileList: fileList.map(fileID => ({
          fileID,
          tempFileURL: `https://tmp.example.com/${encodeURIComponent(fileID)}`,
        })),
      };
    },
  },
};

const { resolveDiaryPhotoUrls } = require('../miniprogram/services/diaries.ts');

async function main() {
  const fileIds = [
    'cloud://love-env.xxxx/diaries/2026-06-23/one.jpg',
    'https://already.example.com/two.jpg',
    '',
    'cloud://love-env.xxxx/diaries/2026-06-23/three.png',
  ];

  const urls = await resolveDiaryPhotoUrls(fileIds);

  assert.deepEqual(calledFunctions, [{
    name: 'diaryPhotos',
    data: {
      action: 'getTempFileUrls',
      fileList: [
        'cloud://love-env.xxxx/diaries/2026-06-23/one.jpg',
        'cloud://love-env.xxxx/diaries/2026-06-23/three.png',
      ],
    },
  }], '应优先通过 diaryPhotos 云函数换取跨用户可读的临时链接');
  assert.equal(directGetTempFileUrlCalled, false, '云函数成功时不应再走客户端 getTempFileURL');
  assert.deepEqual(requestedFileIds, [], '云函数成功时不应直接请求客户端临时链接');
  assert.equal(urls[0], 'https://function.example.com/cloud%3A%2F%2Flove-env.xxxx%2Fdiaries%2F2026-06-23%2Fone.jpg');
  assert.equal(urls[1], 'https://already.example.com/two.jpg', '非 cloud:// 链接应原样保留');
  assert.equal(urls[2], '', '空照片位应原样保留');
  assert.equal(urls[3], 'https://function.example.com/cloud%3A%2F%2Flove-env.xxxx%2Fdiaries%2F2026-06-23%2Fthree.png');

  global.wx.cloud.callFunction = async () => {
    throw new Error('cloud function not deployed');
  };

  const fallbackUrls = await resolveDiaryPhotoUrls(fileIds);

  assert.deepEqual(requestedFileIds, [
    'cloud://love-env.xxxx/diaries/2026-06-23/one.jpg',
    'cloud://love-env.xxxx/diaries/2026-06-23/three.png',
  ], '云函数不可用时才回退到客户端 getTempFileURL');
  assert.equal(fallbackUrls[0], 'https://tmp.example.com/cloud%3A%2F%2Flove-env.xxxx%2Fdiaries%2F2026-06-23%2Fone.jpg');
  assert.equal(fallbackUrls[1], 'https://already.example.com/two.jpg');
  assert.equal(fallbackUrls[2], '');
  assert.equal(fallbackUrls[3], 'https://tmp.example.com/cloud%3A%2F%2Flove-env.xxxx%2Fdiaries%2F2026-06-23%2Fthree.png');
}

main().then(() => {
  console.log('diary photo url checks passed');
});
