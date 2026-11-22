#!/usr/bin/env python3
"""
world_cards.py — one wide picture per world, for the worlds index.

The index (home page and /series/) shows every series as a lit card. The
picture on it is a still of that world's own built scene: a clean frame of
the shader or SVG scene its site opens on, without type. It is never a book
cover, never a fragment of one, and never a generated picture (owner,
2026-11-21: nothing may look AI-made; books are shown by their whole covers,
which the card does separately). This cuts each still to the card's shape:

    assets/img/worlds/<slug>-still.jpg       1280 × 720
    assets/img/worlds/<slug>-still-640.jpg    640 × 360

Source, first that exists:

    1. assets/img/worlds/stills-src/<slug>.jpg|png   a hand-placed still
    2. ../<site-folder>/assets/scenes/still.jpg      the still its site provides

    python3 tools/world_cards.py                 # every world
    python3 tools/world_cards.py the-night-tenant

Dev-only (macOS `sips`). Not part of the build: a world with no still keeps
its covers on a wash of its own colour, so nothing depends on this having
run. Run it after a series site's hero scene changes, then `python3 build.py`.
"""
import csv
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sync_worlds import SITES, SOURCES  # noqa: E402  (one map of slug → site folder)

OUT = ROOT / "assets/img/worlds"
SIZES = ((1280, 720, ""), (640, 360, "-640"))
NAME = "still"


def source(slug):
    for ext in ("jpg", "jpeg", "png"):
        p = OUT / "stills-src" / f"{slug}.{ext}"
        if p.exists():
            return p
    folder = SOURCES.get(slug)
    if folder:
        p = SITES / folder / "assets/scenes/still.jpg"
        if p.exists():
            return p
    return None


def dims(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                         check=True, capture_output=True, text=True).stdout
    vals = {k.strip(): int(v) for k, v in (ln.split(":") for ln in out.splitlines() if ":" in ln and "pixel" in ln)}
    return vals["pixelWidth"], vals["pixelHeight"]


def cut(src, dst, w, h):
    """Scale to cover w×h, then crop to it from the centre."""
    sw, sh = dims(src)
    scale = max(w / sw, h / sh)
    rw, rh = max(w, round(sw * scale)), max(h, round(sh * scale))
    with tempfile.TemporaryDirectory() as tmp:
        mid = Path(tmp) / "mid.png"
        subprocess.run(["sips", "-s", "format", "png", "-z", str(rh), str(rw), str(src), "--out", str(mid)],
                       check=True, capture_output=True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "70",
                        "-c", str(h), str(w), str(mid), "--out", str(dst)],
                       check=True, capture_output=True)


def main():
    with open(ROOT / "data/series.csv", newline="", encoding="utf-8") as f:
        slugs = [r["slug"] for r in csv.DictReader(f)]
    want = sys.argv[1:] or slugs
    OUT.mkdir(parents=True, exist_ok=True)
    for slug in want:
        if slug not in slugs:
            sys.exit(f"unknown world: {slug}")
        src = source(slug)
        if not src:
            print(f"  · {slug}: no still yet — card keeps its covers")
            continue
        for w, h, tag in SIZES:
            cut(src, OUT / f"{slug}-{NAME}{tag}.jpg", w, h)
        kb = (OUT / f"{slug}-{NAME}.jpg").stat().st_size / 1024
        print(f"  ✓ {slug}: {kb:.0f} KB  ←  {src.relative_to(SITES) if SITES in src.parents else src.name}")
    print("now run: python3 build.py")


if __name__ == "__main__":
    main()
