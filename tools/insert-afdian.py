# -*- coding: utf-8 -*-
from pathlib import Path

tsx_path = Path(r"D:\DIY\apps\web\src\components\HomeExperience.tsx")
path_txt = Path(r"D:\DIY\apps\web\src\components\afdian-path.txt")
svg_path_d = path_txt.read_text(encoding="utf-8").strip()

src = tsx_path.read_text(encoding="utf-8")

marker = '<ContactCardBox card={CONTACT_CARDS.douyin} /></div></div></section>'
if marker not in src:
    raise SystemExit("marker not found")

icon = (
    '<ContactCardBox card={CONTACT_CARDS.douyin} /></div>'
    '<div className="scene-social-wrap scene-social-wrap-afdian">'
    '<a className="scene-social scene-social-afdian" href="https://ifdian.net/a/jenrimark" target="_blank" rel="noreferrer" title="爱发电" aria-label="爱发电">'
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">'
    f'<path fillRule="evenodd" d="{svg_path_d}" />'
    "</svg></a></div></div></section>"
)

src = src.replace(marker, icon, 1)
tsx_path.write_text(src, encoding="utf-8")
print("inserted afdian icon, path_len=", len(svg_path_d))
