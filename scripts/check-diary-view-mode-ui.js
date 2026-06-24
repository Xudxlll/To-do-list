const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const tsSource = readFile('miniprogram/pages/diary-edit/diary-edit.ts');
const wxmlSource = readFile('miniprogram/pages/diary-edit/diary-edit.wxml');
const wxssSource = readFile('miniprogram/pages/diary-edit/diary-edit.wxss');

assert(tsSource.includes('isEditing: true'), '新建/默认状态应支持编辑态');
assert(tsSource.includes('isEditing: false'), '已有日记加载后应进入查看态');
assert(tsSource.includes('startEditing()'), '应实现修改日记入口');
assert(wxmlSource.includes('wx:if="{{!isEditing}}"'), 'WXML 应包含查看态分支');
assert(wxmlSource.includes('wx:else'), 'WXML 应包含编辑态分支');
assert(wxmlSource.includes('class="view-content"'), '查看态应用 view 展示正文而不是 textarea');
assert(wxmlSource.includes('class="view-location"'), '查看态应展示地点');
assert(wxmlSource.includes('class="view-photo-grid"'), '查看态应展示照片且不带删除按钮');
assert(wxmlSource.includes('class="view-tag-row"'), '查看态应展示已保存标签');
assert(wxmlSource.includes('bind:tap="startEditing"'), '查看态底部应提供修改日记按钮');
assert(wxmlSource.includes('修改日记'), '查看态按钮文案应为修改日记');
assert(wxmlSource.includes('<view wx:else class="edit-form">'), '编辑表单应只在编辑态展示');
assert(wxmlSource.includes('<view class="save-row">'), '编辑态应保留清空草稿和保存日记按钮');
assert(wxmlSource.indexOf('bind:tap="startEditing"') < wxmlSource.indexOf('<view wx:else class="edit-form">'), '修改日记按钮应出现在编辑表单之前的查看态');

[
  '.view-mode',
  '.view-content',
  '.view-location',
  '.view-photo-grid',
  '.view-tag-row',
  '.edit-diary-btn',
].forEach(selector => {
  assert(wxssSource.includes(selector), `diary-edit.wxss 应包含 ${selector}`);
});

console.log('diary view mode ui checks passed');
