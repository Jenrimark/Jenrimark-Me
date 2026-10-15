from PIL import Image, ImageFilter
from collections import deque
import math

SRC = r"C:\Users\Jenrimark\AppData\Roaming\Xiaomi MiMo\attachments\images\mimo-paste-1791985881390-lmg55f.png"
OUT_SVG = r"D:\DIY\apps\web\public\icons\afdian.svg"
OUT_PATH = r"D:\DIY\apps\web\src\components\afdian-path.txt"
OUT_PNG = r"D:\DIY\apps\web\public\icons\afdian-black.png"

im = Image.open(SRC).convert("RGBA")
# black silhouette PNG at 512
alpha_hi = im.split()[3].resize((512, 512), Image.Resampling.LANCZOS)
out_png = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
src = alpha_hi.load()
op = out_png.load()
for y in range(512):
    for x in range(512):
        av = src[x, y]
        if av > 0:
            op[x, y] = (24, 22, 20, av)
out_png.save(OUT_PNG)

# vectorize
a = im.split()[3].resize((320, 320), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.45))
w = h = 320
mask = [[1 if a.getpixel((x, y)) > 115 else 0 for x in range(w)] for y in range(h)]


def n8(x, y):
    return [
        (x + 1, y),
        (x + 1, y + 1),
        (x, y + 1),
        (x - 1, y + 1),
        (x - 1, y),
        (x - 1, y - 1),
        (x, y - 1),
        (x + 1, y - 1),
    ]


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
    if len(c) < 50:
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
    s = dp(loop, 1.8)
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
print("path_len", len(path), "parts", len(parts))
print("saved", OUT_SVG, OUT_PNG, OUT_PATH)
