---
name: release-summary-push
description: Project-local release workflow for /Users/xuji/Documents/WeChatProjects/miniprogram-1. Use when the user asks to summarize project changes, prepare a version release, update CHANGELOG/package version, verify the WeChat mini program, commit, tag, and push to GitHub. Triggers include “总结项目改动并推送 GitHub”, “发布 x.y.z”, “帮我做版本更新”, “打 tag 并推送”, and similar release handoff requests for this repository.
---

# Release Summary Push

## Scope

Use this skill only inside `/Users/xuji/Documents/WeChatProjects/miniprogram-1`.

The normal output is:

- A concise release summary in Chinese.
- `CHANGELOG.md` updated with the new version.
- `package.json` and `package-lock.json` version updated when a version is named.
- Fresh verification evidence.
- A git commit, optional version tag, and push to GitHub.

Do not create or modify global skills. Do not push unverified code.

## Workflow

1. Inspect repository state:
   - `git status --short --branch`
   - `git branch --show-current`
   - `git remote -v`
   - `git diff --stat`
   - `git log --oneline --decorate -5`

2. Determine the release version:
   - If the user names a version, use it exactly, for example `2.0.0`.
   - If no version is named, ask once before editing version files.
   - Use tag format `v<version>`, for example `v2.0.0`.

3. Summarize changes from actual files, not memory alone:
   - Read `CHANGELOG.md`.
   - Inspect `git diff --stat`.
   - Skim changed app files enough to group user-facing changes.
   - For this project, likely release sections are:
     - 首页和分享流程
     - 今天干什么分类、选项、排序
     - 我们的日记、月历、写日记
     - 云开发集合和跨设备同步
     - 自动标签识别
     - 稳定性和上传前检查

4. Update release files:
   - Add a new top section to `CHANGELOG.md`:
     - `## v<version> - YYYY-MM-DD`
     - Write in Chinese.
     - Prefer feature-oriented bullets over file lists.
   - Update `package.json` version.
   - Update both root version entries in `package-lock.json`.

5. Verify before committing:
   - Always run:
     - `npx --no-install tsc --noEmit`
     - `git diff --check`
   - If the scripts exist, run all applicable local checks:
     - `node scripts/check-diary-date-utils.js`
     - `node scripts/check-diary-tags.js`
     - `node scripts/check-category-options.js`
     - `node scripts/check-option-order.js`
     - `node scripts/check-safety-guards.js`
     - `node scripts/check-share-data-validation.js`
     - `node scripts/check-locked-plan-service.js`
   - Read command output and only claim success after exit code 0.
   - npm update notices do not count as failures.

6. Commit:
   - Stage intentionally with `git add .` only after checking `git status --short`.
   - Re-check staged content with:
     - `git diff --cached --stat`
     - `git status --short`
   - Use a release commit message:
     - `feat: release version <version>`

7. Tag:
   - Create an annotated tag:
     - `git tag -a v<version> -m "Version <version>"`
   - If the tag already exists, stop and report it instead of force-moving it unless the user explicitly asks.

8. Push:
   - Push the current branch:
     - `git push -u origin <branch>`
   - Push the tag:
     - `git push origin v<version>`
   - If push fails due authentication or remote rejection, report the exact error and do not pretend it succeeded.

9. Final response:
   - Mention the version, branch, commit hash, tag, and GitHub PR URL if GitHub prints one.
   - Summarize major changes in 5-8 bullets.
   - List verification commands that passed.
   - Emit git directives only for actions that actually succeeded:
     - `::git-stage{cwd="/Users/xuji/Documents/WeChatProjects/miniprogram-1"}`
     - `::git-commit{cwd="/Users/xuji/Documents/WeChatProjects/miniprogram-1"}`
     - `::git-push{cwd="/Users/xuji/Documents/WeChatProjects/miniprogram-1" branch="<branch>"}`

## Safety Rules

- Never revert unrelated user changes.
- Never use `git reset --hard` or destructive cleanup for release preparation.
- Do not delete cloud data as part of a GitHub release unless the user separately asks and the cloud environment is explicitly available.
- Do not commit ignored local files such as `.DS_Store`, `sourcemap.zip`, `node_modules/`, or `project.private.config.json`.
- If `git status` shows unexpected unrelated changes, mention them and only include them when they belong to the requested release.

## Project Notes

- The remote is normally `origin https://github.com/Xudxlll/To-do-list.git`.
- The current release work may happen on feature branches such as `codex/couple-diary`.
- This project uses WeChat Mini Program TypeScript with Skyline, so `npx --no-install tsc --noEmit` is the minimum compile check.
- `docs/cloud-diary-setup.md` should stay aligned with any cloud collection changes.
