from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source" / "真实账户近一年.jpg"
OUTPUT = ROOT / "封面-入市八年交易体系.png"

W, H = 1920, 1080
BG = "#101419"
PANEL = "#1B222A"
INK = "#F7F8F6"
MUTED = "#AEB7BF"
RED = "#F04B43"
GREEN = "#46B875"
AMBER = "#F0B44A"
FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size=size)


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, text_font, fill: str) -> None:
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), text, font=text_font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    draw.text(
        (left + (right - left - width) / 2, top + (bottom - top - height) / 2 - bounds[1]),
        text,
        font=text_font,
        fill=fill,
    )


def screenshot_card() -> Image.Image:
    screenshot = Image.open(SOURCE).convert("RGB")
    screenshot.thumbnail((430, 900), Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (screenshot.width + 24, screenshot.height + 24), "#F7F8F6")
    frame.paste(screenshot, (12, 12))
    return frame.rotate(-2.2, expand=True, resample=Image.Resampling.BICUBIC, fillcolor=PANEL)


def main() -> None:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    draw.polygon([(1260, 0), (1920, 0), (1920, 1080), (1080, 1080)], fill=PANEL)
    for y in range(160, 980, 120):
        draw.line((1120, y, 1920, y), fill="#2B333C", width=1)
    for x in range(1180, 1920, 150):
        draw.line((x, 0, x, 1080), fill="#252D35", width=1)

    chart_points = [
        (70, 930),
        (245, 870),
        (410, 900),
        (570, 790),
        (730, 825),
        (900, 710),
        (1080, 750),
        (1240, 610),
        (1390, 665),
        (1550, 520),
        (1710, 575),
        (1880, 430),
    ]
    chart_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    chart_draw = ImageDraw.Draw(chart_layer)
    chart_draw.line(chart_points, fill=(240, 75, 67, 52), width=12, joint="curve")
    image = Image.alpha_composite(image.convert("RGBA"), chart_layer).convert("RGB")
    draw = ImageDraw.Draw(image)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((1360, 80, 1845, 1015), radius=24, fill=(0, 0, 0, 155))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    image = Image.alpha_composite(image.convert("RGBA"), shadow).convert("RGB")
    card = screenshot_card()
    image.paste(card, (1375, 70))
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle((104, 92, 470, 148), radius=7, fill=RED)
    centered_text(draw, (104, 92, 470, 148), "一个普通投资者的八年", font(27, True), INK)

    draw.text((98, 205), "近一年只赚", font=font(78, True), fill=INK)
    draw.text((88, 300), "2.70%", font=font(202, True), fill=RED)
    draw.text((98, 555), "我却终于有了体系", font=font(78, True), fill=INK)
    draw.text((102, 670), "从追涨杀跌，到用规则约束自己", font=font(39), fill=MUTED)

    tags = [
        ("2018 入市", GREEN),
        ("7 套策略", AMBER),
        ("回测 · 实盘 · 推翻 · 改进", RED),
    ]
    x = 102
    for text, color in tags:
        text_font = font(29, True)
        bounds = draw.textbbox((0, 0), text, font=text_font)
        width = bounds[2] - bounds[0] + 44
        draw.rounded_rectangle((x, 790, x + width, 854), radius=7, outline=color, width=3, fill="#151B21")
        centered_text(draw, (x, 790, x + width, 854), text, text_font, color)
        x += width + 20

    draw.rectangle((0, 1038, W, H), fill=RED)
    draw.text((98, 995), "一个普通投资者的交易体系复盘", font=font(27, True), fill="#D7DDE2")

    image.save(OUTPUT, format="PNG", optimize=True)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
