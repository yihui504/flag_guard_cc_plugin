#!/usr/bin/env node
// fill.mjs — 生产填充管线：steal 母版 → 按槽位填内容 → 换图 → publish 预览
// 用法: node fill.mjs <content-spec.json> [--dry]
//
// content-spec 格式:
// {
//   "master": "meeting",                    // masters/ 下的类型 key
//   "title": "作品标题",                     // steal 副本的标题
//   "slots": { "headline": "…", "lede": "…", ... },   // key → 新文本（\n 转 <br>）
//   "signature": { "文案": "…", "排版": "…", "审核": "…", "图片": "…" },  // 可选
//   "images": { "1": "https://img.xiumi.us/…", "3": "…" }             // 可选：槽索引 → 新图URL
// }
//
// 依赖：环境变量 FG_XIUMI_CONNECTOR 指向 xiumi-connector 仓库；其 session.json 已登录。
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO = process.env.FG_XIUMI_CONNECTOR
  || 'C:/Users/11428/Desktop/SKILL for text writing/_research/xiumi/egg-0831_xiumi-connector';
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const core = await import(`file:///${REPO}/xiumi-core.mjs`);
const { wrapData, loadSession, apiRequest, compressToBase64 } = core;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const session = loadSession();
const cookie = session?.cookie || '';
const uid = session?.uid || '';
const sid = session?.sid || '';
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const specFile = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!specFile) { console.log('用法: node fill.mjs <content-spec.json> [--dry]'); process.exit(1); }
const content = JSON.parse(fs.readFileSync(path.resolve(specFile), 'utf8'));

// ── 1. 载入母版槽位规格 ──
const candidates = fs.readdirSync(path.join(SKILL_DIR, 'masters')).filter((f) => f.startsWith(`${content.master}__`) && f.endsWith('.slot-spec.json'));
if (!candidates.length) { console.error(`✗ 没有母版规格: ${content.master}（masters/ 下无 ${content.master}__*.slot-spec.json）`); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'masters', candidates[0]), 'utf8'));
const MASTER_ID = spec.masterId;
console.log(`母版: ${content.master} (${MASTER_ID})「${spec.title}」`);

// ── 2. steal 母版 → 新副本 ──
if (DRY) console.log('[dry] 跳过 steal');
let newId = content.existingShowId || null;
if (!newId) {
  const meta = await apiRequest(`/api/shows/${MASTER_ID}`);
  const d = meta.json?.data ?? meta.json;
  const res = await apiRequest('/api/shows/v5/paper', {
    method: 'POST',
    query: { from_show_id: MASTER_ID },
    body: {
      format: '0320cc2e241eb9af530b84dbe0b1cc65',
      encodedData: compressToBase64(JSON.stringify({ title: content.title || `${d.title ?? '未命名'} - 拷贝`, raw_info_only: true })),
      copyFromShowId: MASTER_ID,
      tn_show_action_token_2: d.show_data_name ? core.copyToken(d.show_data_name) : undefined,
    },
  });
  if (res.status >= 400 || !res.json?.data?.show_id) {
    console.error(`✗ steal 失败 [${res.status}]: ${String(res.text).slice(0, 200)}`);
    process.exit(1);
  }
  newId = res.json.data.show_id;
  console.log(`✓ steal → 新作品 ${newId}「${content.title || ''}」`);
  await sleep(1200);
} else {
  console.log(`复用已有作品 ${newId}`);
}

