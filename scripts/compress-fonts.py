# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.67.0"]
# ///
"""Lossless WOFF2 packaging of the existing OFL fonts; preserve all glyphs."""
from pathlib import Path
from fontTools.ttLib import TTFont
import json

root = Path(__file__).resolve().parents[1] / "frontend/src/app/fonts"
report = []
for source in sorted(root.glob("BeVietnamPro-*.ttf")):
    target = source.with_suffix(".woff2")
    font = TTFont(source)
    cmap = font.getBestCmap()
    metrics = dict(font["hmtx"].metrics)
    font.flavor = "woff2"
    font.save(target)
    with TTFont(target) as compressed:
        assert compressed.getBestCmap() == cmap
        assert compressed["hmtx"].metrics == metrics
    report.append({"font": source.stem, "ttfBytes": source.stat().st_size,
                   "woff2Bytes": target.stat().st_size, "characters": len(cmap)})
print(json.dumps(report))
