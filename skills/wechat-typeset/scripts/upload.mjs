#!/usr/bin/env node
// upload.mjs — 图片上传到秀米图库（纯 HTTP，无需浏览器）
//
// 两种用法：
//   CLI:   node upload.mjs <图片1> <图片2> ...        → 打印 JSON 映射
//   模块:  import { uploadFiles } from './upload.mjs'
//          const mapping = await uploadFiles(['C:/…/a.jpg'])   // { 绝对路径: 图床URL }
//
// 协议: ① POST /api/upload-cdn/token（body: upload_type/team_id/watermark）取令牌
//       ② POST upload.xiumius.cn/api/upload-cdn/image/file
//          multipart: updateTsIfExisted=true · token=<令牌> · image_file=<文件>
//       服务端按内容哈希去重，重复上传幂等返回同一 URL
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = process.env.FG_XIUMI_CONNECTOR
  || 'C:/Users/11428/Desktop/SKILL for text writing/_research/xiumi/egg-0831_xiumi-connector';
const core = await import(`file:///${REPO}/xiumi-core.mjs`);
const { loadSession } = core;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const cookie = loadSession()?.cookie || '';
const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };

/** 上传多张图片，返回 { 绝对路径: 图床URL } */
export async function uploadFiles(filesArg) {
  const files = filesArg.map((f) => path.resolve(f));
  for (const f of files) {
    if (!fs.existsSync(f)) throw new Error('文件不存在: ' + f);
    const ext = path.extname(f).toLowerCase();
    if (!mime[ext]) throw new Error('不支持的格式（仅 jpg/png/gif）: ' + f);
  }
  const cookie = loadSession()?.cookie || '';
  if (!cookie) throw new Error('未登录：连接器 session.json 无 Cookie');

  const tokenRes = await fetch('https://xiumi.us/api/upload-cdn/token', {
    method: 'POST',
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://xiumi.us/', Cookie: cookie, 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({ upload_type: 'image', team_id: null, watermark: null }),
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson?.data?.token;
  if (!token) throw new Error('取令牌失败: ' + JSON.stringify(tokenJson).slice(0, 200));

  const mapping = {};
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const name = path.basename(f);
    const form = new FormData();
    form.append('updateTsIfExisted', 'true');
    form.append('token', token);
    form.append('image_file', new Blob([buf], { type: mime[path.extname(f).toLowerCase()] }), name);
    const res = await fetch('https://upload.xiumius.cn/api/upload-cdn/image/file', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: 'https://xiumi.us/' },
      body: form,
    });
    const j = await res.json();
    if (res.status >= 400 || !j?.data?.target_uri) throw new Error(`${name} 上传失败 [${res.status}]: ${JSON.stringify(j).slice(0, 200)}`);
    mapping[f] = 'https:' + j.data.target_uri;
    if (j.data.duplicated) console.log(`  · ${name} 内容重复，复用已有URL`);
    await new Promise((r) => setTimeout(r, 800));
  }
  return mapping;
}

// CLI 入口
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('用法: node upload.mjs <图片...>'); process.exit(1); }
  try {
    const mapping = await uploadFiles(files);
    for (const [f, url] of Object.entries(mapping)) console.log(`✓ ${path.basename(f)} → ${url.slice(0, 84)}`);
    console.log('\n' + JSON.stringify(mapping, null, 1));
  } catch (e) {
    console.error('✗', e.message);
    process.exit(1);
  }
}
