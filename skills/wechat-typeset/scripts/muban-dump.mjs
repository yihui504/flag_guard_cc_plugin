// 母版槽位提取：拉取内容树，导出全部文本节点全文（只读）
// 用法: node muban-dump.mjs <作品ID> <类型名>
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
const REPO = process.env.FG_XIUMI_CONNECTOR || 'C:/Users/11428/Desktop/SKILL for text writing/_research/xiumi/egg-0831_xiumi-connector';

const core = await import(`file:///${REPO}/xiumi-core.mjs`);
const { loadSession } = core;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ID = process.argv[2];
const TYPE = process.argv[3] || ID;
const cookie = loadSession()?.cookie || '';
if (!ID) { console.log('用法: node muban-dump.mjs <作品ID> <类型名>'); process.exit(1); }

const r = await fetch(`https://xiumi.us/api/shows/${ID}`, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://xiumi.us/', Cookie: cookie } });
const j = await r.json();
const d = j.data ?? j;
const url = d.show_data_url?.startsWith('//') ? 'https:' + d.show_data_url : d.show_data_url;
const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
const buf = Buffer.from(await res.arrayBuffer());
const raw = buf[0] === 0x1f && buf[1] === 0x8f ? gunzipSync(buf) : buf;
const tree = JSON.parse(raw.toString('utf8'));

// 收集文本节点（保留 HTML 串）与图片节点
const slots = [];
const imgs = [];
function walk(items, path) {
  (items ?? []).forEach((item, i) => {
    const p = path ? `${path}/${i}` : String(i);
    for (const [k, v] of Object.entries(item ?? {})) {
      if (k === '_comp' || !v || typeof v !== 'object') continue;
      if (v.type === 'text' && typeof v.text === 'string') {
        slots.push({ path: `${p}:${k}`, html: v.text });
      }
      if (v.type === 'image' && typeof v.src === 'string') {
        imgs.push({ path: `${p}:${k}`, src: v.src });
      }
      if (Array.isArray(v.items)) walk(v.items, `${p}:${k}`);
    }
  });
}
walk(tree?.cubes?.[0]?.pages?.[0]?.layers?.[0]?.comps?.items);

// 纯文本 + 唯一性分析（patch 的 from 必须全文唯一或用 expect 指定次数）
const allText = slots.map((s) => s.html).join('\u0001');
const out = slots.map((s) => {
  const plain = s.html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&').trim();
  const occ = plain.length >= 4 ? allText.split(plain).length - 1 : 0;
  return { path: s.path, plain, occ, htmlLen: s.html.length, html: s.html };
});

const OUT_DIR = 'C:/Users/11428/Desktop/SKILL for text writing/flag-guard-cc-plugin/masters';
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(`${OUT_DIR}/${TYPE}__${ID}.slots.json`, JSON.stringify({ masterId: ID, type: TYPE, title: tree.title, slots: out, images: imgs }, null, 1), 'utf8');

const usable = out.filter((s) => s.plain.length >= 6 && s.occ === 1);
console.log(`[${TYPE}] ${ID}「${tree.title}」`);
console.log(`  文本节点 ${slots.length} / 图片 ${imgs.length} / 可用唯一槽(≥6字且唯一) ${usable.length}`);
console.log('  已写:', `${TYPE}__${ID}.slots.json`);
