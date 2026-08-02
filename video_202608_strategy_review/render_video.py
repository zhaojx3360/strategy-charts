from __future__ import annotations

import argparse
import json
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parent
FPS = 30
TRANSITION_SECONDS = 0.6


@dataclass(frozen=True)
class Highlight:
    x: int
    y: int
    width: int
    height: int
    start: float
    end: float
    color: str


HIGHLIGHTS: dict[str, tuple[Highlight, ...]] = {
    "01-": (
        Highlight(90, 255, 1195, 320, 2.0, 14.0, "D64541"),
        Highlight(90, 610, 1195, 235, 21.0, 33.0, "2C7FB8"),
        Highlight(90, 880, 1195, 105, 42.0, 51.0, "D69422"),
    ),
    "11-": (
        Highlight(90, 245, 950, 605, 1.0, 6.0, "2C7FB8"),
        Highlight(1090, 245, 740, 605, 6.0, 11.5, "7E57C2"),
        Highlight(90, 880, 1740, 105, 11.5, 16.2, "D69422"),
    ),
    "10-": (
        Highlight(90, 825, 830, 160, 1.0, 5.5, "D64541"),
        Highlight(970, 825, 830, 160, 5.5, 9.5, "2C7FB8"),
        Highlight(155, 210, 1660, 550, 9.5, 13.5, "D64541"),
    ),
    "06-": (
        Highlight(90, 820, 330, 160, 1.0, 5.5, "2C7FB8"),
        Highlight(442, 820, 330, 160, 5.5, 10.0, "7E57C2"),
        Highlight(794, 820, 330, 160, 10.0, 14.5, "D64541"),
        Highlight(1146, 820, 330, 160, 14.5, 19.0, "2E9D57"),
        Highlight(1498, 820, 330, 160, 19.0, 24.0, "E67E22"),
        Highlight(155, 230, 1645, 525, 25.0, 44.0, "667079"),
    ),
    "07-": (
        Highlight(90, 270, 540, 630, 1.0, 12.5, "2C7FB8"),
        Highlight(680, 270, 540, 630, 12.5, 25.0, "7E57C2"),
        Highlight(1270, 270, 540, 630, 25.0, 39.0, "2E9D57"),
    ),
    "12-": (
        Highlight(90, 260, 820, 295, 1.0, 12.0, "2C7FB8"),
        Highlight(970, 260, 820, 295, 12.0, 24.0, "7E57C2"),
        Highlight(90, 610, 820, 295, 24.0, 36.0, "2E9D57"),
        Highlight(970, 610, 820, 295, 36.0, 49.0, "D64541"),
    ),
}


def audio_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as reader:
        return reader.getnframes() / reader.getframerate()


def highlight_filters(filename: str) -> list[str]:
    filters: list[str] = []
    for prefix, highlights in HIGHLIGHTS.items():
        if not filename.startswith(prefix):
            continue
        for item in highlights:
            filters.append(
                "drawbox="
                f"x={item.x}:y={item.y}:w={item.width}:h={item.height}:"
                f"color=0x{item.color}@0.88:t=6:"
                f"enable='between(t,{item.start:.2f},{item.end:.2f})'"
            )
    return filters


def scene_filter(index: int, filename: str, duration: float) -> str:
    frames = max(1, round((duration + TRANSITION_SECONDS) * FPS))
    zoom_step = 0.020 / frames
    if index % 3 == 0:
        x_expr = "(iw-iw/zoom)*(on/{frames})".format(frames=frames)
    elif index % 3 == 1:
        x_expr = "(iw-iw/zoom)*(1-on/{frames})".format(frames=frames)
    else:
        x_expr = "iw/2-(iw/zoom/2)"
    filters = [
        "zoompan="
        f"z='min(1.020,zoom+{zoom_step:.10f})':"
        f"x='{x_expr}':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps={FPS}",
        "setsar=1",
        "format=yuv420p",
        *highlight_filters(filename),
    ]
    return f"[{index}:v]" + ",".join(filters) + f"[scene{index}]"


def build_filter_graph(scenes: list[dict[str, object]]) -> str:
    chains = [
        scene_filter(index, Path(str(scene["file"])).name, float(scene["duration_seconds"]))
        for index, scene in enumerate(scenes)
    ]
    current = "scene0"
    elapsed = float(scenes[0]["duration_seconds"])
    for index in range(1, len(scenes)):
        output = f"mix{index}"
        chains.append(
            f"[{current}][scene{index}]xfade=transition=fade:"
            f"duration={TRANSITION_SECONDS:.2f}:offset={elapsed:.2f}[{output}]"
        )
        current = output
        elapsed += float(scenes[index]["duration_seconds"])
    chains.append(f"[{current}]fps={FPS},format=yuv420p[vout]")
    return ";".join(chains)


def render(
    scenes: list[dict[str, object]],
    audio: Path,
    output: Path,
    encoder: str,
    preview_seconds: float | None,
) -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, "-hide_banner", "-y"]
    for scene in scenes:
        duration = float(scene["duration_seconds"]) + TRANSITION_SECONDS
        image_path = ROOT / str(scene["file"])
        command.extend(
            ["-loop", "1", "-framerate", str(FPS), "-t", f"{duration:.3f}", "-i", str(image_path)]
        )
    command.extend(["-i", str(audio), "-filter_complex", build_filter_graph(scenes)])
    command.extend(["-map", "[vout]", "-map", f"{len(scenes)}:a:0"])
    if preview_seconds is not None:
        command.extend(["-t", f"{preview_seconds:.3f}"])
    else:
        command.extend(["-t", f"{audio_duration(audio):.3f}"])
    if encoder == "qsv":
        command.extend(
            [
                "-c:v",
                "h264_qsv",
                "-preset",
                "medium",
                "-global_quality",
                "21",
                "-look_ahead",
                "0",
            ]
        )
    else:
        command.extend(["-c:v", "libx264", "-preset", "medium", "-crf", "20"])
    command.extend(
        [
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            str(output),
        ]
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the strategy-review video from the final storyboard.")
    parser.add_argument("audio", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--manifest", type=Path, default=ROOT / "asset_manifest.json")
    parser.add_argument("--encoder", choices=("qsv", "x264"), default="qsv")
    parser.add_argument("--preview-seconds", type=float)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    scenes = manifest["scenes"]
    render(scenes, args.audio.resolve(), args.output.resolve(), args.encoder, args.preview_seconds)


if __name__ == "__main__":
    main()
