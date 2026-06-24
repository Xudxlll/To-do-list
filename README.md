# To-do-list

双人私密体验版微信小程序，用来和另一半一起决定“今天干什么”，也记录共同日记。

## 主要功能

- 照片欢迎页和分享入口。
- “今天干什么”分类选择，支持搜索、子分类折叠、共享选项增删改、补充说明和拖拽排序。
- `manageOptions` 云函数负责写入共享选项，`manageDiaries` 云函数负责跨用户保存日记，`diaryPhotos` 云函数负责生成跨用户可读的日记照片临时链接。
- 基础跨设备同步：进入页面、回到前台、停留每 15 秒刷新一次活动目录。
- `Perfect` 锁定今日计划，并通过云端同步到另一台设备。
- “我们的日记”支持月历、补写过去日期、正文、地点、照片、可空心情和本地草稿。
- 写日记时根据正文和地点规则识别活动标签，复用或创建“今天干什么”的共享选项。

## 项目结构

- `miniprogram/`：小程序源码。
- `cloudfunctions/manageOptions/`：共享选项管理云函数。
- `cloudfunctions/manageDiaries/`：日记保存云函数。
- `cloudfunctions/diaryPhotos/`：日记照片临时链接云函数。
- `docs/cloud-diary-setup.md`：云开发集合、权限、云函数部署和验收说明。
- `scripts/check-*.js`：本地回归检查脚本。
- `CHANGELOG.md`：版本更新说明。

## 云开发

需要创建三个集合：

- `diaries`
- `custom_options`
- `locked_plans`

还需要上传部署云函数：

- `manageOptions`
- `manageDiaries`
- `diaryPhotos`

详细步骤见 `docs/cloud-diary-setup.md`。部署云函数时在微信开发者工具中分别右键 `cloudfunctions/manageOptions`、`cloudfunctions/manageDiaries` 和 `cloudfunctions/diaryPhotos`，选择“上传并部署：云端安装依赖”。

## 本地验证

没有 npm scripts，常用检查命令如下：

```bash
npx --no-install tsc --noEmit
node scripts/check-diary-date-utils.js
node scripts/check-diary-tags.js
node scripts/check-diary-tag-editing.js
node scripts/check-diary-option-sync.js
node scripts/check-diary-save-cloudfunction.js
node scripts/check-diary-photo-urls.js
node scripts/check-diary-photos-cloudfunction.js
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
node scripts/check-manage-diaries-cloudfunction.js
node --check cloudfunctions/diaryPhotos/index.js
node --check cloudfunctions/manageDiaries/index.js
node --check cloudfunctions/manageOptions/index.js
git diff --check
```
