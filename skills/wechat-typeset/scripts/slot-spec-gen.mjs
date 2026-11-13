// 槽位规格生成器：按 文本前缀/全等 匹配节点，输出每个节点的全部 raw 连续文本段
// 用法: node slot-spec-gen.mjs <slots.json> <类型>
import fs from 'node:fs';

const file = process.argv[2];
const type = process.argv[3];
if (!file || !type) { console.log('用法: node slot-spec-gen.mjs <slots.json> <类型>'); process.exit(1); }
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

// key → 匹配规则（mode: exact=纯文本全等 / prefix=纯文本前缀）
// fixed: true = 固定文本（装饰/标签/栏目名），content-spec 不需要填
const KEY_MAPS = {
  meeting: [
    { key: 'year', mode: 'exact', text: '2026', fixed: true },
    { key: 'headline', mode: 'exact', text: '26中队预备队新队员见面大会' },
    { key: 'kicker', mode: 'prefix', text: '怀赤诚相聚' },
    { key: 'lede', mode: 'prefix', text: '10月14日' },
    { key: 'agenda1_label', mode: 'exact', text: '大会第一项', fixed: true },
    { key: 'agenda1_title', mode: 'prefix', text: '全员肃立' },
    { key: 'agenda1_body', mode: 'prefix', text: '大会第一项，出旗' },
    { key: 'agenda2_label', mode: 'exact', text: '大会第二项', fixed: true },
    { key: 'agenda2_title', mode: 'exact', text: '队长陈焕捷寄语' },
    { key: 'agenda2_body', mode: 'prefix', text: '陈焕捷队长首先' },
    { key: 'agenda3_label', mode: 'exact', text: '大会第三项', fixed: true },
    { key: 'agenda3_title', mode: 'exact', text: '26预备队队员自我介绍' },
    { key: 'agenda3_body', mode: 'prefix', text: '26预备队队员依次登台' },
    { key: 'agenda4_label', mode: 'exact', text: '大会第四项', fixed: true },
    { key: 'agenda4_title', mode: 'exact', text: '训练安排与纪律要求' },
    { key: 'agenda4_body', mode: 'prefix', text: '队长陈焕捷对25中队' },
    { key: 'agenda5_label', mode: 'exact', text: '大会第五项', fixed: true },
    { key: 'agenda5_title', mode: 'prefix', text: '合唱《祖国不会忘记》' },
    { key: 'agenda5_body', mode: 'prefix', text: '大会最后一项' },
    { key: 'signature', mode: 'prefix', text: '文案' },
  ],
  training: [
    { key: 'team_name', mode: 'exact', text: '北京交通大学国旗仪仗队', fixed: true },
    { key: 'slogan', mode: 'exact', text: '行之有恒久而成锋' },
    { key: 'month_label', mode: 'prefix', text: '—', fixed: true },
    { key: 'lede', mode: 'prefix', text: '秋意渐浓' },
    { key: 'sq1_title', mode: 'exact', text: '26中队预备队风采' },
    { key: 'sq1_content_label', mode: 'prefix', text: '01训练内容', fixed: true },
    { key: 'sq1_content_body', mode: 'prefix', text: '本月，26中队预备队以夯实基础' },
    { key: 'sq1_subjects', mode: 'prefix', text: '训练聚焦基础核心动作' },
    { key: 'sq1_result_label', mode: 'prefix', text: '02训练成果', fixed: true },
    { key: 'sq1_result_body', mode: 'prefix', text: '训练初期，存在动作不标准' },
    { key: 'sq2_title', mode: 'exact', text: '25中队风采' },
    { key: 'sq2_content_label', mode: 'exact', text: '训练内容', fixed: true },
    { key: 'sq2_content_body', mode: 'prefix', text: '十月以来，25中队坚持每周常态化晚训' },
    { key: 'sq2_result_label', mode: 'exact', text: '训练成果', fixed: true },
    { key: 'sq2_result_body', mode: 'prefix', text: '针对训练短板，队员们主动精进' },
    { key: 'summary_label', mode: 'prefix', text: '总', fixed: true },
    { key: 'summary_body', mode: 'prefix', text: '回望十月' },
    { key: 'signature', mode: 'prefix', text: '文案' },
  ],
  flagraise: [
    { key: 'headline', mode: 'exact', text: '2026级新生开学典礼升旗' },
    { key: 'slogan', mode: 'exact', text: '礼迎百卅旗耀青春' },
    { key: 'lede', mode: 'prefix', text: '国旗高扬，护旗启新' },
    { key: 'section_label', mode: 'exact', text: '升旗', fixed: true },
    { key: 'event_intro', mode: 'prefix', text: '9月5日8:00' },
    { key: 'stage1_body', mode: 'prefix', text: '开学典礼正式开始' },
    { key: 'stage2_body', mode: 'prefix', text: '升旗仪式开始，刀手下达' },
    { key: 'stage3_body', mode: 'prefix', text: '全体师生齐唱国歌' },
    { key: 'summary_label', mode: 'exact', text: '总结', fixed: true },
    { key: 'summary_body', mode: 'prefix', text: '百卅交大，薪火赓续' },
    { key: 'signature', mode: 'prefix', text: '文案' },
  ],
  ceremony: [
    { key: 'headline', mode: 'prefix', text: '-- 新学期换届大会暨' },
    { key: 'slogan', mode: 'exact', text: '薪火传旗韵 青衿赴新程' },
    { key: 'lede', mode: 'prefix', text: '红旗高扬，初心不改' },
    { key: 'agenda1_title', mode: 'prefix', text: '全员肃立' },
    { key: 'agenda1_body', mode: 'prefix', text: '全体起立，奏唱中华人民共和国国歌' },
    { key: 'agenda2_title', mode: 'exact', text: '25中队入队仪式' },
    { key: 'agenda2_item', mode: 'exact', text: '颁发聘书、章程' },
    { key: 'agenda2_body', mode: 'prefix', text: '在25中队入队仪式上' },
    { key: 'agenda3_title', mode: 'prefix', text: '队员代表尹浩宇发言' },
    { key: 'agenda3_body', mode: 'prefix', text: '25中队队员代表尹浩宇发言' },
    { key: 'agenda4_title', mode: 'exact', text: '入队宣誓' },
    { key: 'agenda4_body', mode: 'prefix', text: '入队宣誓环节' },
    { key: 'agenda5_title', mode: 'exact', text: '换届竞聘发言' },
    { key: 'agenda5_body', mode: 'prefix', text: '本次换届竞聘面向24中队队员' },
    { key: 'agenda6_body', mode: 'prefix', text: '参与竞聘的24中队队员们依次登台' },
    { key: 'agenda7_title', mode: 'exact', text: '新学期动员大会' },
    { key: 'agenda7_body', mode: 'prefix', text: '23中队队长吴天骄作动员发言' },
    { key: 'summary_body', mode: 'prefix', text: '本次北京交通大学国旗仪仗队新学期换届大会' },
    { key: 'end_label', mode: 'exact', text: 'END', fixed: true },
    { key: 'signature', mode: 'prefix', text: '文案/' },
  ],
  recruit: [
    { key: 'sec1_label', mode: 'prefix', text: '01｜与国旗同行', fixed: true },
    { key: 'sec1_poem', mode: 'prefix', text: '正步劈开晨曦的光芒' },
    { key: 'sec1_title', mode: 'exact', text: '守护这一抹中国红' },
    { key: 'sec1_body', mode: 'prefix', text: '国旗，是国家的象征' },
    { key: 'sec1_gain', mode: 'prefix', text: '你会告别拖延' },
    { key: 'sec2_label', mode: 'prefix', text: '02｜仪仗任务', fixed: true },
    { key: 'sec2_body', mode: 'prefix', text: '北京交通大学国旗仪仗队承担校园升降旗' },
    { key: 'sec2_poem', mode: 'exact', text: '少年自有清风骨，不负山河不负旗。' },
    { key: 'sec2_body2', mode: 'prefix', text: '从晨光里的日常升旗' },
    { key: 'sec3_label', mode: 'prefix', text: '03｜部门介绍', fixed: true },
    { key: 'sec3_body', mode: 'prefix', text: '队列之中，我们并肩完成任务' },
    { key: 'dept1_name', mode: 'exact', text: '办公室：', fixed: true },
    { key: 'dept1_body', mode: 'prefix', text: '负责队伍日常行政与材料管理' },
    { key: 'dept2_name', mode: 'exact', text: '宣传部：', fixed: true },
    { key: 'dept2_body', mode: 'exact', text: '负责队伍宣传与形象展示，包括推送、海报、摄影摄像及活动记录。' },
    { key: 'dept3_name', mode: 'exact', text: '联勤保障部：', fixed: true },
    { key: 'dept3_body', mode: 'prefix', text: '负责礼服、训练服、国旗及各类物资' },
    { key: 'dept4_name', mode: 'exact', text: '外联部：', fixed: true },
    { key: 'dept4_body', mode: 'prefix', text: '负责队伍对外联络与交流合作' },
    { key: 'sec4_label', mode: 'prefix', text: '04｜赛场荣誉', fixed: true },
    { key: 'sec4_body', mode: 'exact', text: '我们代表学校参加全国及北京市相关比赛、检阅和交流展示。' },
    { key: 'honor_poem', mode: 'prefix', text: '千锤百炼铸队列' },
    { key: 'mission_body', mode: 'prefix', text: '2025' },
    { key: 'cta_title', mode: 'exact', text: '现在，轮到你了' },
    { key: 'cta_body', mode: 'prefix', text: '不需要天赋异禀' },
    { key: 'req_body', mode: 'prefix', text: '①男女不限' },
    { key: 'schedule_body', mode: 'prefix', text: '招新安排' },
    { key: 'booth_body', mode: 'prefix', text: '你可以到摊位一睹队员风采' },
    { key: 'contact_body', mode: 'prefix', text: '有意向者请扫码加入' },
    { key: 'notice_body', mode: 'exact', text: '具体报名时间与方式以群内通知为准' },
    { key: 'lottery_body', mode: 'prefix', text: '转发本篇推送至朋友圈' },
    { key: 'signature', mode: 'prefix', text: '文案' },
  ],
};

