# flag-guard-cc-plugin

北交大国旗仪仗队公众号推送生产插件（Claude Code）。

```
照片 ──► 筛选(人工终选) ──► 文案创作+三路审查 ──► 文案定稿(人工)
   ──► content-spec ──► 秀米母版自动填充 ──► 预览+自检报告(人工过目)
   ──► 同步到公众号(人工) ──► 封面+发布(人工)
```

**Agent 负责**：筛图建议、文案（合规/反AI腔/事实核查三路审查）、母版填充、预览自检报告、归档。
**人工负责**：照片终选、文案定稿、观感确认、同步/封面/发布——全是"看一眼就能判"的低成本决策。

## 安装

```bash
# 1. 克隆本仓库
git clone https://github.com/yihui504/flag_guard_cc_plugin.git

# 2. 添加为开发市场并安装
#    Claude Code 内执行：
/plugin marketplace add <本仓库路径>
/plugin install flag-guard-cc-plugin@flag-guard-dev
```

依赖：
- Node 18+（推荐 22/24）
- [xiumi-connector](https://github.com/egg-0831/xiumi-connector)（MIT）克隆到本机，设置环境变量 `FG_XIUMI_CONNECTOR` 指向其目录；`session.json` 中保存秀米登录 Cookie

## 组件

| 组件 | 说明 |
|------|------|
| `skills/bjtu-flag-guard-push/` | 文案写作：7 类推送骨架、合规红线、反AI腔检测（含实测频率）、三路审查（合规/AI腔/事实核查）、独立复算收敛 |
| `skills/wechat-typeset/` | 秀米母版自动填充：steal→填槽→换图→预览 + High/Medium 自检报告 |
| `commands/push.md` | `/push` 一条命令编排全流程（含人工门） |
| `masters/`（在 wechat-typeset 内） | 5 套母版的槽位数据（源自本队历史作品） |

## 状态

- ✅ meeting（大会）母版全链路实测通过（2026-11-13）：18/18 槽填充、PUT 200、远端回读 7/7、自检 High 0
- ⏳ 其余 4 套母版槽位规格待策展（原始槽位数据已提取在 masters/）

## 安全红线

- 秀米母版**只读**，一切写入发生在 `steal` 出的副本上
- PUT 前必须重写 `authorAppendix` 署名为当前用户（steal 副本带原作者署名会被服务端拒绝）
- Cookie / session.json / AppSecret 等同密码，**永不入库**
- 「同步到公众号」「发布」永远人工执行
