from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source" / "真实账户近一年.jpg"
OUTPUT = ROOT / "封面-入市八年交易体系.png"
OUTPUT_2 = ROOT / "封面候选02-入市八年.png"
OUTPUT_3 = ROOT / "封面候选03-七套策略.png"
OUTPUT_4 = ROOT / "封面候选04-跑输上证.png"
OUTPUT_5 = ROOT / "封面候选05-一年半从零搭建.png"
CONTACT_SHEET = ROOT / "封面候选总览.png"

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


def framed_image(source: Path, max_size: tuple[int, int], angle: float = 0.0) -> Image.Image:
    screenshot = Image.open(source).convert("RGB")
    screenshot.thumbnail(max_size, Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (screenshot.width + 24, screenshot.height + 24), "#FFFFFF")
    frame.paste(screenshot, (12, 12))
    if angle:
        frame = frame.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC, fillcolor="#FFFFFF")
    return frame


def paste_with_shadow(image: Image.Image, item: Image.Image, position: tuple[int, int], blur: int = 20) -> None:
    x, y = position
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x + 12, y + 14, x + item.width + 18, y + item.height + 20),
        radius=18,
        fill=(0, 0, 0, 130),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    composed = Image.alpha_composite(image.convert("RGBA"), shadow).convert("RGB")
    image.paste(composed)
    image.paste(item, position)


def build_variant_2() -> Image.Image:
    image = Image.new("RGB", (W, H), "#F4F6F7")
    draw = ImageDraw.Draw(image)
    draw.rectangle((1280, 0, W, H), fill="#17202A")
    draw.rectangle((0, 0, 28, H), fill="#2C7FB8")
    draw.rounded_rectangle((100, 88, 480, 145), radius=7, fill="#2C7FB8")
    centered_text(draw, (100, 88, 480, 145), "一个普通投资者的八年", font(27, True), "#FFFFFF")

    draw.text((95, 205), "入市", font=font(92, True), fill="#1F252B")
    draw.text((350, 135), "8年", font=font(190, True), fill=RED)
    draw.text((95, 410), "我终于不再靠感觉投资", font=font(68, True), fill="#1F252B")
    draw.text((100, 525), "从消息和情绪，走向回测、规则与复盘", font=font(38), fill="#65717B")

    stages = [
        ("2018", "开始入市", "#2C7FB8"),
        ("2024", "承认主观没有天赋", RED),
        ("现在", "让规则替代感觉", GREEN),
    ]
    x = 100
    for year, label, color in stages:
        draw.rounded_rectangle((x, 690, x + 340, 860), radius=8, fill="#FFFFFF", outline="#D7DDE1", width=2)
        draw.text((x + 28, 718), year, font=font(38, True), fill=color)
        draw.text((x + 28, 790), label, font=font(27, True), fill="#1F252B")
        x += 375

    card = framed_image(ROOT / "source" / "历年收益记录.jpg", (410, 905), angle=1.5)
    paste_with_shadow(image, card, (1405, 64))
    draw = ImageDraw.Draw(image)
    draw.text((100, 980), "入市早，不等于懂投资。", font=font(31, True), fill="#2C7FB8")
    return image


def build_variant_3() -> Image.Image:
    image = Image.new("RGB", (W, H), "#101419")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 34, H), fill=AMBER)
    draw.rounded_rectangle((98, 92, 390, 150), radius=7, fill=AMBER)
    centered_text(draw, (98, 92, 390, 150), "体系是怎么来的", font(28, True), "#101419")
    draw.text((95, 220), "从追涨杀跌", font=font(78, True), fill=INK)
    draw.text((95, 340), "到", font=font(62, True), fill=MUTED)
    draw.text((80, 405), "7", font=font(240, True), fill=RED)
    draw.text((345, 510), "套策略", font=font(96, True), fill=INK)
    draw.text((98, 685), "回测 · 实盘 · 推翻 · 改进", font=font(39, True), fill=AMBER)
    draw.text((100, 770), "一个普通投资者的体系搭建过程", font=font(35), fill=MUTED)

    panel = Image.open(ROOT / "assets" / "04-交易体系全貌.png").convert("RGB")
    panel = panel.resize((1024, 576), Image.Resampling.LANCZOS)
    frame = Image.new("RGB", (1052, 604), "#FFFFFF")
    frame.paste(panel, (14, 14))
    paste_with_shadow(image, frame, (820, 230), blur=26)
    draw = ImageDraw.Draw(image)
    draw.line((650, 470, 790, 470), fill=RED, width=10)
    draw.polygon([(790, 445), (835, 470), (790, 495)], fill=RED)
    draw.text((98, 985), "真正的变化，不是猜对一次，而是知道下一步怎么做。", font=font(30, True), fill="#D7DDE2")
    return image


