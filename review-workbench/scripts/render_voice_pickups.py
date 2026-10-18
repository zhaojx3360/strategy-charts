"""Render local freeze-frame voice replacements from a reviewed, frame-aligned plan."""
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
manifest = Path(a.manifest).resolve()
root = manifest.parent
plan = json.loads(manifest.read_text(encoding="utf-8"))
fps = int(plan.get("fps", 30))
output = (root / plan["outputName"]).resolve()
parts = root / "voice-parts"
parts.mkdir(exist_ok=True)
base = Path(plan["baseFile"])
assert output != base.resolve()
for item in plan["inputs"]:
    source = Path(item["filePath"])
    assert source.resolve() != output
    digest = hashlib.sha256()
    with source.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != item["sha256"]:
        raise RuntimeError("An input changed before rendering")

def run(command, label, duration):
    with (parts / (label + ".log")).open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(command + ["-progress", "pipe:1", "-nostats"], cwd=str(root), stdout=subprocess.PIPE, stderr=log, encoding="utf-8", errors="replace")
        last = -1
        for line in proc.stdout:
            if line.startswith("out_time_us="):
                progress = min(100, round(float(line.split("=", 1)[1]) / 1000000 / duration * 100))
                if progress // 20 > last:
                    print(label, str(progress) + "%", flush=True)
                    last = progress // 20
        if proc.wait():
            raise RuntimeError("FFmpeg failed; inspect " + label + ".log")

encoding = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-threads", str(a.threads), "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1"]
listing = []
cursor = 0.0
version_map = []
for index, segment in enumerate(plan["segments"], 1):
    target = parts / ("%02d.mkv" % index)
    label = "part-%02d" % index
    duration = round(segment["duration"] * fps) / fps
    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-threads", str(a.threads)]
    if segment["kind"] == "copy":
        command += ["-ss", str(segment["baseStart"]), "-i", str(base), "-t", str(duration), "-map", "0:v:0", "-map", "0:a:0", "-vf", "setpts=PTS-STARTPTS,fps=%d,setsar=1" % fps, "-af", "asetpts=PTS-STARTPTS,apad=whole_dur=%.9f,atrim=end=%.9f,afade=t=in:d=0.008,afade=t=out:st=%.9f:d=0.008" % (duration, duration, duration - .008)]
    elif segment["kind"] == "freeze_voice":
        voice = Path(segment["audioFile"])
        wave = parts / ("%02d-voice.wav" % index)
        trim = "atrim=start=%.9f:end=%.9f,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=mono" % (segment["audioStart"], segment["audioEnd"])
        measurement = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(voice), "-vn", "-af", trim + ",loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json", "-f", "null", "-"], check=True, capture_output=True, encoding="utf-8", errors="replace")
        stats = json.loads(re.findall(r'\{\s*"input_i".*?\}', measurement.stderr, re.S)[-1])
        normalize = "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true" % (stats["input_i"], stats["input_tp"], stats["input_lra"], stats["input_thresh"], stats["target_offset"])
        subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(voice), "-af", trim + "," + normalize + ",afade=t=in:d=0.012,afade=t=out:st=%.9f:d=0.012" % (duration - .012), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wave)], check=True)
        (parts / ("%02d-loudness.json" % index)).write_text(json.dumps(stats, indent=2), encoding="utf-8")
        command += ["-loop", "1", "-framerate", str(fps), "-i", str(root / segment["freezeFile"]), "-i", str(wave), "-t", str(duration), "-map", "0:v:0", "-map", "1:a:0", "-vf", "setsar=1,ass=filename=" + segment["subtitleFile"], "-af", "apad=whole_dur=%.9f,atrim=end=%.9f" % (duration, duration)]
    else:
        raise ValueError("Unknown segment kind")
    command += ["-frames:v", str(round(duration * fps)), *encoding, str(target)]
    run(command, label, duration)
    listing.append("file '%s'\nduration %.9f" % (target.as_posix().replace("'", "'\\''"), duration))
    version_map.append({**segment, "outputStart": cursor, "outputEnd": cursor + duration})
    cursor += duration

concat = root / "voice-concat.ffconcat"
concat.write_text("ffconcat version 1.0\n" + "\n".join(listing), encoding="utf-8")
command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "1", "-video_track_timescale", "90000", "-movflags", "+faststart", str(output)]
run(command, "final", cursor)
result = {"output": str(output), "plannedDuration": cursor, "fps": fps, "size": plan["size"], "clips": plan["sourceClips"], "inputs": plan["inputs"], "timeline": version_map, "baseVersionId": plan["baseVersionId"], "requestedVersionId": plan["requestedVersionId"]}
(root / "render-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print("COMPLETE", str(output), "%.3f" % cursor, flush=True)
