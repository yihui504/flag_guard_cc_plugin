// 槽位规格生成器 v2：按 文本前缀/全等 匹配节点，输出每个节点的全部 raw 连续文本段
// 用法: node slot-spec-gen.mjs <slots.json> <类型>
import fs from 'node:fs';

const file = process.argv[2];
const type = process.argv[3];
if (!file || !type) { console.log('用法: node slot-spec-gen.mjs <slots.json> <类型>'); process.exit(1); }
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

// key → 匹配规则（mode: exact=纯文本全等 / prefix=纯文本前缀）
const KEY_MAPS = {
  meeting: [
    { key: 'year', mode: 'exact', text: '2026' },
    { key: 'headline', mode: 'exact', text: '26中队预备队新队员见面大会' },
    { key: 'kicker', mode: 'prefix', text: '怀赤诚相聚' },
    { key: 'lede', mode: 'prefix', text: '10月14日' },
    { key: 'agenda1_label', mode: 'exact', text: '大会第一项' },
    { key: 'agenda1_title', mode: 'prefix', text: '全员肃立' },
    { key: 'agenda1_body', mode: 'prefix', text: '大会第一项，出旗' },
    { key: 'agenda2_label', mode: 'exact', text: '大会第二项' },
    { key: 'agenda2_title', mode: 'exact', text: '队长陈焕捷寄语' },
    { key: 'agenda2_body', mode: 'prefix', text: '陈焕捷队长首先' },
    { key: 'agenda3_label', mode: 'exact', text: '大会第三项' },
    { key: 'agenda3_title', mode: 'exact', text: '26预备队队员自我介绍' },
    { key: 'agenda3_body', mode: 'prefix', text: '26预备队队员依次登台' },
    { key: 'agenda4_label', mode: 'exact', text: '大会第四项' },
    { key: 'agenda4_title', mode: 'exact', text: '训练安排与纪律要求' },
    { key: 'agenda4_body', mode: 'prefix', text: '队长陈焕捷对25中队' },
    { key: 'agenda5_label', mode: 'exact', text: '大会第五项' },
    { key: 'agenda5_title', mode: 'prefix', text: '合唱《祖国不会忘记》' },
    { key: 'agenda5_body', mode: 'prefix', text: '大会最后一项' },
    { key: 'signature', mode: 'prefix', text: '文案' },
  ],
};

const map = KEY_MAPS[type];
if (!map) { console.log('没有该类型的 KEY_MAPS:', type, '（可选:', Object.keys(KEY_MAPS).join(', '), '）'); process.exit(1); }

function rawRuns(html) {
  return html.split(/<[^>]*>/).map((x) => x).filter((x) => x.trim().length > 0);
}

const allHtml = j.slots.map((s) => s.html).join('\u0001');
const spec = { masterId: j.masterId, type, title: j.title, slots: [], images: j.images.map((im, i) => ({ index: i, src: im.src, path: im.path })) };

let warn = 0;
for (const rule of map) {
  const matched = j.slots.filter((s) => {
    const p = s.plain;
    return rule.mode === 'exact' ? p === rule.text : p.startsWith(rule.text);
  });
  if (matched.length !== 1) {
    console.log(`✗ ${key10(rule.key)}: 匹配 ${matched.length} 个节点（${rule.mode} ${rule.text}）`);
    warn++;
    continue;
  }
  const node = matched[0];
  const runs = rawRuns(node.html)
    .map((from) => {
      let occ = 0;
      for (const s of j.slots) occ += s.html.split(from).length - 1;
      return { from, len: from.length, occ };
    })
    .sort((a, b) => b.len - a.len);
  const usable = runs.filter((r) => r.occ === 1);
  spec.slots.push({
    key: rule.key,
    path: node.path,
    runs,
    primary: usable[0]?.from ?? runs[0]?.from ?? '',
    primaryUnique: usable.length > 0,
    fixed: rule.key.endsWith('_label') || rule.key === 'year',
    preview: node.plain.replace(/ /g, '␣').slice(0, 50),
  });
  const flag = usable.length ? '✓' : '⚠无唯一段';
  if (!usable.length) warn++;
  console.log(`${flag} ${key10(rule.key).padEnd(16)} runs=${runs.length} 主段len=${String(runs[0]?.len ?? 0).padStart(3)}  ${node.plain.slice(0, 40)}`);
}

function key10(s) { return String(s ?? ''); }

fs.writeFileSync(file.replace('.slots.json', '.slot-spec.json'), JSON.stringify(spec, null, 1), 'utf8');
console.log(`\n已写: ${file.replace('.slots.json', '.slot-spec.json')}  （槽 ${spec.slots.length}/${map.length}，警告 ${warn}）`);
