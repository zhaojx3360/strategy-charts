"""Inspect and transcribe a saved workbench project locally; never modify sources."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8")
parser = argparse.ArgumentParser()
parser.add_argument("snapshot")
parser.add_argument("output_dir")
parser.add_argument("--model", default="small")
parser.add_argument("--threads", type=int, default=8)
parser.add_argument("--prompt", default="简体中文普通话。")
args = parser.parse_args()
out = Path(args.output_dir)
out.mkdir(parents=True, exist_ok=True)
project = json.loads(Path(args.snapshot).read_text(encoding="utf-8-sig"))
clips = sorted((v for v in project["versions"] if v["stage"] == 3), key=lambda v: ((v.get("material") or v.get("mediaTime") or {}).get("sortAt", v["createdAt"]), v["originalName"]))
from faster_whisper import WhisperModel
print("Loading cached local model", args.model, flush=True)
model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=args.threads, local_files_only=True)
for index, clip in enumerate(clips, 1):
    stem = "%02d_%s" % (index, clip["id"])
    destination = out / (stem + ".json")
    source = clip["filePath"]
    stat = Path(source).stat()
    fingerprint = {"size": stat.st_size, "mtimeNs": stat.st_mtime_ns, "model": args.model, "prompt": args.prompt}
    if destination.exists():
        previous = json.loads(destination.read_text(encoding="utf-8"))
        if previous.get("fingerprint") == fingerprint:
            print(index, "cached", destination.name, flush=True)
            continue
    probe = subprocess.run([os.getenv("FFPROBE_PATH", "ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", source], check=True, capture_output=True, encoding="utf-8")
    silence = subprocess.run([os.getenv("FFMPEG_PATH", "ffmpeg"), "-hide_banner", "-nostdin", "-i", source, "-vn", "-af", "silencedetect=noise=-35dB:d=0.35", "-f", "null", "-"], capture_output=True, encoding="utf-8", errors="replace", check=True)
    intervals, start = [], None
    for line in silence.stderr.splitlines():
        match = re.search(r"silence_start: ([0-9.]+)", line)
        if match:
            start = float(match.group(1))
        match = re.search(r"silence_end: ([0-9.]+)", line)
        if match and start is not None:
            intervals.append([start, float(match.group(1))])
            start = None
    if start is not None:
        intervals.append([start, clip["duration"]])
    begin = time.monotonic()
    print(index, "transcribing", round(clip["duration"], 1), "seconds", flush=True)
    segments, info = model.transcribe(source, language="zh", beam_size=5, word_timestamps=True, vad_filter=True, vad_parameters={"min_silence_duration_ms": 400}, condition_on_previous_text=False, initial_prompt=args.prompt)
    transcript = []
    for segment in segments:
        transcript.append({"start": segment.start, "end": segment.end, "text": segment.text, "avg_logprob": segment.avg_logprob, "words": [{"start": w.start, "end": w.end, "word": w.word, "probability": w.probability} for w in (segment.words or [])]})
        print("  ", index, round(segment.end, 1), "s", flush=True)
    record = {"versionId": clip["id"], "order": index, "filePath": source, "duration": clip["duration"], "probe": json.loads(probe.stdout), "silences": intervals, "segments": transcript, "model": args.model, "fingerprint": fingerprint, "language_probability": info.language_probability}
    destination.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / (stem + ".txt")).write_text("\n".join("[%07.2f-%07.2f] %s" % (s["start"], s["end"], s["text"]) for s in transcript), encoding="utf-8")
    print(index, "finished in", round(time.monotonic() - begin, 1), "s", flush=True)
