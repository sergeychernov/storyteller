from pathlib import Path
import re

from reportlab.lib.colors import PCMYKColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "packages" / "web-ui" / "brand" / "exports" / "print" / "make-it-a-story-brand-guide.pdf"
FONT = ROOT / "packages" / "web-ui" / "brand" / "fonts" / "SpaceGrotesk-Bold.ttf"

PAGE = landscape(A4)
W, H = PAGE
CHARCOAL = PCMYKColor(0, 0, 15, 87)
CREAM = PCMYKColor(0, 1, 3, 5)
OLIVE = PCMYKColor(15, 0, 56, 51)
LIME = PCMYKColor(14, 0, 53, 2)
MUTED = PCMYKColor(0, 0, 8, 53)
WHITE = PCMYKColor(0, 0, 0, 0)
BLACK = PCMYKColor(0, 0, 0, 100)
HAIRLINE = PCMYKColor(0, 0, 6, 15)
WARNING = PCMYKColor(0, 4, 22, 0)

UPPER = "M416 76H184C113 76 76 115 76 177C76 232 111 265 180 282L215 291L236 216L185 207C160 201 149 191 149 174C149 154 165 144 193 144H382L416 76Z"
LOWER = "M258 302L331 319C354 325 365 335 365 351C365 371 350 382 323 382H92L126 450H334C402 450 438 411 438 348C438 291 403 260 338 244L279 226L258 302Z"


def svg_path(pdf, data, translate=(0, 0)):
    tokens = re.findall(r"[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)", data)
    path = pdf.beginPath()
    x = y = 0.0
    start_x = start_y = 0.0
    command = None
    index = 0
    tx, ty = translate

    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            command = token
            index += 1
            if command in ("Z", "z"):
                path.close()
                x, y = start_x, start_y
                command = None
                continue

        if command == "M":
            x, y = float(tokens[index]), float(tokens[index + 1])
            path.moveTo(x + tx, y + ty)
            start_x, start_y = x, y
            index += 2
            command = "L"
        elif command == "L":
            x, y = float(tokens[index]), float(tokens[index + 1])
            path.lineTo(x + tx, y + ty)
            index += 2
        elif command == "H":
            x = float(tokens[index])
            path.lineTo(x + tx, y + ty)
            index += 1
        elif command == "V":
            y = float(tokens[index])
            path.lineTo(x + tx, y + ty)
            index += 1
        elif command == "C":
            values = [float(value) for value in tokens[index:index + 6]]
            path.curveTo(
                values[0] + tx,
                values[1] + ty,
                values[2] + tx,
                values[3] + ty,
                values[4] + tx,
                values[5] + ty,
            )
            x, y = values[4], values[5]
            index += 6
        else:
            raise ValueError(f"Unsupported SVG command: {command}")
    return path


def draw_mark(pdf, left, bottom, visible_height, color=CHARCOAL):
    scale = visible_height / 338
    pdf.saveState()
    pdf.transform(scale, 0, 0, -scale, left - 66 * scale, bottom + 450 * scale)
    pdf.setFillColor(color)
    pdf.drawPath(svg_path(pdf, UPPER, (-10, 36)), fill=1, stroke=0)
    pdf.drawPath(svg_path(pdf, LOWER), fill=1, stroke=0)
    pdf.restoreState()
    return 372 * scale


def draw_lockup(pdf, product, left, baseline, size, color=CHARCOAL, accent=OLIVE):
    pdf.setFont("SpaceGrotesk", size)
    pdf.setFillColor(color)
    pdf.drawString(left, baseline, "Make ")
    make_width = pdfmetrics.stringWidth("Make ", "SpaceGrotesk", size)
    pdf.setFillColor(accent)
    pdf.drawString(left + make_width, baseline, product)
    product_width = pdfmetrics.stringWidth(product, "SpaceGrotesk", size)
    pdf.setFillColor(color)
    pdf.drawString(left + make_width + product_width, baseline, " a")
    prefix_width = make_width + product_width + pdfmetrics.stringWidth(" a", "SpaceGrotesk", size)
    mark_left = left + prefix_width + size * 0.24
    mark_height = size * 0.69
    mark_width = draw_mark(pdf, mark_left, baseline - size * 0.03, mark_height, color)
    tory_left = mark_left + mark_width - size * 0.015
    pdf.drawString(tory_left, baseline, "tory")
    return tory_left + pdfmetrics.stringWidth("tory", "SpaceGrotesk", size)


