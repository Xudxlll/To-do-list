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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

const dateUtils = loadDateUtils();

assertEqual(
  dateUtils.formatDiaryDateLabel('2026-06-19'),
  '2026-06-19 农历五月初五 端午节',
  '端午节日期标题应包含农历和节日'
);

assertEqual(
  dateUtils.formatDiaryDateLabel('2026-06-04'),
  '2026-06-04 农历四月十九',
  '普通日期标题应包含农历'
);

assertEqual(
  dateUtils.formatMonthTitle('2026-06-01'),
  '2026年6月',
  '月历标题应使用中文年月'
);

const juneDays = dateUtils.buildCalendarDays('2026-06-01', ['2026-06-04']);
assertEqual(juneDays[0].date, '2026-06-01', '周一开头的 2026 年 6 月第一格应为 6 月 1 日');
assertEqual(juneDays[3].date, '2026-06-04', '2026 年 6 月 4 日应落在第一周周四');
assertEqual(juneDays[3].hasDiary, true, '有日记的日期应被标记');

console.log('diary date utils checks passed');
