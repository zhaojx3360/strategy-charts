"""Decode a rendered cut, measure audio, and verify that every source is unchanged."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
p = argparse.ArgumentParser()
p.add_argument("render_result")
a = p.parse_args()
result_path = Path(a.render_result)
result = json.loads(result_path.read_text(encoding="utf-8"))
output = result["output"]
probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", output], encoding="utf-8"))
video = next(s for s in probe["streams"] if s["codec_type"] == "video")
audio = next(s for s in probe["streams"] if s["codec_type"] == "audio")
assert video["codec_name"] == "h264" and audio["codec_name"] == "aac"
assert [video["width"], video["height"]] == result["size"]
assert abs(float(probe["format"]["duration"]) - result["plannedDuration"]) < 0.15
assert abs(float(video["duration"]) - float(audio["duration"])) < 0.15
decode = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-xerror", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], capture_output=True, encoding="utf-8", errors="replace")
if decode.returncode or decode.stderr.strip():
    raise RuntimeError("Full decode failed: " + decode.stderr[-2000:])
measure = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", output, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json", "-f", "null", "-"], check=True, capture_output=True, encoding="utf-8", errors="replace")
match = re.findall(r'\{\s*"input_i".*?\}', measure.stderr, re.S)
loudness = json.loads(match[-1])
assert abs(float(loudness["input_i"]) + 16) < 0.6, loudness
assert float(loudness["input_tp"]) <= -0.7, loudness
source_checks = []
for clip in result["clips"]:
    digest = hashlib.sha256()
    with Path(clip["filePath"]).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    unchanged = digest.hexdigest() == clip["sourceSha256"]
    assert unchanged, "Source file changed"
    source_checks.append({"versionId": clip["versionId"], "sha256Unchanged": unchanged})
input_checks = []
for item in result.get("inputs", []):
    digest = hashlib.sha256()
    with Path(item["filePath"]).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    assert digest.hexdigest() == item["sha256"], "A cut or voice input changed"
    input_checks.append({"filePath": item["filePath"], "sha256Unchanged": True})
check = {"fullDecodePassed": True, "expectedDuration": result["plannedDuration"], "actualDuration": float(probe["format"]["duration"]), "videoDuration": float(video["duration"]), "audioDuration": float(audio["duration"]), "width": video["width"], "height": video["height"], "fps": video["avg_frame_rate"], "videoCodec": video["codec_name"], "audioCodec": audio["codec_name"], "audioSampleRate": audio["sample_rate"], "channels": audio["channels"], "loudness": loudness, "sourceChecks": source_checks, "bytes": Path(output).stat().st_size}
destination = result_path.parent / "validation.json"
check["inputChecks"] = input_checks
destination.write_text(json.dumps(check, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(check, ensure_ascii=False), flush=True)