def heading(pdf, title, kicker=None):
    if kicker:
        pdf.setFillColor(OLIVE)
        pdf.setFont("SpaceGrotesk", 9)
        pdf.drawString(48, H - 42, kicker.upper())
    pdf.setFillColor(CHARCOAL)
    pdf.setFont("SpaceGrotesk", 25)
    pdf.drawString(48, H - 74, title)


def footer(pdf, page):
    pdf.setStrokeColor(HAIRLINE)
    pdf.line(48, 35, W - 48, 35)
    pdf.setFillColor(MUTED)
    pdf.setFont("SpaceGrotesk", 7.5)
    pdf.drawString(48, 21, "MAKE IT A STORY · BRAND ASSETS · 2026-09-04")
    pdf.drawRightString(W - 48, 21, str(page))


def page_cover(pdf):
    pdf.setFillColor(CREAM)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    draw_mark(pdf, 65, 232, 245, CHARCOAL)
    pdf.setFillColor(OLIVE)
    pdf.setFont("SpaceGrotesk", 10)
    pdf.drawString(420, 425, "APPROVED MASTER · TOP-DOWN 36")
    draw_lockup(pdf, "It", 420, 330, 42, CHARCOAL, OLIVE)
    pdf.setFillColor(MUTED)
    pdf.setFont("SpaceGrotesk", 11)
    pdf.drawString(420, 294, "A film-ribbon S with a perpendicular cut")
    pdf.drawString(420, 277, "and a deliberate shift along the cut line.")
    pdf.setStrokeColor(HAIRLINE)
    pdf.line(420, 248, W - 60, 248)
    pdf.setFillColor(CHARCOAL)
    pdf.setFont("SpaceGrotesk", 9)
    pdf.drawString(420, 224, "MASTER LOGO, PRODUCT-FAMILY LOCKUPS,")
    pdf.drawString(420, 209, "FAVICON SYSTEM AND PRINT SPECIFICATION")
    footer(pdf, 1)
    pdf.showPage()


def page_family(pdf):
    pdf.setFillColor(WHITE)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    heading(pdf, "Product-family lockups", "The mark is the S in Story")
    rows = [
        ("It", 400),
        ("Clip", 275),
        ("Travel", 150),
    ]
    for product, baseline in rows:
        draw_lockup(pdf, product, 72, baseline, 48, CHARCOAL, OLIVE)
        pdf.setStrokeColor(HAIRLINE)
        pdf.line(72, baseline - 28, W - 72, baseline - 28)
    pdf.setFillColor(MUTED)
    pdf.setFont("SpaceGrotesk", 8.5)
    pdf.drawString(72, 82, "Use these outlined SVG lockups at 32 px height and above. Below 32 px, pair the standalone mark with live interface text.")
    footer(pdf, 2)
    pdf.showPage()


def page_color(pdf):
    pdf.setFillColor(CREAM)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    heading(pdf, "Color and one-color variants", "Reproduction")

    cards = [
        (CHARCOAL, CREAM, "PRIMARY", "#22221D", "RGB 34 · 34 · 29", "CMYK 0 · 0 · 15 · 87"),
        (OLIVE, WHITE, "OLIVE", "#697C37", "RGB 105 · 124 · 55", "CMYK 15 · 0 · 56 · 51"),
        (BLACK, WHITE, "BLACK", "#000000", "RGB 0 · 0 · 0", "CMYK 0 · 0 · 0 · 100"),
        (WHITE, CHARCOAL, "REVERSE", "#FFFFFF", "RGB 255 · 255 · 255", "CMYK 0 · 0 · 0 · 0"),
    ]
    card_width = 165
    gap = 18
    start_x = 48
    for index, (mark_color, background, label, hex_value, rgb, cmyk) in enumerate(cards):
        x = start_x + index * (card_width + gap)
        pdf.setFillColor(background)
        pdf.roundRect(x, 205, card_width, 265, 10, fill=1, stroke=0)
        draw_mark(pdf, x + 38, 305, 104, mark_color)
        pdf.setFillColor(mark_color if background != CHARCOAL else WHITE)
        pdf.setFont("SpaceGrotesk", 9)
        pdf.drawString(x + 18, 275, label)
        pdf.setFont("SpaceGrotesk", 12)
        pdf.drawString(x + 18, 250, hex_value)
        pdf.setFont("SpaceGrotesk", 7.5)
        pdf.drawString(x + 18, 229, rgb)
        pdf.drawString(x + 18, 214, cmyk)

    pdf.setFillColor(CHARCOAL)
    pdf.setFont("SpaceGrotesk", 9)
    pdf.drawString(48, 148, "Interface accent")
    pdf.setFillColor(LIME)
    pdf.roundRect(48, 94, 94, 38, 6, fill=1, stroke=0)
    pdf.setFillColor(CHARCOAL)
    pdf.drawString(157, 110, "#D9FB76 · never split-color the two ribbon lengths")
    pdf.setFillColor(MUTED)
    pdf.setFont("SpaceGrotesk", 7.5)
    pdf.drawString(48, 67, "CMYK values are process approximations. Approve a physical proof for color-critical print work.")
    footer(pdf, 3)
    pdf.showPage()


