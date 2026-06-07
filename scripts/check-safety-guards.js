const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function loadDateUtils() {
  const filename = path.join(__dirname, '..', 'miniprogram', 'utils', 'date.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
    Date,
    String,
    Number,
    Array,
    Object,
    Math,
    Set,
  };
  vm.runInNewContext(compiled, sandbox, { filename });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const dateUtils = loadDateUtils();

assert(dateUtils.isSupportedDiaryDate('2026-06-05'), '当前日期应在日记支持范围内');
assert(!dateUtils.isSupportedDiaryDate('1800-01-01'), '过早日期应被拦截');
assert(!dateUtils.isSupportedDiaryDate('3000-01-01'), '过晚日期应被拦截');
assert(dateUtils.isSupportedDiaryMonth('2026-06'), '当前月份应在日记支持范围内');
assert(!dateUtils.isSupportedDiaryMonth('1800-01'), '过早月份应被拦截');
assert(!dateUtils.isSupportedDiaryMonth('3000-01'), '过晚月份应被拦截');
assert(!dateUtils.canShiftDiaryMonth('1900-01-01', -1), '不应允许继续翻到 1900 年 1 月之前');
assert(!dateUtils.canShiftDiaryMonth('2049-12-01', 1), '不应允许继续翻到 2049 年 12 月之后');
assert(dateUtils.formatLunarDate('1800-01-01') === '', '农历越界日期应返回空字符串');

console.log('safety guard checks passed');
