# -*- coding: utf-8 -*-
"""Rebuild Aifadian icon with solid visual weight matching sibling brand icons."""
from PIL import Image, ImageFilter, ImageOps
from collections import deque
import math

SRC = r"C:\Users\Jenrimark\AppData\Roaming\Xiaomi MiMo\attachments\images\mimo-paste-1791985881390-lmg55f.png"
OUT_PNG = r"D:\DIY\apps\web\public\icons\afdian-black.png"
OUT_SVG = r"D:\DIY\apps\web\public\icons\afdian.svg"
OUT_PATH = r"D:\DIY\apps\web\src\components\afdian-path.txt"

im = Image.open(SRC).convert("RGBA")
alpha = im.split()[3]

# Work at 512 for quality. Dilate the thin line-art into a solid-ish mark
# so ink density matches GitHub/email/QQ/WeChat/Douyin neighbors.
base = alpha.resize((512, 512), Image.Resampling.LANCZOS)
# threshold then dilate via MaxFilter
mask = base.point(lambda v: 255 if v > 100 else 0)
mask = mask.filter(ImageFilter.MaxFilter(21))  # thicken strokes
# close small gaps
mask = mask.filter(ImageFilter.MinFilter(7))
mask = mask.filter(ImageFilter.MaxFilter(11))
# slight smooth
mask = mask.filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: 255 if v > 110 else 0)

# keep two eye holes: reopen small holes from original that are "eyes"
# (the original has ~2 circular dots as negative space inside the stroke body)
# After dilation those holes may be filled - punch them back from dilated-then-eroded body.
# Simpler: take original interior holes by inverting original where inside body.

def fill_from_seed(binary):
    """Fill interior holes (0-regions not connected to the image border)."""
    w, h = binary.size
    px = binary.load()
    # flood outside 0s
    outside = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y] == 0 and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y] == 0 and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and px[nx, ny] == 0:
                outside[ny][nx] = True
                q.append((nx, ny))
    # holes = 0 pixels not outside -> fill them to 255
    out = binary.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == 0 and not outside[y][x]:
                op[x, y] = 255
    return out

solid = fill_from_seed(mask)

# Restore eye holes from the ORIGINAL shape (small circular voids)
# Find small 0-components in original that sit inside the dilated body.
orig_bin = base.point(lambda v: 255 if v > 100 else 0)
w, h = orig_bin.size
op = orig_bin.load()
visited = [[False] * w for _ in range(h)]
eye_centers = []
for y in range(h):
    for x in range(w):
        if op[x, y] == 0 and not visited[y][x]:
            q = deque([(x, y)])
            visited[y][x] = True
            cells = []
            while q:
                cx, cy = q.popleft()
                cells.append((cx, cy))
                for nx, ny in ((cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1),
                               (cx+1,cy+1),(cx-1,cy-1),(cx+1,cy-1),(cx-1,cy+1)):
                    if 0 <= nx < w and 0 <= ny < h and op[nx, ny] == 0 and not visited[ny][nx]:
                        visited[ny][nx] = True
                        q.append((nx, ny))
            # small hole = eye/counter
            if 80 < len(cells) < 2500:
                sx = sum(c[0] for c in cells) // len(cells)
                sy = sum(c[1] for c in cells) // len(cells)
                eye_centers.append((sx, sy, len(cells)))

print("eye candidates", eye_centers)

# Punch eyes back into solid (as evenodd holes in SVG later via separate contours)
# For the PNG: punch circular holes
from PIL import ImageDraw
punch = solid.copy()
draw = ImageDraw.Draw(punch)
# detect eyes from original more reliably: look for 0-blobs that are fully surrounded by ink in orig
for sx, sy, n in eye_centers:
    # radius from area
    r = max(6, int((n / 3.14) ** 0.5))
    draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill=0)

# Final soft edge
punch = punch.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 255 if v > 100 else 0)

# Save black PNG
out_png = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
src_a = punch.load()
dst = out_png.load()
for y in range(512):
    for x in range(512):
        av = src_a[x, y]
        if av > 0:
            dst[x, y] = (24, 22, 20, av)
out_png.save(OUT_PNG)

# Vectorize the solid mask
a = punch.resize((320, 320), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
w = h = 320
mask = [[1 if a.getpixel((x, y)) > 115 else 0 for x in range(w)] for y in range(h)]

def n8(x, y):
    return [(x+1,y),(x+1,y+1),(x,y+1),(x-1,y+1),(x-1,y),(x-1,y-1),(x,y-1),(x+1,y-1)]

visited = [[False] * w for _ in range(h)]
comps = []
for y in range(h):
    for x in range(w):
        if mask[y][x] and not visited[y][x]:
            q = deque([(x, y)])
            visited[y][x] = True
            cells = []
            while q:
                cx, cy = q.popleft()
                cells.append((cx, cy))
                for nx, ny in n8(cx, cy):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not visited[ny][nx]:
                        visited[ny][nx] = True
                        q.append((nx, ny))
            comps.append(cells)
comps.sort(key=len, reverse=True)

def loops_of(cells):
    s = set(cells)
    edges = {}
    def add(p, b):
        edges.setdefault(p, []).append(b)
    for (x, y) in cells:
        if (x, y - 1) not in s:
            add((x, y), (x + 1, y))
        if (x + 1, y) not in s:
            add((x + 1, y), (x + 1, y + 1))
        if (x, y + 1) not in s:
            add((x + 1, y + 1), (x, y + 1))
        if (x - 1, y) not in s:
            add((x, y + 1), (x, y))
    out = []
    used = set()
    for start in list(edges):
        if start in used or start not in edges:
            continue
        loop = [start]
        used.add(start)
        cur = start
        while True:
            if cur not in edges:
                break
            ns = edges[cur]
            if not ns:
                break
            nxt = ns.pop(0)
            if not ns:
                del edges[cur]
            if nxt == start or nxt in used:
                break
            loop.append(nxt)
            used.add(nxt)
            cur = nxt
        if len(loop) >= 8:
            out.append(loop)
    return out

all_loops = []
for c in comps:
    if len(c) < 80:
        continue
    all_loops.extend(loops_of(c))

def dp(pts, eps):
    if len(pts) < 3:
        return pts
    def dist(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
    dmax = 0.0
    idx = 0
    for i in range(1, len(pts) - 1):
        d = dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax = d
            idx = i
    if dmax > eps:
        return dp(pts[: idx + 1], eps)[:-1] + dp(pts[idx:], eps)
    return [pts[0], pts[-1]]

sc = 24 / 320.0

def to_path(pts):
    n = len(pts)
    if n < 3:
        return ""
    d = f"M{pts[0][0]:.2f} {pts[0][1]:.2f}"
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}"
    return d + "Z"

parts = []
for loop in all_loops:
    s = dp(loop, 1.6)
    if len(s) < 4:
        continue
    pts = [(round(x * sc, 2), round(y * sc, 2)) for x, y in s]
    if math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 0.08:
        pts = pts[:-1]
    parts.append(to_path(pts))

path = "".join(parts)
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="#181614">'
    f'<path fill-rule="evenodd" d="{path}"/></svg>\n'
)
with open(OUT_SVG, "w", encoding="utf-8") as f:
    f.write(svg)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(path)

# ink density check
ink = sum(1 for y in range(512) for x in range(512) if punch.getpixel((x, y)) > 128)
print("ink density", round(ink / (512 * 512), 4), "path_len", len(path), "parts", len(parts))
print("saved", OUT_PNG, OUT_SVG)
