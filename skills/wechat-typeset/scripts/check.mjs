#!/usr/bin/env node
// check.mjs — 自检报告生成器：硬伤 High / 观感 Medium，供人工裁决修哪些
// 用法: node check.mjs <content-spec.json> [--show <作品ID>]
//   不带 --show 时只做本地静态检查；带 --show 会拉取远端最新内容树核对
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO = process.env.FG_XIUMI_CONNECTOR
  || 'C:/Users/11428/Desktop/SKILL for text writing/_research/xiumi/egg-0831_xiumi-connector';
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = await import(`file:///${REPO}/xiumi-core.mjs`);
const { loadSession, apiRequest } = core;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const cookie = loadSession()?.cookie || '';

const specFile = process.argv[2];
const showFlag = process.argv.indexOf('--show');
const SHOW_ID = showFlag > -1 ? process.argv[showFlag + 1] : null;
if (!specFile) { console.log('用法: node check.mjs <content-spec.json> [--show <作品ID>]'); process.exit(1); }
const content = JSON.parse(fs.readFileSync(path.resolve(specFile), 'utf8'));

const candidates = fs.readdirSync(path.join(SKILL_DIR, 'masters')).filter((f) => f.startsWith(`${content.master}__`) && f.endsWith('.slot-spec.json'));
const spec = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'masters', candidates[0]), 'utf8'));

const findings = [];   // { severity: High|Medium, item, detail, advice }

function stripTags(html) {
  return String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}
function collectText(tree) {
  const arr = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'text' && typeof v === 'string') arr.push(v);
      else if (v && typeof v === 'object') walk(v);
    }
  })(tree);
  return arr;
}
function countImages(tree) {
  let c = 0;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    for (const [k, v] of Object.entries(n)) {
      if (v && typeof v === 'object') { if (v.type === 'image') c++; walk(v); }
    }
  })(tree);
  return c;
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

let tree = null;
if (SHOW_ID) tree = await fetchTree(SHOW_ID);
const allText = tree ? collectText(tree).join('\n') : '';
const allHtml = tree ? collectText(tree).join('\u0001') : '';

// ═══ High：硬伤 ═══

// H1 未填充槽：非固定槽且 content-spec 未提供
const expectedSlots = Object.keys(content.slots ?? {});
for (const s of spec.slots) {
  if (s.fixed) continue;
  if (s.key === 'signature' && content.signature) continue;
  if (!expectedSlots.includes(s.key)) {
    findings.push({ severity: 'High', item: `槽位未填: ${s.key}`, detail: `content-spec 未提供「${s.key}」，母版原文仍在稿中`, advice: '补 content-spec 或确认接受母版原文' });
  }
}
if (tree && SHOW_ID) {
  for (const [key, value] of Object.entries(content.slots ?? {})) {
    const specSlot = spec.slots.find((x) => x.key === key);
    if (!specSlot) continue;
    const newPlain = stripTags(String(value));
    const newPresent = newPlain.length >= 8 && allText.includes(newPlain.slice(0, Math.max(12, Math.floor(newPlain.length * 0.6))));
    if (newPresent) continue; // 新文本已在稿中 → 生效
    const oldPlain = stripTags(specSlot.primary);
    if (oldPlain.length >= 8 && allText.includes(oldPlain.slice(0, Math.max(12, Math.floor(oldPlain.length * 0.6))))) {
      findings.push({ severity: 'High', item: `槽位疑似未生效: ${key}`, detail: `新文本未见，终稿中仍存在母版原文「${oldPlain.slice(0, 20)}…」`, advice: '检查 fill 日志的未命中列表' });
    }
  }
}

// H2 签名四字段
const sigText = tree ? allText.match(/文案[｜|][^\n]{0,30}/) : null;
if (tree && !sigText) findings.push({ severity: 'High', item: '落款缺失', detail: '终稿未见「文案｜…」落款', advice: '手册要求每篇必有 文案/排版/审核/图片 四字段' });

// H3 标题长度（微信上限 64 字）
if (content.title && content.title.length > 64) findings.push({ severity: 'High', item: '标题超长', detail: `${content.title.length} 字（微信上限 64）`, advice: '压缩标题' });

