const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const tsSource = readFile('miniprogram/pages/diary-edit/diary-edit.ts');
const wxmlSource = readFile('miniprogram/pages/diary-edit/diary-edit.wxml');
const wxssSource = readFile('miniprogram/pages/diary-edit/diary-edit.wxss');

function cssBlock(selector) {
  const start = wxssSource.indexOf(`${selector} {`);
  assert(start >= 0, `diary-edit.wxss 应包含 ${selector}`);
  const end = wxssSource.indexOf('\n}', start);
  assert(end >= 0, `${selector} 样式块应完整闭合`);
  return wxssSource.slice(start, end);
}

assert(tsSource.includes('appendManualDiaryTag'), 'diary-edit.ts 应使用 appendManualDiaryTag');
assert(tsSource.includes('searchDiaryTagOptions'), 'diary-edit.ts 应使用 searchDiaryTagOptions');
assert(tsSource.includes('appendExistingDiaryTag'), 'diary-edit.ts 应使用 appendExistingDiaryTag');
assert(tsSource.includes('addManualTag()'), 'diary-edit.ts 应实现 addManualTag');
assert(tsSource.includes('if (this.data.saving) return;'), '标签操作应在保存中阻止重复触发');
assert(tsSource.includes('onTagSearchInput'), 'diary-edit.ts 应实现标签搜索输入');
assert(tsSource.includes('addExistingTagFromSearch'), 'diary-edit.ts 应实现从搜索结果加入已有标签');
assert(tsSource.includes('tagSearchResultsHeight'), '标签搜索结果应按数量计算滚动区域高度');
assert(tsSource.includes('MAX_TAG_SEARCH_RESULTS_HEIGHT'), '标签搜索结果应限制最大高度');
assert(wxmlSource.includes('class="tag-header-actions"'), '重新识别和手动添加标签应合并到右上角');
assert(wxmlSource.includes('bind:tap="addManualTag"'), '标签面板应提供手动添加标签按钮');
assert(wxmlSource.includes('＋ 手动添加标签'), '手动添加按钮应使用明确文案');
assert(!wxmlSource.includes('<button class="retag-btn'), '重新识别不应再使用原生 button，避免默认样式拉宽');
assert(!wxmlSource.includes('<button class="add-tag-btn'), '手动添加不应再使用原生 button，避免占满整行');
assert(!wxmlSource.includes('class="tag-toolbar"'), '标签面板不应再使用单独工具栏占用空间');
assert(wxmlSource.includes('class="tag-panel-body"'), '搜索结果和标签列表应放入同一正常内容流');
assert(!wxmlSource.includes('class="tag-panel-body" scroll-y'), '标签面板不应默认固定成滚动高面板');
assert(wxmlSource.includes('class="tag-search-icon"'), '搜索栏最左侧应显示搜索图标');
assert(wxmlSource.includes('placeholder="搜索已有标签"'), '搜索栏占位文案应为搜索已有标签');
assert(wxmlSource.includes('class="tag-search-input"'), '标签面板应提供搜索已有标签输入框');
assert(wxmlSource.includes('bindinput="onTagSearchInput"'), '搜索输入框应绑定 onTagSearchInput');
assert(wxmlSource.includes('bind:tap="addExistingTagFromSearch"'), '搜索结果应可点击加入标签');
assert(/<scroll-view[\s\S]*class="tag-search-results"[\s\S]*scroll-y/.test(wxmlSource), '标签搜索结果应使用 scroll-view 内部滚动');
assert(/style="height:\s*\{\{tagSearchResultsHeight\}\}rpx"/.test(wxmlSource), '标签搜索结果滚动区高度应由结果数量控制');
assert(wxmlSource.includes('class="tag-edit-row"'), '每个标签应使用紧凑横向行');
assert(wxmlSource.includes('class="tag-category-picker"'), '主分类应在标签行内单独占一列');
assert(wxmlSource.includes('class="tag-group-picker'), '子分类应在标签行内单独占一列');
assert(wxmlSource.includes('class="tag-picker tag-picker-primary"'), '主分类应使用更突出的样式');
assert(wxmlSource.includes('class="tag-picker tag-picker-secondary'), '子分类应使用较轻的样式');
assert(wxmlSource.includes('class="tag-name-input"'), '标签输入框应紧挨分类区域显示');
assert(wxmlSource.includes('class="tag-remove"'), '删除入口应保留在最右侧');
assert(!wxmlSource.includes('class="tag-editor-card"'), '标签面板不应再使用臃肿卡片容器');
assert(!wxmlSource.includes('class="tag-field-label">主分类</view>'), '紧凑布局不应额外显示字段标题');

[
  '.tag-panel-body',
  '.tag-header-actions',
  '.add-tag-btn',
  '.tag-search-bar',
  '.tag-search-icon',
  '.tag-search-input',
  '.tag-search-result',
  '.tag-edit-row',
  '.tag-category-picker',
  '.tag-group-picker',
  '.tag-picker-primary',
  '.tag-picker-secondary',
  '.tag-name-input',
].forEach(selector => {
  assert(wxssSource.includes(selector), `diary-edit.wxss 应包含 ${selector}`);
});

const tagTitleBlock = cssBlock('.tag-title');
assert(tagTitleBlock.includes('flex-shrink: 0'), '确认日记标签标题不应被右侧按钮挤窄');
assert(tagTitleBlock.includes('white-space: nowrap'), '确认日记标签标题应保持横向不换行');

const tagHeaderActionsBlock = cssBlock('.tag-header-actions');
assert(tagHeaderActionsBlock.includes('flex: 1'), '右上角按钮区应使用剩余空间');
assert(tagHeaderActionsBlock.includes('justify-content: flex-end'), '右上角按钮应靠右排列');
assert(tagHeaderActionsBlock.includes('min-width: 0'), '右上角按钮区应允许压缩而不挤压标题');

const tagPanelBlock = cssBlock('.tag-panel');
assert(!/^\s*height:\s*75vh/m.test(tagPanelBlock), '确认标签面板不应默认固定到 75vh');
assert(tagPanelBlock.includes('max-height: 75vh'), '确认标签面板应只在内容很多时限制最大高度');

assert(!cssBlock('.retag-btn').includes('width:'), '重新识别按钮宽度应贴合自身文字');
assert(cssBlock('.retag-btn').includes('display: inline-flex'), '重新识别按钮应使用内容自适应的行内布局');
assert(wxssSource.includes('.add-tag-btn {\n  width: 236rpx'), '手动添加标签按钮应是紧凑固定宽度');
assert(cssBlock('.tag-search-results').includes('z-index: 2'), '搜索结果应高于后续标签行，避免显示在后层');
assert(cssBlock('.tag-search-results').includes('overflow: hidden'), '搜索结果滚动容器应裁剪超出内容');
assert(cssBlock('.tag-edit-row').includes('z-index: 1'), '标签编辑行层级应低于搜索结果');

console.log('diary tag panel ui checks passed');
