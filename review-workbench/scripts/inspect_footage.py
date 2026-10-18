"""Create local contact sheets and concise technical metadata from a project snapshot."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")
p = argparse.ArgumentParser()
p.add_argument("snapshot")
p.add_argument("output_dir")
a = p.parse_args()
out = Path(a.output_dir)
out.mkdir(parents=True, exist_ok=True)
project = json.loads(Path(a.snapshot).read_text(encoding="utf-8-sig"))
clips = sorted((v for v in project["versions"] if v["stage"] == 3), key=lambda v: ((v.get("material") or v.get("mediaTime") or {}).get("sortAt", v["createdAt"]), v["originalName"]))
meta = []
for i, clip in enumerate(clips, 1):
    raw = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:stream_side_data=rotation:format=duration", "-of", "json", clip["filePath"]], encoding="utf-8")
    meta.append({"order": i, "versionId": clip["id"], **json.loads(raw)})
    interval = max(1, clip["duration"] / 8)
    vf = "fps=1/%f,scale=144:256:force_original_aspect_ratio=decrease,pad=144:256:(ow-iw)/2:(oh-ih)/2,drawtext=fontfile='C\\:/Windows/Fonts/consola.ttf':text='%%{pts\\:hms}':x=3:y=h-18:fontsize=11:fontcolor=white:box=1:boxcolor=black@0.7,tile=4x2:nb_frames=8" % interval
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1", "-i", clip["filePath"], "-an", "-vf", vf, "-frames:v", "1", "-q:v", "3", str(out / ("%02d_contact.jpg" % i))], check=True)
    print("contact", i, "ready", flush=True)
(out / "technical.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(meta, ensure_ascii=False), flush=True)
