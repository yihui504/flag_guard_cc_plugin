---
description: 公众号推送生产流水线：照片/文案 → 秀米母版填充 → 预览 + 自检报告
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, Skill
---

# /push — 推送生产流水线

按序执行以下流程。每个「人工门」必须停下等用户确认，不许跳过。

## 第 1 步 · 收集信息（问一次）

向用户确认：推送类型（升旗任务/训练总结/大会/招新/换届入队/节日）、活动信息（时间/地点/执行中队/流程/出席）、照片目录或图床链接。

## 第 2 步 · 文案创作

调用 **bjtu-flag-guard-push** skill 按类型写稿：先按必备信息槽问清缺失项（缺信息不许编造），出稿后派三路审查（合规 / AI 腔 / 事实核查），独立复算收敛后交稿。

**人工门 A**：用户确认文案定稿。

## 第 3 步 · content-spec 组装

按 `skills/wechat-typeset/masters/<类型>__*.slot-spec.json` 的槽位清单，把定稿文案映射成 content-spec（逐槽填写，`fixed: true` 的槽跳过）。落盘为 `push-<日期>.spec.json`。

## 第 4 步 · 排版填充

```bash
cd <插件根>/skills/wechat-typeset/scripts
node fill.mjs <spec>        # 失败/未命中必须处理后再试
node check.mjs <spec> --show <作品ID> --out report.md
```

**人工门 B**：把预览链接 + 自检报告交给用户。High 项必须修（改 spec 重跑 fill/check）；Medium 项由用户决定。

## 第 5 步 · 人工收尾提示

告知用户：
1. 秀米 `studio/v5#/wxpack` 页 → 顶栏「同步到公众号」→ 开始同步
2. 公众号后台补封面（2.35:1 + 1:1 两种裁切）
3. 发布前按手册审核清单最后过一遍

## 注意

- 母版只读，一切写入发生在 steal 副本上
- 凭证（session.json / cookie）不入库不外传
- 定稿快照在 `skills/wechat-typeset/archive/`，作为排版语料持续积累
