const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_FILE_COUNT = 20;

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isDiaryCloudFileId(fileID) {
  return fileID.indexOf('cloud://') === 0 && fileID.indexOf('/diaries/') >= 0;
}

function normalizeFileList(fileList) {
  if (!Array.isArray(fileList)) return [];
  const normalized = [];
  const seen = new Set();
  fileList.forEach(item => {
    const fileID = trimText(item);
    if (!fileID || seen.has(fileID) || !isDiaryCloudFileId(fileID)) return;
    seen.add(fileID);
    normalized.push(fileID);
  });
  return normalized.slice(0, MAX_FILE_COUNT);
}

async function getTempFileUrls(fileList) {
  const normalized = normalizeFileList(fileList);
  if (normalized.length === 0) {
    return { ok: true, fileList: [] };
  }
  const res = await cloud.getTempFileURL({ fileList: normalized });
  return {
    ok: true,
    fileList: Array.isArray(res.fileList) ? res.fileList : [],
  };
}

exports.main = async (event = {}) => {
  const action = trimText(event.action);
  if (action === 'getTempFileUrls') {
    return getTempFileUrls(event.fileList);
  }
  fail('action', '未知的日记照片操作');
};
