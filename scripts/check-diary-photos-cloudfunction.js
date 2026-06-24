const assert = require('assert').strict;
const Module = require('module');
const path = require('path');

let requestedFileList = [];

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: Symbol('DYNAMIC_CURRENT_ENV'),
  init() {},
  async getTempFileURL({ fileList }) {
    requestedFileList = fileList.slice();
    return {
      fileList: fileList.map(fileID => ({
        fileID,
        tempFileURL: `https://temp.example.com/${encodeURIComponent(fileID)}`,
        status: 0,
        errMsg: 'ok',
      })),
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
  const functionPath = path.join(__dirname, '..', 'cloudfunctions/diaryPhotos/index.js');
  delete require.cache[require.resolve(functionPath)];
  const diaryPhotos = require(functionPath);

  const res = await diaryPhotos.main({
    action: 'getTempFileUrls',
    fileList: [
      'cloud://love-env.xxxx/diaries/2026-06-23/one.jpg',
      'https://already.example.com/two.jpg',
      '',
      'cloud://love-env.xxxx/other/secret.jpg',
      'cloud://love-env.xxxx/diaries/2026-06-23/three.png',
    ],
  });

  assert.equal(res.ok, true, 'diaryPhotos 应返回 ok');
  assert.deepEqual(requestedFileList, [
    'cloud://love-env.xxxx/diaries/2026-06-23/one.jpg',
    'cloud://love-env.xxxx/diaries/2026-06-23/three.png',
  ], 'diaryPhotos 只应处理 diaries/ 路径下的 cloud:// 文件');
  assert.equal(res.fileList.length, 2, 'diaryPhotos 只应返回合法日记照片结果');
  assert.equal(res.fileList[0].tempFileURL, 'https://temp.example.com/cloud%3A%2F%2Flove-env.xxxx%2Fdiaries%2F2026-06-23%2Fone.jpg');

  await assert.rejects(
    () => diaryPhotos.main({ action: 'unknown', fileList: [] }),
    /未知的日记照片操作/,
    '未知 action 应失败'
  );
}

main().then(() => {
  console.log('diaryPhotos cloudfunction checks passed');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
