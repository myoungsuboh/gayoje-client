"""
OG 소셜 카드 생성기 — public/og-image.png (1200x630).
브랜드 톤(크림 배경 + 브라운/잉크 텍스트 + 브라운 '기획서' 펠릿 + 크림 글자).

재생성: python scripts/gen_og_image.py  (Pillow + Noto Sans KR(NotoSansKR-VF) 필요)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
CREAM = (252, 250, 238)
INK = (30, 24, 19)
BROWN = (140, 98, 57)
MUTED = (111, 102, 95)
GOLD = (233, 193, 92)

# 사이트 톤에 맞춘 부드러운 모던 산세리프 — Noto Sans KR 가변폰트(wght 축)
NOTO = "C:/Windows/Fonts/NotoSansKR-VF.ttf"
PAD = 90


def kr(size, weight=700):
    """Noto Sans KR 가변폰트에서 지정 굵기 인스턴스."""
    f = ImageFont.truetype(NOTO, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f

img = Image.new("RGB", (W, H), CREAM)

# 우상단 은은한 브라운 글로우 (노란기 제거 — 따뜻한 깊이만)
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([W - 540, -280, W + 240, 380], fill=(140, 98, 57, 34))
glow = glow.filter(ImageFilter.GaussianBlur(130))
img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")

draw = ImageDraw.Draw(img)
f_eyebrow = kr(29, 600)
f_head = kr(86, 700)
f_tag = kr(31, 400)
f_foot = kr(30, 600)

# eyebrow + 짧은 밑줄
draw.text((PAD, 88), "HARNESS   /   IDEA → PLAN → CURSOR", font=f_eyebrow, fill=BROWN)
draw.rectangle([PAD, 132, PAD + 52, 136], fill=BROWN)

# headline 2줄
y1 = 180
y2 = y1 + 116
draw.text((PAD, y1), "머릿속 아이디어를", font=f_head, fill=INK)

prefix, mark, suffix = "AI가 알아듣는 ", "기획서", "로"
w_prefix = draw.textlength(prefix, font=f_head)
w_mark = draw.textlength(mark, font=f_head)
# '기획서' 브라운 펠릿 + 크림 글자 (사이트 .highlight 와 동일 — 노란색 대신 브랜드 브라운)
px = PAD + w_prefix
pad_h = 16
draw.text((PAD, y2), prefix, font=f_head, fill=INK)
draw.rounded_rectangle(
    [px - pad_h, y2 + 10, px + w_mark + pad_h, y2 + 90],
    radius=18, fill=BROWN,
)
draw.text((px, y2), mark, font=f_head, fill=CREAM)
draw.text((px + w_mark + pad_h + 8, y2), suffix, font=f_head, fill=INK)

# tagline + footer
draw.text((PAD, y2 + 150), "떠오른 생각을 적으면, AI가 알아듣는 기획서·설계로 정리해 드려요.", font=f_tag, fill=MUTED)
draw.text((PAD, H - 88), "harness-system.com", font=f_foot, fill=BROWN)

img.save("public/og-image.png")
print("saved public/og-image.png", img.size)
