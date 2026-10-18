"""Render proofread styled captions and restrained effects over an accepted cut.

Project manifests/media stay outside Git. This tool never changes workspace review.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ], encoding='utf-8'))


def audio_hash(path):
    return subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0',
        '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'
    ], encoding='utf-8').strip()


def timestamp(seconds, ass=False):
    unit = 100 if ass else 1000
    number = round(seconds * unit)
    hour, number = divmod(number, 3600 * unit)
    minute, number = divmod(number, 60 * unit)
    second, fraction = divmod(number, unit)
    return ('%d:%02d:%02d.%02d' if ass else '%02d:%02d:%02d,%03d') % (
        hour, minute, second, fraction)


def literal(text):
    # Captions are literal text, never arbitrary ASS override instructions.
    return str(text).replace('\\', '\uff3c').replace('{', '\uff5b').replace('}', '\uff5d')


def build_captions(plan, root, duration):
    width, height = plan.get('size', [720, 1280])
    scale = width / 720
    theme = plan.get('theme', {})
    font = theme.get('font', 'Microsoft YaHei')
    assert not any(c in font for c in ',\r\n'), 'Invalid font name'
    main = theme.get('fontSize', round(56 * scale))
    emphasis = theme.get('highlightSize', round(60 * scale))
    bottom = theme.get('marginBottom', round(88 * height / 1280))
    colors = {'yellow': '&H0069DEFF&', 'coral': '&H0097B7FF&', 'blue': '&H00FFE0A4&'}
    header = '[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\n' % (width, height)
    header += 'WrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n'
    header += ('Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, '
               'BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, '
               'BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n')
    for name, color in [('Main', '&H00FFFFFF'), ('Quote', '&H00FFE0A4')]:
        header += ('Style: %s,%s,%s,%s,&H00FFFFFF,&H001A1720,&H70000000,'
                   '-1,0,0,0,100,100,0,0,1,%.2f,%.2f,2,%d,%d,%d,1\n') % (
                       name, font, main, color, 3.2 * scale, 1.6 * scale,
                       round(36 * scale), round(36 * scale), bottom)
    header += '\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    events, srt = [], []
    last = 0
    for index, cue in enumerate(plan.get('captions', []), 1):
        start, end = float(cue['start']), float(cue['end'])
        lines = cue['lines']
        assert 0 <= last <= start < end <= duration + .001, 'Caption order/range invalid'
        assert 1 <= len(lines) <= 2 and all(isinstance(x, str) and x for x in lines)
        assert max(map(len, lines)) <= theme.get('maxCharsPerLine', 11), 'Caption line too long'
        assert all('\n' not in line and '\r' not in line for line in lines)
        last = end
        style = 'Quote' if cue.get('style') == 'quote' else 'Main'
        text = r'\N'.join(literal(line) for line in lines)
        term = cue.get('emphasis', '')
        if term:
            assert term in ''.join(lines), 'Emphasis absent from cue'
            escaped = literal(term)
            if escaped in text:
                color = colors[cue.get('color', 'yellow')]
                text = text.replace(escaped, r'{\c%s\fs%s}%s{\r%s}' % (
                    color, emphasis, escaped, style), 1)
        prefix = r'{\fad(70,100)}'
        if cue.get('animate'):
            prefix = r'{\fad(50,100)\fscx94\fscy94\t(0,110,\fscx100\fscy100)}'
        events.append('Dialogue: 2,%s,%s,%s,,0,0,0,,%s%s' % (
            timestamp(start, True), timestamp(end, True), style, prefix, text))
        srt.append('%d\n%s --> %s\n%s' % (
            index, timestamp(start), timestamp(end), '\n'.join(lines)))
    for overlay in plan.get('overlays', []):
        start, end = overlay['start'], overlay['end']
        assert 0 <= start < end <= duration + .001
        assert 1 <= len(overlay['lines']) <= 2
        x, y = overlay.get('position', [width / 2, 160 * height / 1280])
        assert 0 <= x <= width and 0 <= y <= height
        size = overlay.get('fontSize', round(43 * scale))
        text = r'\N'.join(literal(x) for x in overlay['lines'])
        events.append('Dialogue: 3,%s,%s,Main,,0,0,0,,{\an8\pos(%s,%s)\fs%s\fad(140,180)}%s' % (
            timestamp(start, True), timestamp(end, True), x, y, size, text))
    (root / 'finish-captions.ass').write_text(header + '\n'.join(events) + '\n', encoding='utf-8-sig')
    (root / 'finish-captions.srt').write_text('\n\n'.join(srt) + '\n', encoding='utf-8-sig')


def finish(manifest, threads=6):
    manifest = Path(manifest).resolve()
    root = manifest.parent
    plan = json.loads(manifest.read_text(encoding='utf-8-sig'))
    fps = int(plan.get('fps', 30))
    width, height = plan.get('size', [720, 1280])
    output = (root / plan['outputName']).resolve()
    assert output.parent == root and output.suffix == '.mp4', 'Output must be a new local MP4'
    assert not output.exists(), 'Never overwrite an existing video'
    inputs = {}
    for item in plan['inputs']:
        path = Path(item['filePath']).resolve()
        assert path != output and sha256(path) == item['sha256'], 'An input changed'
        inputs[path] = item['sha256']
    audio = Path(plan['audioFile']).resolve()
    assert audio in inputs, 'Accepted audio source must have a verified hash'
    audio_info = next(s for s in probe(audio)['streams'] if s['codec_type'] == 'audio')
    assert audio_info['codec_name'] == 'aac', 'This stream-copy workflow expects AAC audio'
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-nostdin', '-n',
               '-filter_complex_threads', '4']
    filters, mapping, cursor, count = [], [], 0.0, 0
    for i, segment in enumerate(plan['segments']):
        source = Path(segment['filePath']).resolve()
        assert source in inputs, 'Every picture input needs a verified hash'
        seconds = float(segment['duration'])
        frames = round(seconds * fps)
        assert frames > 0 and abs(seconds - frames / fps) < .0001, 'Use frame-aligned durations'
        if segment['kind'] == 'copy':
            assert segment.get('start', 0) >= 0
            command += ['-threads', str(threads), '-ss', str(segment.get('start', 0)), '-i', str(source)]
        elif segment['kind'] == 'still':
            command += ['-loop', '1', '-framerate', str(fps), '-i', str(source)]
        else:
            raise ValueError('Unknown picture segment kind')
        filters.append(('[%d:v]fps=%d,trim=end_frame=%d,setpts=PTS-STARTPTS,'
                        'scale=%d:%d:force_original_aspect_ratio=decrease,'
                        'pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1[s%d]') % (
                            i, fps, frames, width, height, width, height, i))
        mapping.append({**segment, 'outputStart': cursor, 'outputEnd': cursor + seconds})
        cursor += seconds
        count += frames
    assert count and abs(float(audio_info['duration']) - cursor) < .05, 'Audio/timeline duration mismatch'
    build_captions(plan, root, cursor)
    zoom = '1'
    for effect in plan.get('pushIns', []):
        start, end, amount = effect['start'], effect['end'], effect.get('amount', .026)
        assert 0 <= start < end <= cursor and 0 < amount <= .1
        a, b = round(start * fps), round(end * fps)
        assert a < b
        zoom += '+%s*if(between(in,%d,%d),sin((in-%d)*PI/%d),0)' % (amount, a, b, a, b-a)
    filters.append((''.join('[s%d]' % i for i in range(len(mapping)))) +
                   'concat=n=%d:v=1:a=0,zoompan=z=\'%s\':x=\'iw/2-iw/zoom/2\':' % (len(mapping), zoom) +
                   'y=\'ih-ih/zoom\':d=1:s=%dx%d:fps=%d,ass=finish-captions.ass[v]' % (width, height, fps))
    cache = root / '.cache' / ('finish-' + output.stem)
    cache.mkdir(parents=True, exist_ok=True)
    picture = cache / 'picture.mp4'
    assert not picture.exists(), 'Inspect the previous render cache before retrying'
    filter_file = cache / 'filter.txt'
    filter_file.write_text(';'.join(filters), encoding='utf-8')
    command += ['-filter_complex_script', str(filter_file), '-map', '[v]', '-an',
                '-frames:v', str(count), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19',
                '-pix_fmt', 'yuv420p', '-threads', str(threads), str(picture)]
    with (cache / 'render.log').open('w', encoding='utf-8') as log:
        subprocess.run(command, cwd=str(root), stdout=log, stderr=log, check=True)
    # Mux all accepted audio packets after rendering; do not use a frame/time limit here.
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-n', '-i', str(picture), '-i', str(audio),
                    '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-video_track_timescale', '90000',
                    '-movflags', '+faststart', str(output)], check=True)
    video_info = next(s for s in probe(output)['streams'] if s['codec_type'] == 'video')
    assert int(video_info['nb_frames']) == count
    assert abs(float(video_info['duration']) - cursor) < .05
    assert audio_hash(output) == audio_hash(audio), 'Accepted audio stream changed'
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(output),
                    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], check=True)
    for path, expected in inputs.items():
        assert sha256(path) == expected, 'Input changed during rendering'
    result = {'output': str(output), 'plannedDuration': cursor, 'fps': fps, 'size': [width, height],
              'clips': plan.get('clips', []), 'inputs': plan['inputs'], 'timeline': mapping,
              'fullDecodePassed': True, 'audioStreamUnchanged': True, 'frameCount': count,
              'captionCues': len(plan.get('captions', [])), 'reviewStatus': 'not-modified'}
    # Only our own, just-validated picture intermediate is discarded, never imported media.
    picture.unlink()
    result['temporaryPictureRemoved'] = True
    (root / 'finish-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--threads', type=int, default=6)
    args = parser.parse_args()
    print(json.dumps(finish(args.manifest, args.threads), ensure_ascii=False))
