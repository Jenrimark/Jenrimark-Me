# -*- coding: utf-8 -*-
from pathlib import Path
import re

t = Path(r"D:\DIY\apps\web\src\components\HomeExperience.tsx").read_text(encoding="utf-8")
m = re.search(r'scene-social-wrap-afdian.*?d="([^"]+)"', t)
print("found", bool(m))
if m:
    print("path starts", m.group(1)[:80])
    print("path len", len(m.group(1)))
print("has fillRule", 'fillRule="evenodd"' in t)
print("has ifdian link", "https://ifdian.net/a/jenrimark" in t)
