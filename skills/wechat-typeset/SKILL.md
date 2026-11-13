---
name: wechat-typeset
description: Use when 需要把定稿文案与照片自动填入秀米母版、生成预览链接与自检报告时——写完推送文案后要排版、要出预览给部长确认、要把成稿推进到"待同步"状态；也用于为新类型推送策展母版槽位规格。触发词：排版、填母版、生成预览、秀米填充、自检报告。
---

# wechat-typeset · 秀米母版自动填充

把定稿文案 + 图片自动填入本队秀米母版，产出：可编辑的秀米作品 + 手机预览链接 + 自检报告（High 硬伤 / Medium 观感）。**流水线到此为止**——「同步到公众号」由人在秀米 wxpack 页手动点击（约 2 分钟）。

## 前置条件

1. **秀米登录态**：连接器仓库（`FG_XIUMI_CONNECTOR` 环境变量，默认指向本机克隆位置）的 `session.json` 里要有有效 Cookie。失效时：浏览器登录 xiumi.us → F12 复制 Cookie → `node xiumi.mjs login --file cookie.txt`
2. **已绑定公众号的验证**：编辑器顶栏 wxpack 页能看到「同步到公众号」面板即正常

## 使用流程

### 第 1 步 · 写 content-spec

```json
{
  "master": "meeting",
  "title": "26预备队新队员见面大会｜怀赤诚相聚 担护旗荣光",
  "slots": {
    "headline": "26预备队新队员见面大会",
    "kicker": "怀赤诚相聚 担护旗荣光",
    "lede": "10月14日晚，北京交通大学国旗仪仗队举行……（80–150字，时间地点人物事件）",
    "agenda1_body": "大会第一项，出旗。……",
    "agenda2_title": "队长陈焕捷寄语",
    "agenda2_body": "……（间接引语挂可核实锚点）",
    "agenda4_body": "……（训练安排紧凑一行式）",
    "agenda5_body": "……"
  },
  "signature": { "文案": "姓名", "排版": "姓名", "审核": "部长/队长", "图片": "来源" },
  "images": { "1": "https://img.xiumi.us/…", "3": "https://img.xiumi.us/…" }
}
```

- 槽位 key 一览：读 `masters/<类型>__<ID>.slot-spec.json`（`fixed: true` 的槽为固定文本，不填）
- 值为纯文本，`\n` 会转 `<br>`；**不许出现想象内容**——文案层须先过 `bjtu-flag-guard-push` skill
- `images` 的索引对应母版原图序号（见 slot-spec 的 `images` 数组），值必须已是秀米图床 URL（先在秀米网页上传）

### 第 2 步 · 填充

```bash
node fill.mjs <content-spec.json>          # 正式
node fill.mjs <content-spec.json> --dry    # 演练（steal 之外的步骤全走，不写入）
```

产出：新作品 ID + 预览链接 + 本地快照（archive/）。
**任何「未命中」都要处理**——`expect`/唯一性校验失败说明母版文本变了，禁止带病写入。

### 第 3 步 · 自检

```bash
node check.mjs <content-spec.json> --show <作品ID> --out report.md
```

报告分两档：**High = 硬伤**（漏填/落款缺失/标题超长/测试残留/图数异常），**Medium = 观感**（连续图片堆叠/超长段落/空段）。交给人工过目决定修哪些——**Agent 不擅自改 Medium**。

### 第 4 步 · 人工收尾

部长过预览 → 秀米 `studio/v5#/wxpack` 页 → 顶栏「同步到公众号」→ 开始同步 → 公众号后台补封面 → 排期发布。

## 母版一览

| 类型 key | 母版 ID | 槽规格 | 状态 |
|----------|---------|--------|------|
| meeting（大会） | 732716929 | meeting__732716929.slot-spec.json | ✅ 已验证 |
| training（训练总结） | 737618688 | 待策展（slots.json 已提取） | ⏳ |
| recruit（招新） | 726614840 | 待策展 | ⏳ |
| flagraise（升旗任务） | 723821635 | 待策展 | ⏳ |
| ceremony（换届入队） | 693867399 | 待策展 | ⏳ |

母版**只读**——每篇生产 steal 出副本操作，出问题用 `snap/restore` 而非 Ctrl+Z（撤销会回滚别人的编辑历史）。

## 为新类型策展槽规格

1. `node _tools/muban-dump.mjs <母版ID> <类型>`（或复用 masters/ 已有 .slots.json）
2. 在 `scripts` 的 slot-spec-gen.mjs `KEY_MAPS` 里加该类型的 key→匹配规则（exact=全等 / prefix=前缀）
3. `node slot-spec-gen.mjs <slots.json> <类型>` 生成草稿
4. 逐槽 review（`primary` 是否覆盖要改写的区域、`fixed` 标记是否正确），落入 masters/

## 安全协议（必须遵守）

- 母版只读；只在 steal 副本上写入
- PUT 前必须修 `authorAppendix`（steal 副本带市场作者署名会被服务端拒绝）
- `lastSavedAt` 必须取自目标作品本身的最新 `saved_at`
- 不用 `rebuildRaHtml`（其产物被服务端拒绝）
- Cookie/session.json 等同密码：不进 git、不进日志
