const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const tsSource = readFile('miniprogram/pages/diary-edit/diary-edit.ts');
const wxmlSource = readFile('miniprogram/pages/diary-edit/diary-edit.wxml');

assert(tsSource.includes('const MAX_DIARY_PHOTOS = 9;'), '日记照片上限应集中定义为 9');
assert(tsSource.includes('MAX_DIARY_PHOTOS - currentCount'), '选择照片数量应按 9 张上限扣减');
assert(tsSource.includes("title: '最多 9 张照片'"), '超过上限时应提示最多 9 张照片');
assert(tsSource.includes('slice(0, MAX_DIARY_PHOTOS)'), '保存已上传照片时应保留最多 9 张');
assert(!tsSource.includes('const count = 3 - currentCount'), '不应继续使用 3 张照片上限');
assert(!tsSource.includes("title: '最多 3 张照片'"), '不应继续提示最多 3 张照片');
assert(wxmlSource.includes('照片（最多 9 张）'), '页面标题应显示最多 9 张');
assert(wxmlSource.includes('existingPhotoFileIds.length + localPhotoPaths.length < MAX_DIARY_PHOTOS'), '添加入口应按 9 张上限控制');
assert(!wxmlSource.includes('照片（最多 3 张）'), '页面不应再显示最多 3 张');
assert(!wxmlSource.includes('existingPhotoFileIds.length + localPhotoPaths.length < 3'), '添加入口不应继续按 3 张控制');

console.log('diary photo limit checks passed');
