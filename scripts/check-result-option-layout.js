const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const wxmlSource = readFile('miniprogram/pages/result/result.wxml');
const wxssSource = readFile('miniprogram/pages/result/result.wxss');

function cssBlock(selector) {
  const start = wxssSource.indexOf(`${selector} {`);
  assert(start >= 0, `result.wxss 应包含 ${selector}`);
  const end = wxssSource.indexOf('\n}', start);
  assert(end >= 0, `${selector} 样式块应完整闭合`);
  return wxssSource.slice(start, end);
}

assert(wxmlSource.includes('class="pcat-options"'), '结果页应保留选项容器');
assert(wxmlSource.includes('class="pcat-option {{item.isCustom ? \'is-custom\' : \'\'}}"'), '结果页应逐项渲染选项 chip');

const optionsBlock = cssBlock('.pcat-options');
assert(optionsBlock.includes('display: flex'), '结果页选项容器应使用 flex 排列');
assert(optionsBlock.includes('flex-wrap: wrap'), '结果页选项容器应允许换行');
assert(optionsBlock.includes('align-items: flex-start'), '结果页选项容器应按顶部对齐，避免高低 chip 重叠');
assert(optionsBlock.includes('position: relative'), '结果页选项容器应建立稳定层级上下文');
assert(optionsBlock.includes('z-index: 1'), '结果页选项容器应明确层级');

const optionBlock = cssBlock('.pcat-option');
assert(optionBlock.includes('max-width: 100%'), '结果页单个选项不应超出容器宽度');
assert(optionBlock.includes('box-sizing: border-box'), '结果页选项宽度应包含内边距和边框');
assert(optionBlock.includes('line-height:'), '结果页选项应有明确行高');
assert(optionBlock.includes('white-space: normal'), '结果页长选项名称应完整换行显示');
assert(optionBlock.includes('word-break: break-word'), '结果页长选项名称应可断行');
assert(optionBlock.includes('position: relative'), '结果页选项 chip 应建立稳定层级');
assert(optionBlock.includes('z-index: 1'), '结果页选项 chip 应避免落到后方图层');

console.log('result option layout checks passed');