// H4 测试标记残留
if (tree && /【链路测试】/.test(allText)) findings.push({ severity: 'High', item: '测试标记残留', detail: '终稿含【链路测试】字样', advice: '正式稿必须清除' });

// H5 图片数量与 spec 不一致
if (tree && content.images && SHOW_ID) {
  const actual = countImages(tree);
  const specTotal = spec.images.length;
  if (actual !== specTotal) findings.push({ severity: 'High', item: '图片数异常', detail: `终稿 ${actual} 张 vs 母版 ${specTotal} 张`, advice: '核对换图映射是否漏项' });
}

// ═══ Medium：观感 ═══

// M1 连续图片（手册：避免连续 3 张以上图片无文字）
if (tree) {
  const seq = [];
  (function walkLayers(layer) {
    (layer?.comps?.items ?? []).forEach((item) => {
      let hasText = false, hasImg = false;
      for (const [k, v] of Object.entries(item ?? {})) {
        if (k === '_comp' || !v || typeof v !== 'object') continue;
        if (v.type === 'text' && String(v.text).replace(/<[^>]+>/g, '').trim()) hasText = true;
        if (v.type === 'image') hasImg = true;
        if (Array.isArray(v.items)) walkItems(v.items);
      }
      function walkItems(items) {
        (items ?? []).forEach((it) => {
          for (const [k, v] of Object.entries(it ?? {})) {
            if (k === '_comp' || !v || typeof v !== 'object') return;
            if (v.type === 'text' && String(v.text).replace(/<[^>]+>/g, '').trim()) hasText = true;
            if (v.type === 'image') hasImg = true;
            if (Array.isArray(v.items)) walkItems(v.items);
          }
        });
      }
      seq.push({ hasText, hasImg });
    });
  })(tree?.cubes?.[0]?.pages?.[0]?.layers?.[0]);
  let run = 0, maxRun = 0;
  for (const s of seq) { run = s.hasImg && !s.hasText ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
  if (maxRun >= 3) findings.push({ severity: 'Medium', item: '连续图片堆叠', detail: `连续 ${maxRun} 个纯图片组件无文字`, advice: '手册：避免连续 3 张以上图片无文字说明，建议插入图说' });
}

// M2 段落长度（单节 ≤250 字手册要求，超 1.6 倍提示）
if (tree) {
  for (const t of collectText(tree)) {
    const plain = stripTags(t);
    if (plain.length > 400) findings.push({ severity: 'Medium', item: '超长段落', detail: `一段 ${plain.length} 字：「${plain.slice(0, 24)}…」`, advice: '手册建议单节 ≤250 字，考虑拆分' });
  }
}

// M3 中心句替换后的空段
if (tree) {
  const empties = collectText(tree).filter((t) => /^(\s|&nbsp;|<br\s*\/?>)*$/.test(t.replace(/<[^>]+>/g, '')) && t.length > 60 && t.length < 200).length;
  if (empties >= 3) findings.push({ severity: 'Medium', item: '大量空段', detail: `${empties} 个仅含空行的段`, advice: '观感考虑删减空段' });
}

// ═══ 输出报告 ═══
const highs = findings.filter((f) => f.severity === 'High');
const meds = findings.filter((f) => f.severity === 'Medium');
const lines = [];
lines.push(`# 自检报告 · ${content.title}`);
lines.push('');
lines.push(`- 母版：${content.master}（${spec.masterId}）`);
lines.push(`- 作品：${SHOW_ID || '(未指定，仅静态检查)'}`);
lines.push(`- 时间：${new Date().toISOString()}`);
lines.push('');
lines.push(`## High（硬伤 ${highs.length}）`);
if (!highs.length) lines.push('（无）');
for (const f of highs) { lines.push(`- **${f.item}** — ${f.detail}\n  - 建议：${f.advice}`); }
lines.push('');
lines.push(`## Medium（观感 ${meds.length}）`);
if (!meds.length) lines.push('（无）');
for (const f of meds) { lines.push(`- **${f.item}** — ${f.detail}\n  - 建议：${f.advice}`); }
lines.push('');
lines.push('---');
lines.push('人工过目后决定修哪些。修完后重跑 fill + check。');

const report = lines.join('\n');
console.log(report);
const outFile = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (outFile) fs.writeFileSync(outFile, report + '\n', 'utf8');
