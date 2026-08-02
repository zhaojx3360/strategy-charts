# -*- coding: utf-8 -*-
"""Build 16:9 visual assets for the six-minute strategy review video."""
from __future__ import annotations

import argparse
import json
from io import BytesIO
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.font_manager import FontProperties
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
ASSET_DIR = ROOT / "assets"
DATA_DIR = ROOT / "data"
NAV_PATH = DATA_DIR / "统一规则净值_最近三年.csv"
METRIC_PATHS = {
    "6m": DATA_DIR / "策略指标_最近六个月.csv",
    "1y": DATA_DIR / "策略指标_最近一年.csv",
    "3y": DATA_DIR / "策略指标_最近三年.csv",
}

W, H = 1920, 1080
BG = "#F7F8F6"
PAPER = "#FFFFFF"
INK = "#1F252B"
MUTED = "#667079"
BORDER = "#D9DEDA"
SOFT = "#EEF1EE"
RED = "#D64541"
GREEN = "#2E9D57"
AMBER = "#D69422"
BLUE = "#2C7FB8"
PURPLE = "#7E57C2"
ORANGE = "#E67E22"
COLORS = {
    "GAR": BLUE,
    "trio": PURPLE,
    "V8": RED,
    "豆粕动量": GREEN,
    "小票": ORANGE,
}

FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
MPL_FONT = FontProperties(fname=str(FONT_REGULAR))
MPL_FONT_BOLD = FontProperties(fname=str(FONT_BOLD))

PUBLIC_STRATEGIES = [
    ("GAR", "底仓", "跨资产平衡", BLUE),
    ("trio", "底仓", "权益风格组合", PURPLE),
    ("V8", "趋势", "广泛市场趋势轮动", RED),
    ("豆粕动量", "趋势", "跨市场趋势轮动", GREEN),
    ("小票", "卫星", "小盘量化增强", ORANGE),
    ("主动基金", "补充", "主动选择", "#65747C"),
    ("低估定投", "补充", "估值驱动", "#B18A2E"),
]

SCENES = [
    ("01-封面与钩子.png", 25),
    ("02-交易体系全貌.png", 32),
    ("03-统一比较口径.png", 25),
    ("04-最近六个月总览.png", 35),
    ("05-策略分工.png", 35),
    ("06-V8风险复盘.png", 45),
    ("07-小票逆风.png", 30),
    ("08-最近一年对照.png", 30),
    ("09-最近三年对照.png", 40),
    ("10-体系四原则.png", 38),
    ("11-结尾与关注.png", 25),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size=size)


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (W, H), BG)
    return image, ImageDraw.Draw(image)


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, text_font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        if not paragraph:
            lines.append("")
            continue
        line = ""
        for char in paragraph:
            candidate = line + char
            if not line or draw.textlength(candidate, font=text_font) <= max_width:
                line = candidate
            else:
                lines.append(line)
                line = char
        if line:
            lines.append(line)
    return lines


def paragraph(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    text_font,
    fill: str,
    max_width: int,
    spacing: int = 12,
) -> int:
    lines = wrap_lines(draw, text, text_font, max_width)
    line_height = text_font.size + spacing
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=text_font, fill=fill)
        y += line_height
    return y


def card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill=PAPER, outline=BORDER) -> None:
    draw.rounded_rectangle(box, radius=8, fill=fill, outline=outline, width=2)


def header(draw: ImageDraw.ImageDraw, kicker: str, title: str, subtitle: str | None = None) -> None:
    draw.text((90, 55), kicker, font=font(24, True), fill=RED)
    draw.text((90, 94), title, font=font(52, True), fill=INK)
    if subtitle:
        draw.text((92, 166), subtitle, font=font(25), fill=MUTED)


def footer(draw: ImageDraw.ImageDraw, scene_no: int) -> None:
    draw.line((90, 1026, 1830, 1026), fill=BORDER, width=2)
    draw.text((90, 1040), "当前规则净值复盘｜共同截止 2026-07-28", font=font(17), fill=MUTED)
    draw.text((1760, 1040), f"{scene_no:02d}/{len(SCENES):02d}", font=font(17, True), fill=MUTED)


def pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill: str, text_fill=PAPER) -> int:
    f = font(22, True)
    width = int(draw.textlength(text, font=f)) + 34
    x, y = xy
    draw.rounded_rectangle((x, y, x + width, y + 44), radius=8, fill=fill)
    draw.text((x + 17, y + 7), text, font=f, fill=text_fill)
    return width


def load_data(source_dir: Path | None = None) -> tuple[pd.DataFrame, dict[str, pd.DataFrame]]:
    if source_dir is not None:
        nav = pd.read_parquet(source_dir / "portfolio_rule_navs.parquet")
        nav.index = pd.to_datetime(nav.index)
        metrics = {
            key: pd.read_csv(source_dir / f"portfolio_rule_metrics_{key}.csv", index_col=0, encoding="utf-8-sig")
            for key in ("6m", "1y", "3y")
        }
        return nav.sort_index(), metrics

    nav = pd.read_csv(NAV_PATH, index_col="日期", encoding="utf-8-sig")
    nav.index = pd.to_datetime(nav.index)
    nav = nav.sort_index()
    metrics = {}
    rename = {
        "开始日期": "start",
        "结束日期": "end",
        "区间收益": "return",
        "年化": "annualized",
        "夏普": "sharpe",
        "最大回撤": "max_drawdown",
        "卡玛": "calmar",
    }
    for key, path in METRIC_PATHS.items():
        frame = pd.read_csv(path, index_col="策略", encoding="utf-8-sig")
        metrics[key] = frame.rename(columns=rename)
    return nav, metrics


def normalized_window(nav: pd.DataFrame, offset: pd.DateOffset) -> pd.DataFrame:
    end = nav.index[-1]
    start_at = end - offset
    starts = nav.index[nav.index <= start_at]
    start = starts[-1]
    frame = nav.loc[start:end].ffill().dropna()
    return frame.div(frame.iloc[0]) * 100


def chart_image(
    data: pd.DataFrame,
    size: tuple[int, int],
    columns: list[str] | None = None,
    legend: bool = True,
    highlight_v8: bool = False,
) -> Image.Image:
    columns = columns or list(data.columns)
    dpi = 120
    fig, ax = plt.subplots(figsize=(size[0] / dpi, size[1] / dpi), dpi=dpi)
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    for name in columns:
        ax.plot(data.index, data[name], lw=3.0 if name == "V8" else 2.4, color=COLORS[name], label=name)
    ax.axhline(100, color="#9AA19D", lw=1.2, ls="--")
    ax.grid(axis="y", color="#DDE1DE", lw=0.8)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.spines["bottom"].set_color("#AAB1AD")
    ax.tick_params(axis="both", labelsize=14, colors=INK, length=0)
    ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=4, maxticks=7))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    if legend:
        legend_font = MPL_FONT.copy()
        legend_font.set_size(13)
        ax.legend(loc="upper left", ncol=min(5, len(columns)), frameon=False, prop=legend_font)
    if highlight_v8 and "V8" in columns:
        series = data["V8"]
        peak_date = series.idxmax()
        peak = series.max()
        end_date = series.index[-1]
        end_value = series.iloc[-1]
        ax.scatter([peak_date, end_date], [peak, end_value], s=70, color=RED, zorder=5)
        ax.annotate(
            f"峰值 +{peak - 100:.2f}%",
            xy=(peak_date, peak),
            xytext=(-105, 26),
            textcoords="offset points",
            color=RED,
            fontproperties=MPL_FONT_BOLD,
            arrowprops={"arrowstyle": "-", "color": RED},
        )
        ax.annotate(
            f"期末 +{end_value - 100:.2f}%",
            xy=(end_date, end_value),
            xytext=(-110, -36),
            textcoords="offset points",
            color=RED,
            fontproperties=MPL_FONT_BOLD,
            arrowprops={"arrowstyle": "-", "color": RED},
        )
    fig.tight_layout(pad=0.8)
    buffer = BytesIO()
    fig.savefig(buffer, format="png", dpi=dpi, facecolor=BG)
    plt.close(fig)
    buffer.seek(0)
    return Image.open(buffer).convert("RGB").resize(size, Image.Resampling.LANCZOS)