const map = KEY_MAPS[type];
if (!map) { console.log('没有该类型的 KEY_MAPS:', type, '（可选:', Object.keys(KEY_MAPS).join(', '), '）'); process.exit(1); }

function rawRuns(html) {
  return html.split(/<[^>]*>/).filter((x) => x.trim().length > 0);
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
    console.log(`✗ ${rule.key}: 匹配 ${matched.length} 个节点（${rule.mode} ${rule.text.slice(0, 20)}）`);
    matched.forEach((s) => console.log('    ·', s.plain.replace(/ /g, '␣').slice(0, 40)));
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
    fixed: rule.fixed === true,
    preview: node.plain.replace(/ /g, '␣').slice(0, 50),
  });
  const flag = usable.length ? '✓' : '⚠无唯一段';
  if (!usable.length) warn++;
  console.log(`${flag} ${rule.key.padEnd(18)} runs=${runs.length} 主段len=${String(runs[0]?.len ?? 0).padStart(3)}  ${node.plain.slice(0, 36)}`);
}

fs.writeFileSync(file.replace('.slots.json', '.slot-spec.json'), JSON.stringify(spec, null, 1), 'utf8');
console.log(`\n已写: ${file.replace('.slots.json', '.slot-spec.json')}  （槽 ${spec.slots.length}/${map.length}，警告 ${warn}）`);