def page_rules(pdf):
    pdf.setFillColor(WHITE)
    pdf.rect(0, 0, W, H, fill=1, stroke=0)
    heading(pdf, "Size, clear space and production gate", "Usage")

    square_x, square_y, square_size = 55, 165, 290
    pdf.setStrokeColor(HAIRLINE)
    pdf.setDash(4, 4)
    pdf.rect(square_x + 29, square_y + 29, square_size * 0.8, square_size * 0.8, fill=0, stroke=1)
    pdf.setDash()
    draw_mark(pdf, square_x + 50, square_y + 58, 184, CHARCOAL)
    pdf.setFillColor(MUTED)
    pdf.setFont("SpaceGrotesk", 7.5)
    pdf.drawCentredString(square_x + square_size / 2, square_y - 18, "80% neutral icon safe area")

    x = 400
    pdf.setFillColor(CHARCOAL)
    pdf.setFont("SpaceGrotesk", 11)
    pdf.drawString(x, 422, "Minimum size")
    pdf.setFont("SpaceGrotesk", 8.5)
    pdf.drawString(x, 400, "Display mark: 32 px · Compact master: 16–31 px")
    pdf.drawString(x, 384, "Horizontal lockup: 32 px minimum height")

    pdf.setFont("SpaceGrotesk", 11)
    pdf.drawString(x, 344, "Clear space")
    pdf.setFont("SpaceGrotesk", 8.5)
    pdf.drawString(x, 322, "x = 68/512, the straight terminal thickness")
    pdf.drawString(x, 306, "Mark: 1x on all sides · Lockup: 0.75x")

    pdf.setFont("SpaceGrotesk", 11)
    pdf.drawString(x, 266, "Never")
    pdf.setFont("SpaceGrotesk", 8.5)
    for index, item in enumerate([
        "Close the cut or change the Top-down 36 displacement",
        "Rotate, stretch, outline or shadow the mark",
        "Recolor the two ribbon lengths independently",
        "Add small sprocket holes or downscale the display master to 16 px",
    ]):
        pdf.drawString(x, 244 - index * 17, f"• {item}")

    pdf.setFillColor(WARNING)
    pdf.roundRect(x - 10, 85, W - x - 40, 82, 8, fill=1, stroke=0)
    pdf.setFillColor(CHARCOAL)
    pdf.setFont("SpaceGrotesk", 9)
    pdf.drawString(x, 143, "NAME-SIMILARITY GATE")
    pdf.setFont("SpaceGrotesk", 7.8)
    pdf.drawString(x, 124, "An active Dutch marketing business uses the exact phrase")
    pdf.drawString(x, 109, "“Make it a story”. The visual identities differ, but production")
    pdf.drawString(x, 94, "launch in overlapping markets requires professional clearance.")
    footer(pdf, 4)
    pdf.showPage()


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("SpaceGrotesk", str(FONT)))
    document = canvas.Canvas(str(OUTPUT), pagesize=PAGE, pageCompression=1, pdfVersion=(1, 7))
    document.setTitle("Make It a Story brand guide")
    document.setAuthor("Make It a Story")
    document.setSubject("Approved logo, product lockups, favicon and reproduction rules")
    page_cover(document)
    page_family(document)
    page_color(document)
    page_rules(document)
    document.save()


if __name__ == "__main__":
    main()