// ── 3. 拉取副本内容树 ──
async function freshSavedAt(id) {
  const r = await fetch(`https://xiumi.us/api/shows/${id}`, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://xiumi.us/', Cookie: cookie } });
  const j = await r.json();
  return (j.data ?? j).saved_at;
}
async function fetchTree(id) {
  const meta = await apiRequest(`/api/shows/${id}`);
  const d = meta.json?.data ?? meta.json;
  const url = d.show_data_url?.startsWith('//') ? 'https:' + d.show_data_url : d.show_data_url;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
  const buf = Buffer.from(await res.arrayBuffer());
  const raw = buf[0] === 0x1f && buf[1] === 0x8f ? gunzipSync(buf) : buf;
  return JSON.parse(raw.toString('utf8'));
}
const tree = await fetchTree(newId);

// ── 4. 按路径定位节点字段（与 muban-dump 相同的 walk 算法）──
// 路径格式: "<顶层idx>:<字段>/<idx>:<字段>/<idx>:…:<textKey>"
// 例: "6:col1/2:txt1" → items[6] → 其 col1.items[2] → 该节点的 txt1 字段
function walkToField(layer, pathStr) {
  const segs = pathStr.split(':');
  let item = layer?.comps?.items?.[Number(segs[0])];
  if (!item) return { node: null, field: null };
  for (let i = 1; i < segs.length - 1; i++) {
    const slash = segs[i].lastIndexOf('/');
    const key = segs[i].slice(0, slash);
    const idx = Number(segs[i].slice(slash + 1));
    const v = item?.[key];
    if (!v || !Array.isArray(v.items)) return { node: null, field: null };
    item = v.items[idx];
    if (!item) return { node: null, field: null };
  }
  return { node: item, field: segs[segs.length - 1] };
}

// ── 5. 填槽 ──
let applied = 0;
const missed = [];
const escaped = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toRaw = (s) => escaped(String(s)).replace(/\n/g, '<br>');

for (const [key, value] of Object.entries(content.slots ?? {})) {
  const specSlot = spec.slots.find((s) => s.key === key);
  if (!specSlot) { missed.push(`${key}(规格无此槽)`); continue; }
  const { node, field: tk } = walkToField(tree?.cubes?.[0]?.pages?.[0]?.layers?.[0], specSlot.path);
  if (!node || !tk) { missed.push(`${key}(路径未命中 ${specSlot.path})`); continue; }
  const html = node[tk].text;
  const from = specSlot.primary;
  if (!from || !html.includes(from)) { missed.push(`${key}(主段未命中: ${String(from).slice(0, 20)}…)`); continue; }
  node[tk].text = html.split(from).join(toRaw(value));
  applied++;
  console.log(`  ✓ ${key}`);
}

// ── 5b. 签名（按行标签匹配 runs）──
if (content.signature) {
  const specSlot = spec.slots.find((s) => s.key === 'signature');
  const { node, field: tk } = specSlot ? walkToField(tree?.cubes?.[0]?.pages?.[0]?.layers?.[0], specSlot.path) : { node: null, field: null };
  if (node && tk) {
    let html = node[tk].text;
    for (const [label, value] of Object.entries(content.signature)) {
      const run = specSlot.runs.find((r) => r.from.replace(/&nbsp;/g, ' ').trim().startsWith(label));
      if (run && html.includes(run.from)) {
        html = html.split(run.from).join(toRaw(`${label}｜${value}`));
        applied++;
        console.log(`  ✓ signature.${label}`);
      } else {
        missed.push(`signature.${label}(未命中行)`);
      }
    }
    node[tk].text = html;
  } else missed.push('signature(路径未命中)');
}

// ── 6. 换图 ──
for (const [idx, newSrc] of Object.entries(content.images ?? {})) {
  const imgSpec = spec.images?.[Number(idx)];
  if (!imgSpec) { missed.push(`image.${idx}(规格无此图)`); continue; }
  const { node, field: ik } = walkToField(tree?.cubes?.[0]?.pages?.[0]?.layers?.[0], imgSpec.path);
  if (!node || !ik) { missed.push(`image.${idx}(路径未命中)`); continue; }
  node[ik].src = newSrc;
  applied++;
  console.log(`  ✓ image.${idx}`);
}

// ── 7. 署名修复（authorAppendix → 当前用户）──
if (tree.authorAppendix) {
  const a = tree.authorAppendix;
  a.originUserUniqueUID = uid; a.originUserSID = sid;
  a.sourceUserUniqueUID = uid; a.sourceUserSID = sid;
}

console.log(`\n填充: 成功 ${applied} / 未命中 ${missed.length}`);
if (missed.length) missed.forEach((m) => console.log('  ✗', m));

// ── 8. PUT ──
if (DRY) { console.log('[dry] 跳过写入与发布'); process.exit(0); }
if (applied === 0) { console.error('✗ 零填充，不写入'); process.exit(1); }
if (missed.length && process.env.FG_STRICT === '1') { console.error('✗ 严格模式：存在未命中槽，不写入'); process.exit(1); }

const savedAt = await freshSavedAt(newId);
const payload = wrapData(tree, uid);
payload.lastSavedAt = savedAt;
payload.savingToken = md5([randomUUID() + randomUUID(), Date.now()].join('.'));
const res = await fetch(`https://xiumi.us/api/shows/${newId}`, {
  method: 'PUT',
  headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: 'https://xiumi.us/studio/v5', 'Content-Type': 'application/json;charset=UTF-8', Cookie: cookie },
  body: JSON.stringify(payload),
});
const t = await res.text();
if (res.status >= 300) { console.error(`✗ PUT 失败 [${res.status}]`, t.slice(0, 160)); process.exit(1); }
console.log(`✓ PUT [${res.status}] Common:Updated`);

// ── 9. 回读验证 ──
const verify = await fetchTree(newId);
let markers = 0;
(function walkCount(n) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach(walkCount); return; }
  for (const [k, v] of Object.entries(n)) {
    if (k === 'text' && typeof v === 'string' && /【链路测试】|新增/.test(v)) markers++;
    else if (v && typeof v === 'object') walkCount(v);
  }
})(verify);
console.log(`回读: ${markers} 个节点含新内容标记（应 ≥ 填充槽数）`);

// ── 10. 本地快照（版本管理；注意：不用 rebuildRaHtml——其实测产物会被服务端拒绝）──
const snapDir = path.join(SKILL_DIR, 'archive');
fs.mkdirSync(snapDir, { recursive: true });
const snapName = `${content.title || newId}`.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
fs.writeFileSync(path.join(snapDir, `${newId}_${snapName}.json`), JSON.stringify(tree, null, 1), 'utf8');
console.log(`快照: archive/${newId}_${snapName}.json`);
console.log(`\n预览: https://v.xiumius.cn/board/v5/${sid}/${newId}`);
console.log(`编辑: https://xiumi.us/studio/v5#/paper/for/${newId}`);
console.log(`\n下一步（人工）: 秀米 wxpack 页（studio/v5#/wxpack）→ 顶栏「同步到公众号」→ 开始同步 → 公众号后台加封面`);
