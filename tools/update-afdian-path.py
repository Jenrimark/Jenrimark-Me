# -*- coding: utf-8 -*-
from pathlib import Path

tsx = Path(r"D:\DIY\apps\web\src\components\HomeExperience.tsx")
new_d = Path(r"D:\DIY\apps\web\src\components\afdian-path.txt").read_text(encoding="utf-8").strip()
src = tsx.read_text(encoding="utf-8")

import re
pat = re.compile(
    r'(<div className="scene-social-wrap scene-social-wrap-afdian">.*?<path fillRule="evenodd" d=")(.*?)(")',
    re.S,
)
m = pat.search(src)
if not m:
    raise SystemExit("afdian path not found")
src = src[: m.start(2)] + new_d + src[m.end(2) :]
tsx.write_text(src, encoding="utf-8")
print("updated path_len", len(new_d))
