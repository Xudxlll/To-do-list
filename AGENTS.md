# AGENTS.md

## 对话和协作

- 始终使用中文与用户对话，除非用户明确要求英文。
- 这个仓库是用户和女朋友使用的微信小程序，所有产品判断默认按“双人私密体验版”理解。
- 用户通常希望直接落地实现。除非请求明确是计划/解释/审查，否则发现可执行任务时应读代码、改代码、验证结果。
- 不要擅自删除、重置或回滚用户已有改动。当前仓库可能有未提交开发改动，先用 `git status --short` 看清楚。

## 项目概览

- 项目根目录：`/Users/xuji/Documents/WeChatProjects/miniprogram-1`
- 类型：微信小程序 TypeScript 项目
- 渲染：Skyline + glass-easel
- 小程序源码根目录：`miniprogram/`
- 当前主要功能：
  - `welcome`：照片欢迎页和主入口
  - `free-write`：随性过自由输入
  - `index`：今天干什么，分类选择、分享、选项排序、自定义标签
  - `result`：收到选择、Perfect 锁定、重置
  - `diary-home` / `diary-calendar` / `diary-edit`：我们的日记、月历、写日记

## 重要目录

- `miniprogram/pages/`：小程序页面，页面文件通常成组维护 `.ts`、`.wxml`、`.wxss`、`.json`。
- `miniprogram/components/navigation-bar/`：自定义导航栏组件。
- `miniprogram/data/categories.ts`：今天干什么的分类、选项、分享数据结构。
- `miniprogram/data/introPhotos.ts`：欢迎页照片墙数据。
- `miniprogram/services/`：云数据库和云存储服务。
- `miniprogram/utils/`：日期、草稿、标签识别、分类合并、排序等工具。
- `miniprogram/types/diary.ts`：日记相关类型。
- `cloudfunctions/manageOptions/`：今天干什么共享选项的新增、编辑、删除、排序云函数。
- `scripts/check-*.js`：本地回归检查脚本。
- `.codex/skills/release-summary-push/`：项目本地 release skill，不能移动到全局。

## 云开发

代码使用默认云环境：

```ts
wx.cloud.init({ traceUser: true })
```

需要在微信开发者工具云开发中创建三个集合：

- `diaries`
- `custom_options`
- `locked_plans`

`custom_options` 前端只直接读取，新增、编辑、删除、排序必须通过 `manageOptions` 云函数写入。这样集合可以设置为“所有用户可读，仅创建者可读写”，不依赖前端直写权限。

体验版首版只给两位体验成员使用。未来如果扩大使用范围，需要重新设计 OpenID、情侣空间 ID、白名单或云函数写入权限。`manageOptions` 支持用环境变量 `OPTION_ADMIN_OPENIDS=openid1,openid2` 收紧可管理共享选项的用户。

注意：

- `diaries` 不需要手动创建 `date` 唯一索引。
- 日记按确定性文档 ID `diary_YYYY_MM_DD` 保存。
- 如果用户遇到 `dup key: { : null }`，通常是错误的 `date` 唯一索引或脏数据，应删除该唯一索引，不要重建。
- 日记照片上传路径为 `diaries/<YYYY-MM-DD>/<timestamp>-<index>.<ext>`。
- 如果今天干什么的删除/排序报 `不能更新_id的值`，通常是 `manageOptions` 云函数未更新到剥离 `_id` 后写入 data 的版本，应重新上传并部署云函数。
- 清测试数据时，云端需要手动清 `diaries`、`locked_plans` 和存储里的 `diaries/` 图片；`custom_options` 是否清理由用户决定。

## 常用验证

没有 npm scripts。改动后按影响范围运行以下命令。

基础编译和空白检查：

```bash
npx --no-install tsc --noEmit
git diff --check
```

日记日期、月历、农历、边界：

```bash
node scripts/check-diary-date-utils.js
node scripts/check-safety-guards.js
```

标签识别和分类选项：

```bash
node scripts/check-diary-tags.js
node scripts/check-diary-tag-editing.js
node scripts/check-diary-option-sync.js
node scripts/check-category-options.js
```

今天干什么排序：

```bash
node scripts/check-option-catalog.js
node scripts/check-option-service.js
node scripts/check-option-management.js
node scripts/check-option-management-ui.js
node scripts/check-option-order.js
node scripts/check-manage-options-cloudfunction.js
node --check cloudfunctions/manageOptions/index.js
```

分享数据和 Perfect 锁定：

```bash
node scripts/check-share-data-validation.js
node scripts/check-locked-plan-service.js
```

发布或大改前建议全部运行：

```bash
npx --no-install tsc --noEmit
node scripts/check-diary-date-utils.js
node scripts/check-diary-tags.js
node scripts/check-diary-tag-editing.js
node scripts/check-diary-option-sync.js
node scripts/check-diary-clear-draft.js
node scripts/check-diary-moods.js
node scripts/check-category-options.js
node scripts/check-option-catalog.js
node scripts/check-option-service.js
node scripts/check-option-management.js
node scripts/check-option-management-ui.js
node scripts/check-option-order.js
node scripts/check-safety-guards.js
node scripts/check-share-data-validation.js
node scripts/check-locked-plan-service.js
node scripts/check-manage-options-cloudfunction.js
node --check cloudfunctions/manageOptions/index.js
git diff --check
```

## 实现约定

- 保持小程序页面文件局部修改，避免无关重构。
- 修改页面 UI 时同时检查 `.wxml` 和 `.wxss`，并注意 Skyline 对部分 CSS 能力支持有限。
- 结构化数据优先走已有工具：
  - 分类合并：`utils/categoryOptions.ts`
  - 标签识别：`utils/diaryTags.ts`
  - 日记日期：`utils/date.ts`
  - 草稿：`utils/diaryDraft.ts`
  - 选项排序：`utils/optionOrder.ts`
- 共享选项写入默认走 `services/customOptions.ts` 调用 `manageOptions` 云函数；只有测试显式传入 fake db 时才走直写路径。
- 日记保存失败时应保留草稿和已上传照片，避免重复上传。
- 自动标签识别只承诺规则命中，不要把它描述成完整 AI/NLP 理解。
- 地点字段归入 `今天去哪逛`，正文里不应重复识别同一地点。
- `Perfect` 锁定需要同时考虑本地 `lockedState` 和云端 `locked_plans`。
- 从分享入口进入后的返回链路要保持用户上下文：返回欢迎页时应保留 `partnerShareData`，让 `看看 TA 选了什么` 仍然显示。

## Git 和发布

- 默认远程：`origin https://github.com/Xudxlll/To-do-list.git`
- 发布流程优先使用项目本地 skill：
  - `.codex/skills/release-summary-push/SKILL.md`
- 发布版本时通常需要：
  - 更新 `CHANGELOG.md`
  - 更新 `package.json` 和 `package-lock.json`
  - 完整验证
  - 提交
  - 打 annotated tag，例如 `v2.0.0`
  - 推送分支和 tag
- 不要提交忽略文件或本地私有文件：
  - `.DS_Store`
  - `sourcemap.zip`
  - `node_modules/`
  - `project.private.config.json`

## 用户偏好

- 用户偏好中文、直接、证据充分的反馈。
- 简单环境/本地状态问题先检查再回答。
- 遇到报错先定位根因，再改代码。
- 对 UI 反馈通常很具体，按截图和描述精确微调，不要引入大范围设计变化。
- 对云开发问题要区分“代码能改的”和“必须在微信开发者工具/云控制台操作的”。
