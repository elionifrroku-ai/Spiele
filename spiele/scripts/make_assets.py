#!/usr/bin/env python3
"""Generate PWA icons and sample photos for Spiele."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "assets" / "icons"
SAMPLES = ROOT / "assets" / "samples"
ICONS.mkdir(parents=True, exist_ok=True)
SAMPLES.mkdir(parents=True, exist_ok=True)


def circle(draw, xy, fill, outline=None, width=3):
    draw.ellipse(xy, fill=fill, outline=outline, width=width)


def rounded_rect(draw, xy, radius, fill, outline=None, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_child(draw, cx, cy, scale, hair, sweater, pants, skin="#F0C7A0"):
    s = scale

    def r(dx, dy, w, h):
        return [cx + dx * s, cy + dy * s, cx + (dx + w) * s, cy + (dy + h) * s]

    # legs
    rounded_rect(draw, r(-18, 78, 14, 42), 6, pants)
    rounded_rect(draw, r(4, 78, 14, 42), 6, pants)
    # shoes
    rounded_rect(draw, r(-20, 114, 18, 10), 4, "#3A2A1F")
    rounded_rect(draw, r(2, 114, 18, 10), 4, "#3A2A1F")
    # body
    rounded_rect(draw, r(-28, 18, 56, 68), 18, sweater)
    # arms
    rounded_rect(draw, r(-42, 28, 16, 48), 8, sweater)
    rounded_rect(draw, r(26, 28, 16, 48), 8, sweater)
    # hands
    circle(draw, r(-44, 68, 18, 18), skin)
    circle(draw, r(26, 68, 18, 18), skin)
    # head
    circle(draw, r(-30, -38, 60, 60), skin)
    # hair
    draw.pieslice(r(-34, -48, 68, 52), 180, 360, fill=hair)
    draw.ellipse(r(-34, -22, 16, 28), fill=hair)
    draw.ellipse(r(18, -22, 16, 28), fill=hair)
    # eyes
    circle(draw, r(-14, -12, 8, 10), "#2B2118")
    circle(draw, r(6, -12, 8, 10), "#2B2118")
    circle(draw, r(-12, -11, 3, 3), "#FFF")
    circle(draw, r(8, -11, 3, 3), "#FFF")
    # smile
    draw.arc(r(-12, -2, 24, 18), 20, 160, fill="#C46A5A", width=max(2, int(3 * s / 40)))


def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = size * 0.06
    d.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=size * 0.22,
        fill="#E07A5F",
    )
    # rug
    d.ellipse(
        [size * 0.18, size * 0.52, size * 0.82, size * 0.88],
        fill="#F2CC6B",
        outline="#D65D5D",
        width=max(2, size // 48),
    )
    d.ellipse(
        [size * 0.30, size * 0.60, size * 0.70, size * 0.82],
        fill="#7D9B76",
    )
    # pointing hand
    hx, hy = size * 0.32, size * 0.34
    s = size / 512
    d.rounded_rectangle(
        [hx, hy, hx + 90 * s, hy + 70 * s],
        radius=24 * s,
        fill="#F0C7A0",
    )
    d.rounded_rectangle(
        [hx + 78 * s, hy + 8 * s, hx + 210 * s, hy + 28 * s],
        radius=12 * s,
        fill="#F0C7A0",
    )
    d.ellipse(
        [hx + 8 * s, hy + 42 * s, hx + 48 * s, hy + 82 * s],
        fill="#F0C7A0",
    )
    return img


def make_two_children():
    w, h = 960, 720
    img = Image.new("RGB", (w, h), "#C8DCC0")
    d = ImageDraw.Draw(img)
    # wall
    d.rectangle([0, 0, w, 430], fill="#F6E2C4")
    # window
    rounded_rect(d, [70, 40, 340, 300], 18, "#A8D4F0", "#E8D5B5", 8)
    d.rectangle([70, 160, 340, 168], fill="#E8D5B5")
    d.rectangle([200, 40, 208, 300], fill="#E8D5B5")
    circle(d, [250, 80, 310, 140], "#F2CC6B")
    # floor
    d.rectangle([0, 430, w, h], fill="#DDB07A")
    d.ellipse([80, 470, 880, 700], fill="#D65D5D", outline="#F7E9C8", width=10)
    d.ellipse([180, 510, 780, 670], fill="#F2CC6B")
    draw_child(d, 310, 310, 1.55, hair="#4A2E1C", sweater="#E05C4A", pants="#3D5A80")
    draw_child(d, 650, 318, 1.5, hair="#E8C36A", sweater="#3D8B6E", pants="#7A4E2D")
    img = img.filter(ImageFilter.SMOOTH)
    return img


def make_puppy():
    w, h = 840, 640
    img = Image.new("RGB", (w, h), "#EFE4C8")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 420, w, h], fill="#C9A27A")
    d.ellipse([180, 430, 660, 560], fill="#B08968")
    cx, cy, s = 420, 300, 2.1

    def R(dx, dy, ww, hh):
        return [cx + dx * s, cy + dy * s, cx + (dx + ww) * s, cy + (dy + hh) * s]

    fur, ear, belly = "#C9853A", "#8B5A2B", "#F3D5A8"
    # tail
    d.pieslice(R(70, -10, 50, 40), 300, 80, fill=fur)
    # body
    d.ellipse(R(-70, -10, 140, 95), fill=fur)
    d.ellipse(R(-40, 10, 80, 60), fill=belly)
    # legs
    for dx in (-55, -20, 10, 45):
        d.rounded_rectangle(R(dx, 60, 22, 42), 10, fill=fur)
    # head
    d.ellipse(R(-55, -85, 110, 95), fill=fur)
    d.ellipse(R(-70, -90, 40, 55), fill=ear)
    d.ellipse(R(30, -90, 40, 55), fill=ear)
    d.ellipse(R(-22, -40, 44, 38), fill=belly)
    d.ellipse(R(-28, -58, 16, 20), fill="#2B2118")
    d.ellipse(R(12, -58, 16, 20), fill="#2B2118")
    d.ellipse(R(-24, -54, 6, 6), fill="#FFF")
    d.ellipse(R(16, -54, 6, 6), fill="#FFF")
    d.ellipse(R(-10, -28, 20, 14), fill="#2B2118")
    d.arc(R(-16, -22, 32, 22), 20, 160, fill="#2B2118", width=4)
    img = img.filter(ImageFilter.SMOOTH)
    return img


def make_teddy():
    w, h = 840, 640
    img = Image.new("RGB", (w, h), "#D7ECF5")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 400, w, h], fill="#F4E1C1")
    d.ellipse([90, 430, 750, 620], fill="#7D9B76", outline="#F2CC6B", width=12)
    cx, cy, s = 420, 300, 2.0

    def R(dx, dy, ww, hh):
        return [cx + dx * s, cy + dy * s, cx + (dx + ww) * s, cy + (dy + hh) * s]

    brown, light, nose = "#8B5A2B", "#E6C49A", "#3A2A1F"
    d.ellipse(R(-78, -20, 50, 50), fill=brown)  # ears later behind head? arms/legs
    d.ellipse(R(-55, 10, 110, 120), fill=brown)
    d.ellipse(R(-32, 30, 64, 70), fill=light)
    d.ellipse(R(-80, 20, 48, 70), fill=brown)
    d.ellipse(R(32, 20, 48, 70), fill=brown)
    d.ellipse(R(-58, 110, 42, 38), fill=brown)
    d.ellipse(R(16, 110, 42, 38), fill=brown)
    d.ellipse(R(-78, -78, 48, 48), fill=brown)
    d.ellipse(R(30, -78, 48, 48), fill=brown)
    d.ellipse(R(-62, -70, 124, 110), fill=brown)
    d.ellipse(R(-28, -28, 56, 48), fill=light)
    d.ellipse(R(-26, -42, 16, 20), fill=nose)
    d.ellipse(R(10, -42, 16, 20), fill=nose)
    d.ellipse(R(-22, -38, 6, 6), fill="#FFF")
    d.ellipse(R(14, -38, 6, 6), fill="#FFF")
    d.ellipse(R(-12, -12, 24, 18), fill=nose)
    d.arc(R(-18, -6, 36, 24), 10, 170, fill=nose, width=4)
    img = img.filter(ImageFilter.SMOOTH)
    return img


def main():
    for size in (180, 192, 512):
        icon = make_icon(size)
        icon.save(ICONS / f"icon-{size}.png")
    make_two_children().save(SAMPLES / "two-children.png", quality=92)
    make_puppy().save(SAMPLES / "puppy.png", quality=92)
    make_teddy().save(SAMPLES / "teddy.png", quality=92)
    print("assets written")


if __name__ == "__main__":
    main()