def build_variant_4() -> Image.Image:
    image = Image.new("RGB", (W, H), "#F6F7F5")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 38), fill=RED)
    draw.rectangle((0, 1028, W, H), fill="#1F252B")
    draw.rounded_rectangle((680, 92, 1010, 150), radius=7, fill="#1F252B")
    centered_text(draw, (680, 92, 1010, 150), "真实账户复盘", font(28, True), "#FFFFFF")
    draw.text((675, 210), "近一年跑输上证", font=font(80, True), fill="#1F252B")
    draw.text((660, 330), "-3.29 pct", font=font(170, True), fill=GREEN)
    draw.text((675, 555), "我为什么还要公开复盘？", font=font(70, True), fill="#1F252B")
    draw.text((680, 680), "因为比起一张漂亮答卷，我更想检验体系。", font=font(38), fill="#667079")
    draw.rounded_rectangle((680, 805, 1135, 875), radius=7, fill=RED)
    centered_text(draw, (680, 805, 1135, 875), "普通成绩，更要讲清楚", font(31, True), "#FFFFFF")

    card = framed_image(ROOT / "source" / "真实账户近一年.jpg", (455, 925), angle=-1.7)
    paste_with_shadow(image, card, (120, 75))
    draw = ImageDraw.Draw(image)
    draw.line((1240, 230, 1815, 230), fill="#D9DEDA", width=3)
    draw.line((1240, 290, 1740, 290), fill="#D9DEDA", width=3)
    draw.line((1240, 350, 1840, 350), fill="#D9DEDA", width=3)
    return image


def build_variant_5() -> Image.Image:
    background = Image.open(ROOT / "assets" / "06-最近六个月总览.png").convert("RGB")
    background = background.resize((W, H), Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", (W, H), (7, 12, 16, 185))
    image = Image.alpha_composite(background.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((78, 80, 1190, 935), radius=8, fill="#0E1419", outline="#2E9D57", width=4)
    draw.rounded_rectangle((105, 110, 420, 168), radius=7, fill=GREEN)
    centered_text(draw, (105, 110, 420, 168), "一年半的体系实验", font(27, True), "#07100B")
    draw.text((100, 230), "一年半", font=font(105, True), fill=AMBER)
    draw.text((90, 370), "0 → 7套策略", font=font(126, True), fill=INK)
    draw.text((105, 560), "从零回测，到形成交易体系", font=font(52, True), fill="#DCE3E8")
    draw.text((105, 650), "不断实盘、推翻、改进、再验证", font=font(37), fill=MUTED)

    tags = [("回测", "#2C7FB8"), ("实盘", GREEN), ("纠错", RED), ("组合", AMBER)]
    x = 105
    for text, color in tags:
        draw.rounded_rectangle((x, 775, x + 190, 850), radius=7, outline=color, width=4, fill="#151C22")
        centered_text(draw, (x, 775, x + 190, 850), text, font(32, True), color)
        x += 220
    draw.text((1260, 900), "不是预测市场，而是约束自己", font=font(35, True), fill="#FFFFFF")
    return image


def build_contact_sheet(paths: list[tuple[str, Path]]) -> None:
    sheet = Image.new("RGB", (W, H), "#E8ECEF")
    draw = ImageDraw.Draw(sheet)
    positions = [(30, 78), (660, 78), (1290, 78), (345, 598), (975, 598)]
    for (label, path), (x, y) in zip(paths, positions):
        thumb = Image.open(path).convert("RGB").resize((600, 338), Image.Resampling.LANCZOS)
        draw.rounded_rectangle((x - 4, y - 4, x + 604, y + 342), radius=6, fill="#FFFFFF")
        sheet.paste(thumb, (x, y))
        centered_text(draw, (x, y - 58, x + 600, y - 8), label, font(27, True), "#1F252B")
    sheet.save(CONTACT_SHEET, format="PNG", optimize=True)


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

    variants = [
        ("候选 1｜普通收益与体系反差", OUTPUT),
        ("候选 2｜入市八年的转变", OUTPUT_2),
        ("候选 3｜从追涨杀跌到七套策略", OUTPUT_3),
        ("候选 4｜跑输上证仍然复盘", OUTPUT_4),
        ("候选 5｜一年半从零搭建", OUTPUT_5),
    ]
    for builder, (_, path) in zip(
        (build_variant_2, build_variant_3, build_variant_4, build_variant_5),
        variants[1:],
    ):
        builder().save(path, format="PNG", optimize=True)
        print(f"wrote {path}")
    build_contact_sheet(variants)
    print(f"wrote {CONTACT_SHEET}")


if __name__ == "__main__":
    main()