def metric(metrics: dict[str, pd.DataFrame], window: str, strategy: str, field: str) -> float:
    return float(metrics[window].loc[strategy, field])


def pct(value: float) -> str:
    return f"{value:+.2%}"


def build_cover(nav6: pd.DataFrame, metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    draw.text((90, 70), "半年复盘", font=font(26, True), fill=RED)
    paragraph(draw, (90, 118), "我为什么不再寻找\n一套万能策略", font(76, True), INK, 760, 14)
    paragraph(
        draw,
        (94, 340),
        "五套当前规则，同一起点、同样本金。\n看收益，也看为了收益付出的路径。",
        font(29),
        MUTED,
        700,
        16,
    )
    chart = chart_image(nav6, (920, 610), columns=["GAR", "V8"], legend=True, highlight_v8=True)
    image.paste(chart, (900, 120))

    card(draw, (90, 610, 840, 895), fill=PAPER)
    draw.text((125, 650), "一个有意制造的反差", font=font(27, True), fill=INK)
    draw.text((125, 710), "V8", font=font(28, True), fill=RED)
    draw.text((225, 700), "+44.92%", font=font(44, True), fill=RED)
    draw.text((455, 712), "峰值", font=font(21), fill=MUTED)
    draw.text((125, 770), "期末", font=font(22), fill=MUTED)
    draw.text((225, 758), pct(metric(metrics, "6m", "V8", "return")), font=font(42, True), fill=INK)
    draw.text((455, 770), "最大回撤", font=font(22), fill=MUTED)
    draw.text((620, 758), pct(metric(metrics, "6m", "V8", "max_drawdown")), font=font(42, True), fill=RED)
    footer(draw, 1)
    return image


def build_system() -> Image.Image:
    image, draw = canvas()
    header(draw, "交易体系", "七个策略，四类职责", "公开策略思想与表现，不公开仓位、标的和参数")
    for idx, (name, category, thought, color) in enumerate(PUBLIC_STRATEGIES):
        if idx < 4:
            x = 90 + idx * 435
            y = 270
            width = 405
        else:
            x = 90 + (idx - 4) * 580
            y = 575
            width = 550
        card(draw, (x, y, x + width, y + 245), fill=PAPER)
        draw.rectangle((x, y, x + width, y + 12), fill=color)
        draw.text((x + 30, y + 38), category, font=font(20, True), fill=color)
        draw.text((x + 30, y + 82), name, font=font(34, True), fill=INK)
        draw.text((x + 30, y + 148), thought, font=font(23), fill=MUTED)
    card(draw, (90, 870, 1830, 975), fill="#FFF8E9", outline="#E7C574")
    draw.text((130, 903), "公开：策略名称、思想定位、阶段表现", font=font(24, True), fill=INK)
    draw.text((940, 903), "保留：仓位比例、具体标的、参数与执行细节", font=font(24, True), fill=AMBER)
    footer(draw, 2)
    return image


def build_method() -> Image.Image:
    image, draw = canvas()
    header(draw, "比较方法", "先把起跑线拉齐", "不比较建仓早晚，只比较当前规则本身")
    steps = [
        ("01", "同一日期", "2026-01-28", BLUE),
        ("02", "同样本金", "每套 = 100", GREEN),
        ("03", "当前规则", "不使用旧版本", RED),
    ]
    for idx, (no, title, value, color) in enumerate(steps):
        x = 110 + idx * 590
        card(draw, (x, 285, x + 500, 555), fill=PAPER)
        draw.text((x + 35, 318), no, font=font(24, True), fill=color)
        draw.text((x + 35, 370), title, font=font(34, True), fill=INK)
        draw.text((x + 35, 455), value, font=font(42, True), fill=color)
        if idx < 2:
            draw.line((x + 510, 420, x + 570, 420), fill=BORDER, width=5)
            draw.polygon([(x + 570, 420), (x + 548, 407), (x + 548, 433)], fill=BORDER)

    x = 110
    for name in ["GAR", "trio", "V8", "豆粕动量", "小票"]:
        width = pill(draw, (x, 630), name, COLORS[name])
        x += width + 22
    card(draw, (110, 745, 1810, 925), fill="#FFF8E9", outline="#E7C574")
    draw.text((150, 780), "未纳入本期业绩曲线", font=font(26, True), fill=AMBER)
    paragraph(
        draw,
        (150, 830),
        "主动基金与低估定投尚无统一生产规则净值。数据缺口明确标注，不为了图表完整而补造曲线。",
        font(25),
        INK,
        1580,
        12,
    )
    footer(draw, 3)
    return image


def build_six_month(nav6: pd.DataFrame, metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    header(draw, "最近六个月", "终点接近，不等于路径接近", "2026-01-28 = 100｜统一规则净值")
    chart = chart_image(nav6, (1740, 570), legend=True)
    image.paste(chart, (90, 225))
    x = 90
    for name in COLORS:
        ret = pct(metric(metrics, "6m", name, "return"))
        mdd = pct(metric(metrics, "6m", name, "max_drawdown"))
        card(draw, (x, 820, x + 330, 980), fill=PAPER)
        draw.rectangle((x, 820, x + 330, 830), fill=COLORS[name])
        draw.text((x + 20, 850), name, font=font(24, True), fill=INK)
        draw.text((x + 20, 900), ret, font=font(32, True), fill=COLORS[name])
        draw.text((x + 175, 910), f"回撤 {mdd}", font=font(19), fill=MUTED)
        x += 352
    footer(draw, 4)
    return image


def build_roles(metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    header(draw, "策略分工", "不是争夺冠军，而是承担不同岗位", "收益来源和回撤形态不同，才有组合价值")
    items = [
        (
            "GAR",
            "跨资产防守底仓",
            "把相关性不同的大类资产放在一起\n通过再平衡降低单一周期影响",
            BLUE,
        ),
        (
            "trio",
            "A 股权益底仓",
            "结合主动选择与价值、质量、防御风格\n在权益底仓上争取边际 alpha",
            PURPLE,
        ),
        (
            "豆粕动量",
            "独立趋势 alpha",
            "识别不同市场的短周期趋势变化\n用分散执行降低单点判断风险",
            GREEN,
        ),
    ]
    for idx, (name, role, desc, color) in enumerate(items):
        x = 90 + idx * 590
        card(draw, (x, 270, x + 540, 900), fill=PAPER)
        draw.rectangle((x, 270, x + 540, 282), fill=color)
        draw.text((x + 34, 320), name, font=font(38, True), fill=color)
        draw.text((x + 34, 380), role, font=font(28, True), fill=INK)
        paragraph(draw, (x + 34, 450), desc, font(23), MUTED, 470, 14)
        draw.line((x + 34, 600, x + 506, 600), fill=BORDER, width=2)
        ret = pct(metric(metrics, "6m", name, "return"))
        mdd = pct(metric(metrics, "6m", name, "max_drawdown"))
        draw.text((x + 34, 642), "半年收益", font=font(21), fill=MUTED)
        draw.text((x + 34, 680), ret, font=font(42, True), fill=color)
        draw.text((x + 292, 642), "最大回撤", font=font(21), fill=MUTED)
        draw.text((x + 292, 680), mdd, font=font(42, True), fill=INK)
        notes = {"GAR": "回撤最浅", "trio": "半年横盘", "豆粕动量": "半年收益最高"}
        pill(draw, (x + 34, 790), notes[name], color)
    footer(draw, 5)
    return image


def build_v8(nav6: pd.DataFrame, metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    header(draw, "案例复盘", "V8：新样本改写了风险认知", "规则没有改变，风险边界变了")
    chart = chart_image(nav6[["V8"]], (1120, 650), legend=False, highlight_v8=True)
    image.paste(chart, (70, 230))
    card(draw, (1240, 250, 1815, 890), fill=PAPER)
    draw.text((1290, 300), "旧归档快照", font=font(25, True), fill=MUTED)
    draw.text((1290, 345), "-19.07%", font=font(58, True), fill="#8A9399")
    draw.text((1290, 425), "截至 2026-06-10", font=font(20), fill=MUTED)
    draw.line((1290, 485, 1765, 485), fill=BORDER, width=3)
    draw.text((1290, 530), "最新完整重跑", font=font(25, True), fill=RED)
    draw.text((1290, 575), "-34.11%", font=font(64, True), fill=RED)
    draw.text((1290, 660), "截至 2026-07-31", font=font(20), fill=MUTED)
    draw.text((1290, 735), "双源核验", font=font(22, True), fill=INK)
    paragraph(
        draw,
        (1290, 775),
        "关键行情经两个独立数据源核对\n结果一致，排除数据伪影",
        font(20),
        MUTED,
        470,
        11,
    )
    draw.text((90, 930), "结论：旧数据没有错，但旧风险上限已经失效。", font=font(27, True), fill=INK)
    footer(draw, 6)
    return image


def build_smallcap(nav6: pd.DataFrame, metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    header(draw, "逆风样本", "小票：承认亏损，但不在低谷追着改规则", "高波动卫星策略")
    chart = chart_image(nav6[["小票"]], (980, 570), legend=False)
    image.paste(chart, (70, 250))
    card(draw, (1100, 250, 1820, 825), fill=PAPER)
    draw.text((1150, 300), "公开的策略思想", font=font(30, True), fill=INK)
    factors = ["多维筛选", "风险排雷", "分散持有", "真实成本", "样本外验证"]
    x, y = 1150, 380
    for idx, value in enumerate(factors):
        width = pill(draw, (x, y), value, ORANGE)
        x += width + 18
        if idx == 2:
            x, y = 1150, 460
    draw.text((1150, 565), "最近六个月", font=font(21), fill=MUTED)
    draw.text((1150, 605), pct(metric(metrics, "6m", "小票", "return")), font=font(52, True), fill=ORANGE)
    draw.text((1450, 565), "最近一年", font=font(21), fill=MUTED)
    draw.text((1450, 605), pct(metric(metrics, "1y", "小票", "return")), font=font(52, True), fill=INK)
    paragraph(
        draw,
        (1150, 710),
        "不粉饰结果；也不因半年落后临时改模型。\n风险控制 + 样本外观察，是当前动作。",
        font(22),
        MUTED,
        610,
        12,
    )
    draw.text((90, 910), "“策略处于逆风”与“策略已经失效”不是同一个结论。", font=font(29, True), fill=INK)
    footer(draw, 7)
    return image


def build_one_year(nav1: pd.DataFrame, metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    header(draw, "最近一年", "用更长窗口理解半年，而不是覆盖半年", "2025-07-28 = 100｜一年仍不是完整市场周期")
    chart = chart_image(nav1, (1120, 660), legend=True)
    image.paste(chart, (60, 240))
    card(draw, (1220, 245, 1830, 905), fill=PAPER)
    columns = [("策略", 1260), ("收益", 1460), ("夏普", 1600), ("回撤", 1725)]
    for label, x in columns:
        draw.text((x, 285), label, font=font(20, True), fill=MUTED)
    draw.line((1255, 330, 1795, 330), fill=BORDER, width=2)
    for idx, name in enumerate(COLORS):
        y = 365 + idx * 96
        draw.ellipse((1260, y + 8, 1278, y + 26), fill=COLORS[name])
        draw.text((1290, y), name, font=font(20, True), fill=INK)
        draw.text((1450, y), pct(metric(metrics, "1y", name, "return")), font=font(20, True), fill=COLORS[name])
        draw.text((1610, y), f"{metric(metrics, '1y', name, 'sharpe'):.2f}", font=font(20), fill=INK)
        draw.text((1720, y), pct(metric(metrics, "1y", name, "max_drawdown")), font=font(20), fill=INK)
    draw.line((1255, 855, 1795, 855), fill=BORDER, width=2)
    draw.text((1260, 870), "收益：豆粕｜效率：trio｜防守：GAR", font=font(22, True), fill=INK)
    draw.text((90, 930), "收益冠军、风险效率、最浅回撤，并不属于同一套策略。", font=font(28, True), fill=INK)
    footer(draw, 8)
    return image


def build_three_year(metrics: dict[str, pd.DataFrame]) -> Image.Image:
    image, draw = canvas()
    header(draw, "最近三年", "更长窗口提高说服力，也更需要解释样本", "2023-07-28 至 2026-07-28｜统一起点、统一规则")
    card(draw, (90, 245, 1040, 850), fill=PAPER)
    draw.text((135, 285), "三年累计收益", font=font(28, True), fill=INK)
    max_return = max(metric(metrics, "3y", name, "return") for name in COLORS)
    for idx, name in enumerate(COLORS):
        y = 365 + idx * 88
        value = metric(metrics, "3y", name, "return")
        draw.text((135, y), name, font=font(21, True), fill=INK)
        bar_x = 315
        bar_w = int(500 * value / max_return)
        draw.rounded_rectangle((bar_x, y + 4, bar_x + max(bar_w, 8), y + 34), radius=5, fill=COLORS[name])
        draw.text((965, y), pct(value), font=font(21, True), fill=COLORS[name], anchor="ra")

    card(draw, (1090, 245, 1830, 850), fill=PAPER)
    columns = [("策略", 1130), ("年化", 1395), ("夏普", 1535), ("回撤", 1675)]
    for label, x in columns:
        draw.text((x, 285), label, font=font(20, True), fill=MUTED)
    draw.line((1125, 330, 1795, 330), fill=BORDER, width=2)
    for idx, name in enumerate(COLORS):
        y = 370 + idx * 88
        draw.ellipse((1130, y + 8, 1148, y + 26), fill=COLORS[name])
        draw.text((1160, y), name, font=font(20, True), fill=INK)
        draw.text((1385, y), pct(metric(metrics, "3y", name, "annualized")), font=font(20), fill=INK)
        draw.text((1545, y), f"{metric(metrics, '3y', name, 'sharpe'):.2f}", font=font(20), fill=INK)
        draw.text((1670, y), pct(metric(metrics, "3y", name, "max_drawdown")), font=font(20), fill=INK)

    card(draw, (90, 880, 1830, 985), fill="#FFF8E9", outline="#E7C574")
    draw.text((130, 912), "重要限制", font=font(23, True), fill=AMBER)
    draw.text(
        (285, 912),
        "小票三年 +376.13% 明显受小微盘强势阶段影响，不能直接外推为未来常态。",
        font=font(23, True),
        fill=INK,
    )
    footer(draw, 9)
    return image


def build_principles() -> Image.Image:
    image, draw = canvas()
    header(draw, "体系总结", "我的交易体系，浓缩成四条", "规则先于感受，组合先于单策略")
    items = [
        ("01", "策略分工", "跨资产、权益底仓、趋势与小盘因子承担不同岗位。", BLUE),
        ("02", "仓位约束", "在组合层限制单一策略风险，定期再平衡，不追逐近期冠军。", PURPLE),
        ("03", "多维验证", "年化、夏普、回撤、卡玛同时看，并做分窗口和样本外。", GREEN),
        ("04", "诚实纠错", "新样本推翻旧结论时，保留旧记录并更新风险边界。", RED),
    ]
    for idx, (no, title, desc, color) in enumerate(items):
        col = idx % 2
        row = idx // 2
        x = 90 + col * 880
        y = 260 + row * 350
        card(draw, (x, y, x + 820, y + 295), fill=PAPER)
        draw.text((x + 35, y + 32), no, font=font(28, True), fill=color)
        draw.text((x + 105, y + 28), title, font=font(36, True), fill=INK)
        paragraph(draw, (x + 35, y + 110), desc, font(25), MUTED, 740, 15)
        draw.rectangle((x + 35, y + 245, x + 160, y + 254), fill=color)
    footer(draw, 10)
    return image


def build_end() -> Image.Image:
    image, draw = canvas()
    draw.text((90, 85), "下一阶段", font=font(26, True), fill=RED)
    paragraph(draw, (90, 135), "不只晒收益，\n继续公开验证、错误与修正", font(68, True), INK, 1250, 16)
    paragraph(
        draw,
        (94, 345),
        "V8 新回撤｜小票样本外｜主动与低估净值补全\n组合能否真正穿过不同市场周期，需要继续用数据回答。",
        font(29),
        MUTED,
        1250,
        18,
    )
    items = [
        ("规则", "公开每套策略怎样运行"),
        ("过程", "公开复测、否决与犯过的错"),
        ("结果", "收益与回撤都不省略"),
    ]
    x = 90
    for title, desc in items:
        card(draw, (x, 600, x + 520, 830), fill=PAPER)
        draw.text((x + 35, 635), title, font=font(34, True), fill=INK)
        paragraph(draw, (x + 35, 700), desc, font(24), MUTED, 445, 12)
        x += 570
    draw.text((90, 910), "关注的不是一张漂亮曲线，而是一套体系如何被持续验证。", font=font(31, True), fill=RED)
    footer(draw, 11)
    return image


def export_data(
    nav6: pd.DataFrame,
    nav1: pd.DataFrame,
    nav3: pd.DataFrame,
    metrics: dict[str, pd.DataFrame],
) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    nav6.to_csv(DATA_DIR / "统一规则净值_最近六个月.csv", encoding="utf-8-sig", index_label="日期")
    nav1.to_csv(DATA_DIR / "统一规则净值_最近一年.csv", encoding="utf-8-sig", index_label="日期")
    nav3.to_csv(DATA_DIR / "统一规则净值_最近三年.csv", encoding="utf-8-sig", index_label="日期")
    for key, label in [("6m", "最近六个月"), ("1y", "最近一年"), ("3y", "最近三年")]:
        frame = metrics[key][["start", "end", "return", "annualized", "sharpe", "max_drawdown", "calmar"]].copy()
        frame.columns = ["开始日期", "结束日期", "区间收益", "年化", "夏普", "最大回撤", "卡玛"]
        frame.to_csv(DATA_DIR / f"策略指标_{label}.csv", encoding="utf-8-sig", index_label="策略")


def build_contact_sheet(images: list[Image.Image]) -> Image.Image:
    thumb_w, thumb_h = 768, 432
    gap = 20
    rows = (len(images) + 1) // 2
    sheet = Image.new("RGB", (thumb_w * 2 + gap * 3, thumb_h * rows + gap * (rows + 1)), "#E7EAE7")
    for idx, image in enumerate(images):
        col = idx % 2
        row = idx // 2
        x = gap + col * (thumb_w + gap)
        y = gap + row * (thumb_h + gap)
        sheet.paste(image.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS), (x, y))
    return sheet


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=Path,
        help="Optional private comparison-output directory used to refresh the public CSV files.",
    )
    args = parser.parse_args()
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    nav, metrics = load_data(args.source_dir)
    nav6 = normalized_window(nav, pd.DateOffset(months=6))
    nav1 = normalized_window(nav, pd.DateOffset(years=1))
    nav3 = normalized_window(nav, pd.DateOffset(years=3))

    images = [
        build_cover(nav6, metrics),
        build_system(),
        build_method(),
        build_six_month(nav6, metrics),
        build_roles(metrics),
        build_v8(nav6, metrics),
        build_smallcap(nav6, metrics),
        build_one_year(nav1, metrics),
        build_three_year(metrics),
        build_principles(),
        build_end(),
    ]
    for image, (name, _) in zip(images, SCENES):
        image.save(ASSET_DIR / name, format="PNG", optimize=True)
    build_contact_sheet(images).save(ROOT / "分镜总览.png", format="PNG", optimize=True)

    export_data(nav6, nav1, nav3, metrics)
    manifest = {
        "title": "半年复盘：我为什么不再寻找一套万能策略",
        "resolution": [W, H],
        "target_duration_seconds": sum(duration for _, duration in SCENES),
        "scenes": [
            {"file": f"assets/{name}", "duration_seconds": duration}
            for name, duration in SCENES
        ],
        "data_common_end": str(nav.index[-1].date()),
        "scope": "current-rule theoretical NAV; equal start date and equal notional",
    }
    (ROOT / "asset_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Built {len(images)} scenes in {ASSET_DIR}")
    print(f"Target duration: {manifest['target_duration_seconds']} seconds")


if __name__ == "__main__":
    main()
