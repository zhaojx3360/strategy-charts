import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile), stamp = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const extensions = new Set(['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.webm', '.amr']);
const MAX_AUDIO = 200 * 1024 ** 2;
export function createPickups({ read, change, projectIn, versionIn, record, mediaDir }) {
  function target(project, pickupId) {
    const item = project.pickups?.find(x => x.id === pickupId);
    if (!item) throw fail(404, '找不到这段补录，请刷新重试。');
    versionIn(project, item.versionId);
    return item;
  }
  function validate(project, body, previous) {
    const comment = project.comments.find(c => c.id === (previous?.commentId || body.commentId));
    if (!comment) throw fail(404, '找不到对应的批注。');
    const version = versionIn(project, comment.versionId);
    if (version.stage < 4) throw fail(400, '请在粗剪或后续版本中添加补录。');
    const time = Number(body.time ?? previous?.time ?? comment.time);
    const end = Number(body.end ?? previous?.end ?? comment.end);
    if (!Number.isFinite(time) || !Number.isFinite(end) || time < 0 || end <= time || end > version.duration + .1) throw fail(400, '请填写完整的替换起止时间，不能超出本版视频。');
    const text = String(body.text ?? previous?.text ?? '').trim();
    if (!text || text.length > 3000) throw fail(400, '请填写补录稿，最多3000字。');
    return { comment, version, time, end, text };
  }
  function save(projectId, body, pickupId) {
    return change(state => {
      const project = projectIn(state, projectId);
      const previous = pickupId ? target(project, pickupId) : project.pickups?.find(x => x.commentId === body.commentId);
      const value = validate(project, body, previous);
      if (body.selectedAudioId && !previous?.audios?.some(a => a.id === body.selectedAudioId)) throw fail(400, '这份录音不属于本段补录。');
      const item = previous || { id: randomUUID(), commentId: value.comment.id, versionId: value.version.id, audios: [], selectedAudioId: null, createdAt: stamp() };
      Object.assign(item, { text: value.text, time: value.time, end: value.end, visual: 'freeze', updatedAt: stamp() });
      if (body.selectedAudioId) item.selectedAudioId = body.selectedAudioId;
      if (!previous) (project.pickups ||= []).push(item);
      record(project, 'pickup_saved', value.version, '保存定格配音补录稿');
      return item;
    });
  }
  async function addAudio(projectId, pickupId, sourcePath, originalName, uploaded = false) {
    target(projectIn(read(), projectId), pickupId);
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw fail(400, '找不到这个音频文件，请检查完整路径。');
    const filePath = fs.realpathSync(sourcePath), ext = path.extname(originalName || filePath).toLowerCase();
    if (!extensions.has(ext)) throw fail(400, '支持 MP3、M4A、WAV、AAC、FLAC、OGG、WebM 和 AMR 音频。');
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_AUDIO || !stat.size) throw fail(400, '请添加非空且不超过200MB的录音。');
    const assetId = randomUUID(), previewPath = path.join(mediaDir, `${assetId}-voice.m4a`);
    let duration;
    try {
      const { stdout } = await run(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', filePath], { timeout: 20000, windowsHide: true });
      const info = JSON.parse(stdout); duration = Number(info.format?.duration);
      if (!info.streams?.some(s => s.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0 || duration > 3600) throw fail(400, '文件需要有效音轨，时长应在一小时以内。');
      await run(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', filePath, '-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', previewPath], { timeout: 120000, windowsHide: true });
      if (fs.statSync(filePath).size !== stat.size || fs.statSync(filePath).mtimeMs !== stat.mtimeMs) throw fail(409, '录音在导入期间发生变化，请重新添加。');
      return change(state => {
        const project = projectIn(state, projectId), item = target(project, pickupId), version = versionIn(project, item.versionId);
        const audio = { id: assetId, filePath, previewPath, originalName: String(originalName || path.basename(filePath)).slice(0, 240), size: stat.size, duration, uploaded, createdAt: stamp() };
        item.audios.push(audio); item.selectedAudioId = audio.id; item.updatedAt = stamp();
        record(project, 'pickup_audio_added', version, `添加补录音频：${audio.originalName}`);
        return audio;
      });
    } catch (error) {
      if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
      if (error.status) throw error;
      throw fail(400, '录音无法读取或转换，请检查文件；可导出为 MP3、M4A 或 WAV 后重试。');
    }
  }
  async function upload(projectId, pickupId, req, name) {
    target(projectIn(read(), projectId), pickupId);
    if (req.headers['x-review-client'] !== 'workbench') throw fail(403, '请从审片台添加录音。');
    const ext = path.extname(name).toLowerCase();
    if (!extensions.has(ext)) throw fail(400, '请选择支持的音频格式。');
    if (Number(req.headers['content-length']) > MAX_AUDIO) throw fail(413, '录音超过200MB，请先裁短。');
    const file = path.join(mediaDir, `${randomUUID()}-voice-original${ext}`);
    let bytes = 0;
    const limit = new Transform({ transform(chunk, encoding, done) { bytes += chunk.length; done(bytes > MAX_AUDIO ? fail(413, '录音超过200MB，请先裁短。') : null, chunk); } });
    try { await pipeline(req, limit, fs.createWriteStream(file, { flags: 'wx' })); return await addAudio(projectId, pickupId, file, name, true); }
    catch (error) { if (fs.existsSync(file)) fs.unlinkSync(file); throw error; }
  }
  function publicList(project, activeIds) {
    return (project.pickups || []).filter(x => activeIds.has(x.versionId)).map(x => ({ ...x, audios: x.audios.map(a => ({ ...a, available: fs.existsSync(a.filePath) && fs.existsSync(a.previewPath), url: `/pickup-audio/${a.id}` })) }));
  }
  function audioFile(assetId) {
    for (const project of read().projects) for (const item of project.pickups || []) {
      if (!project.versions.some(v => v.id === item.versionId && !v.removedAt)) continue;
      const audio = item.audios.find(a => a.id === assetId);
      if (audio) return audio.previewPath;
    }
    throw fail(404, '录音不存在或对应视频已移除。');
  }
  return { save, addAudio, upload, publicList, audioFile };
}
