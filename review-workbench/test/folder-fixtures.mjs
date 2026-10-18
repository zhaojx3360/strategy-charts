import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export async function makeFootage(folder) {
  fs.mkdirSync(path.join(folder, '补录'), { recursive: true });
  for (const [name, metadata] of [
    ['先录.mp4', ['-metadata', 'com.apple.quicktime.creationdate=2026-10-17T09:00:00+0800', '-movflags', 'use_metadata_tags']],
    ['后录.mp4', ['-metadata', 'creation_time=2026-10-17T02:00:00Z']],
    ['缺少拍摄时间.mp4', []],
    ['补录/补录片段.mp4', ['-metadata', 'creation_time=2026-10-17T03:00:00Z']]
  ]) {
    await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x283344:s=320x180:r=12','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',...metadata,path.join(folder,name)], { windowsHide: true, timeout: 20000 });
  }
  fs.utimesSync(path.join(folder, '缺少拍摄时间.mp4'), new Date('2026-10-17T02:30:00Z'), new Date('2026-10-17T02:30:00Z'));
  fs.writeFileSync(path.join(folder, '损坏的文件.mp4'), 'not a video');
  fs.writeFileSync(path.join(folder, '录制说明.txt'), '仅供测试，不是真实素材');
}
