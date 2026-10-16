"""Create an explicitly labelled synthetic review project. Requires Pillow and ffmpeg."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime, timezone
import json
import math
import shutil
import subprocess
import os

root = Path(os.environ.get('REVIEW_DATA_DIR', r'C:\disk\self-space\self-media\审片台'))
media = root / 'media'
frames = root / 'demo-frames'
media.mkdir(parents=True, exist_ok=True)
frames.mkdir(parents=True, exist_ok=True)
font_path = r'C:\Windows\Fonts\msyh.ttc'
font = lambda size: ImageFont.truetype(font_path, size)
sections = [('先把矛盾说清楚', '研究时相信规则，下跌时却想改规则。'),
            ('给出自己的判断', '我想先分清：规则失效，还是执行困难。'),
            ('用理由回应问题', '回看依据、观察条件，再解释这次选择。'),
            ('让结尾回应开头', '这期只讲清一个问题，留下一个判断。')]
for n in range(72):
    t = n / 4
    image = Image.new('RGB', (1280, 720), '#1c2229')
    draw = ImageDraw.Draw(image)
    for y in range(720):
        a = y / 720
        draw.line((0, y, 1280, y), fill=(int(27 - a * 8), int(34 - a * 9), int(42 - a * 10)))
    draw.rounded_rectangle((50, 42, 165, 76), radius=6, fill='#3e3329')
    draw.text((67, 48), '演示素材', font=font(16), fill='#e4b386')
    draw.text((190, 50), 'REVIEW WORKBENCH / STUDIO NOTES', font=font(15), fill='#8694a5')
    draw.line((50, 103, 1230, 103), fill='#3b4652', width=1)
    draw.text((67, 145), '策略短期跑输，', font=font(49), fill='#f0ede6')
    draw.text((67, 212), '我为什么还在执行？', font=font(49), fill='#e7b487')
    draw.text((68, 304), '个人复盘  /  观点口播  /  16:9', font=font(17), fill='#8b99a9')
    section = min(int(t // 4.5), 3)
    draw.rounded_rectangle((65, 390, 760, 557), radius=14, fill='#252d36', outline='#3e4956', width=1)
    draw.text((91, 414), f'0{section + 1}  {sections[section][0]}', font=font(23), fill='#e7bd96')
    draw.text((91, 466), sections[section][1], font=font(21), fill='#c3cbd4')
    draw.rounded_rectangle((835, 146, 1212, 558), radius=17, fill='#252d35', outline='#45505b')
    draw.text((867, 174), '预期与现实', font=font(24), fill='#d5dbe1')
    for index, (label, body, color) in enumerate([('研究时', '按规则执行', '#97baa8'), ('下跌时', '忍不住想改', '#d7ac83')]):
        top = 245 + index * 130
        draw.rounded_rectangle((867, top, 1179, top + 96), radius=10, fill='#1b242c')
        draw.text((886, top + 14), label, font=font(15), fill='#8896a4')
        draw.text((886, top + 44), body, font=font(26), fill=color)
        width = 50 + int((math.sin(t * .65 + index) + 1) * 22)
        draw.rounded_rectangle((1090, top + 53, 1090 + width, top + 59), radius=3, fill=color)
    draw.text((67, 608), '演示视频 · 仅用于体验播放、批注和阶段审核', font=font(18), fill='#718195')
    draw.text((1118, 608), f'{t:04.1f}s', font=font(20), fill='#b7a38b')
    draw.rounded_rectangle((67, 663, 1212, 666), radius=1, fill='#303c48')
    draw.rounded_rectangle((67, 663, 67 + int(1145 * (n + 1) / 72), 666), radius=1, fill='#d7a778')
    image.save(frames / f'{n:03d}.png')

versions = []
stamp = datetime.now(timezone.utc).isoformat()
for stage, name, duration in [(3, '原片 v1', 18), (4, '粗剪 v1', 16), (5, '精剪 v2', 14)]:
    video_id = f'demo-{stage}'
    target = media / f'{video_id}.mp4'
    if not target.exists():
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '4', '-i', str(frames / '%03d.png'),
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-t', str(duration),
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', '24', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-movflags', '+faststart', '-shortest', str(target)], check=True)
    poster = media / f'{video_id}.jpg'
    with Image.open(frames / ('022.png' if stage == 5 else '006.png')) as source:
        source.resize((640, 360)).save(poster, quality=90)
    versions.append({'id': video_id, 'label': name, 'stage': stage, 'filePath': str(target), 'originalName': f'演示-{name}.mp4',
        'size': target.stat().st_size, 'duration': duration, 'width': 1280, 'height': 720, 'posterPath': str(poster),
        'createdAt': stamp, 'review': {'status': 'pending', 'note': '', 'at': None}})

state_file = root / 'workspace.json'
state = json.loads(state_file.read_text(encoding='utf-8-sig')) if state_file.exists() else {'schemaVersion': 1, 'revision': 0, 'updatedAt': stamp, 'projects': []}
if not any(p['id'] == 'demo-project' for p in state['projects']):
    state['projects'].append({'id': 'demo-project', 'title': '策略跑输了，我为什么还在坚持？',
        'brief': '体验项目：切换视频版本，在具体时间点留下意见，再完成一次阶段审核。所有画面均为演示素材。',
        'demo': True, 'createdAt': stamp, 'updatedAt': stamp, 'versions': versions,
        'comments': [{'id': 'demo-note', 'versionId': 'demo-4', 'time': 4.5, 'end': 7.0, 'text': '这里的观点可以再直接一点。先给判断，再解释理由，让观众更容易跟上。',
            'category': '内容', 'resolved': False, 'demo': True, 'createdAt': stamp, 'updatedAt': stamp}],
        'history': [{'id': 'demo-created', 'at': stamp, 'action': 'version_added', 'versionId': 'demo-4', 'stage': 4, 'detail': '创建演示项目：原片、粗剪、精剪三个可播放版本。'}]})
    state['revision'] += 1
    state['updatedAt'] = stamp
    state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
for frame in frames.glob('*.png'):
    frame.unlink()
print(json.dumps({'demoCreated': True, 'dataDir': str(root), 'versions': len(versions)}, ensure_ascii=True))
