"""Render a reviewed frame-aligned edit manifest locally with reproducible source maps."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
p = argparse.ArgumentParser()
p.add_argument("manifest")
p.add_argument("--threads", type=int, default=6)
a = p.parse_args()
manifest_path = Path(a.manifest).resolve()
plan = json.loads(manifest_path.read_text(encoding="utf-8"))
root = manifest_path.parent
parts = root / "parts"
parts.mkdir(exist_ok=True)
fps = int(plan.get("fps", 30))
width, height = plan.get("size", [720, 1280])
output = (root / plan["outputName"]).resolve()
if not plan["clips"]:
    raise ValueError("At least one source clip is required")
if any(output == Path(c["filePath"]).resolve() for c in plan["clips"]):
    raise ValueError("Output must not replace a source video")
timeline = []
cursor_frames = 0

def run_progress(command, log, total, label):
    with log.open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen(command + ["-progress", "pipe:1", "-nostats"], stdout=subprocess.PIPE, stderr=stderr, encoding="utf-8", errors="replace")
        last = -1
        for line in process.stdout:
            if line.startswith("out_time_us="):
                try:
                    pct = min(100, max(0, round(float(line.split("=", 1)[1]) / 1000000 / total * 100)))
                except ValueError:
                    continue
                if pct // 20 > last:
                    print(label, "%d%%" % pct, flush=True)
                    last = pct // 20
        if process.wait():
            raise RuntimeError("FFmpeg failed; inspect %s" % log)

for clip in plan["clips"]:
    source = Path(clip["filePath"])
    stat = source.stat()
    if stat.st_size != clip["sourceSize"] or stat.st_mtime_ns != clip["sourceMtimeNs"]:
        raise RuntimeError("Source changed before rendering: %s" % source.name)
    intervals = []
    for start, end in clip["keep"]:
        start_frame, end_frame = round(start * fps), round(end * fps)
        if start_frame < 0 or end_frame <= start_frame or end_frame / fps > clip["duration"] + 0.001:
            raise ValueError("Invalid keep interval")
        if intervals and start_frame < intervals[-1][1]:
            raise ValueError("Overlapping or unordered keep intervals")
        intervals.append((start_frame, end_frame))
        timeline.append({"versionId": clip["versionId"], "order": clip["order"], "sourceStart": start_frame / fps, "sourceEnd": end_frame / fps, "outputStart": cursor_frames / fps, "outputEnd": (cursor_frames + end_frame - start_frame) / fps})
        cursor_frames += end_frame - start_frame
    frames = sum(end - start for start, end in intervals)
    duration = frames / fps
    signature = hashlib.sha256(json.dumps({"clip": clip, "size": [width, height], "fps": fps}, sort_keys=True).encode()).hexdigest()
    part = parts / ("%02d.mkv" % clip["order"])
    signature_file = part.with_suffix(".sha256")
    clip["renderDuration"] = duration
    clip["part"] = str(part)
    if part.exists() and signature_file.exists() and signature_file.read_text() == signature:
        print("part", clip["order"], "cached", flush=True)
        continue
    count = len(intervals)
    filters = ["[0:v]split=%d%s" % (count, "".join("[v%d]" % i for i in range(count))), "[0:a]asplit=%d%s" % (count, "".join("[a%d]" % i for i in range(count)))]
    for i, (start, end) in enumerate(intervals):
        start, end = start / fps, end / fps
        d = end - start
        filters += ["[v%d]trim=start=%.9f:end=%.9f,setpts=PTS-STARTPTS[vt%d]" % (i, start, end, i), "[a%d]atrim=start=%.9f:end=%.9f,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008,afade=t=out:st=%.9f:d=0.008[at%d]" % (i, start, end, max(0, d - 0.008), i)]
    filters += ["%sconcat=n=%d:v=1:a=1[vc][ac]" % ("".join("[vt%d][at%d]" % (i, i) for i in range(count)), count), "[vc]fps=%d,scale=%d:%d:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vout]" % (fps, width, height, width, height), "[ac]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,apad=whole_dur=%.9f,atrim=end=%.9f[aout]" % (duration, duration)]
    graph = parts / ("%02d.ffscript" % clip["order"])
    graph.write_text(";\n".join(filters), encoding="utf-8")
    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-threads", str(a.threads), "-i", str(source), "-filter_complex_script", str(graph), "-map", "[vout]", "-map", "[aout]", "-frames:v", str(frames), "-t", "%.9f" % duration, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-profile:v", "high", "-level:v", "4.0", "-threads", str(a.threads), "-c:a", "pcm_s16le", str(part)]
    print("rendering part", clip["order"], "%.2f seconds" % duration, flush=True)
    run_progress(command, part.with_suffix(".log"), duration, "part %d" % clip["order"])
    signature_file.write_text(signature)

listing = root / "concat.ffconcat"
listing.write_text("ffconcat version 1.0\n" + "\n".join("file '%s'\nduration %.9f" % (Path(c["part"]).as_posix().replace("'", "'\\''"), c["renderDuration"]) for c in plan["clips"]), encoding="utf-8")
common = ["ffmpeg", "-hide_banner", "-nostdin", "-f", "concat", "-safe", "0", "-i", str(listing)]
measure = subprocess.run(common + ["-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json", "-f", "null", "-"], check=True, capture_output=True, encoding="utf-8", errors="replace")
matches = re.findall(r'\{\s*"input_i".*?\}', measure.stderr, re.S)
if not matches:
    raise RuntimeError("Loudness measurement missing")
loudness = json.loads(matches[-1])
(root / "loudness-input.json").write_text(json.dumps(loudness, indent=2), encoding="utf-8")
norm = "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true" % (loudness["input_i"], loudness["input_tp"], loudness["input_lra"], loudness["input_thresh"], loudness["target_offset"])
command = common + ["-loglevel", "warning", "-y", "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", norm, "-ar", "48000", "-ac", "1", "-c:a", "aac", "-b:a", "128k", "-video_track_timescale", "90000", "-movflags", "+faststart", str(output)]
print("joining and normalizing", flush=True)
run_progress(command, root / "final-render.log", cursor_frames / fps, "final")
result = {"output": str(output), "plannedDuration": cursor_frames / fps, "fps": fps, "size": [width, height], "timeline": timeline, "clips": plan["clips"]}
(root / "render-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print("RENDER_COMPLETE", str(output), "%.3f" % (cursor_frames / fps), flush=True)
