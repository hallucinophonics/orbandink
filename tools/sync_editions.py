#!/usr/bin/env python3
"""
sync_editions.py — refresh data/editions.csv from the bookshelf's release sheet.

The catalogue is more than print: every title is also produced as an
audiobook, most as an immersive audiobook and an audio drama, and four series
as graphic novels. The production pipeline records each of those in
bookshelf/RELEASE_STATUS.csv; this copies the *existence* of an edition into
the site's own data so build.py never depends on a sibling checkout.

    python3 tools/sync_editions.py                       # ../bookshelf
    python3 tools/sync_editions.py /path/to/RELEASE_STATUS.csv

It also brings each audio edition's own square cover across (audiobook,
immersive audiobook, audio drama) as covers/audio/<book>-<format>.jpg, so
the Listen editions on a book page look like things you can pick up. That
step needs macOS `sips`; without it the covers are skipped and the page
shows the format glyph instead.

What is copied is only "this edition is being made". Whether it is on sale is
decided by data/store_links.csv, exactly as for print: an edition with a store
row shows as available, one without shows as in production. Nothing here can
put a buy button on the site.
"""
import csv
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT.parent / "bookshelf" / "RELEASE_STATUS.csv"

# release-sheet product → the site's edition token (display order below)
PRODUCT = {
    "ebook": "ebook",
    "paperback": "paperback",
    "hardcover": "hardcover",
    "audiobook": "audiobook",
    "audiobook (standard)": "audiobook",
    "audiobook (standard ru)": "audiobook",
    "audiobook (immersive)": "immersive",
    "audiobook (immersive ru)": "immersive",
    "audio drama": "drama",
    "graphic novel": "graphic",
}
ORDER = ["ebook", "paperback", "hardcover", "audiobook", "immersive", "drama", "graphic"]
# the square cover each audio edition is sold under, in the book's assets/
AUDIO_ART = {"audiobook": "cover_square.jpg", "immersive": "cover_square_immersive.jpg",
             "drama": "cover_square_drama.jpg"}


def slug(title):
    """'01 As-Is, No Returns' → 'as-is-no-returns' (the site's book id)."""
    s = re.sub(r"^\d+\s+", "", title.strip().lower())
    s = re.sub(r"(?<=\d),(?=\d)", "", s)          # 12,000 → 12000
    s = s.replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    if not src.exists():
        sys.exit(f"release sheet not found: {src}")
    with open(ROOT / "data" / "books.csv", encoding="utf-8-sig", newline="") as f:
        ids = [r["id"] for r in csv.DictReader(f)]
    found = {i: set() for i in ids}
    home = {}                      # book id → its folder on the bookshelf
    unknown = set()
    with open(src, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            token = PRODUCT.get(r["product"].strip().lower())
            if not token or r["status"].strip().lower() == "n/a":
                continue
            bid = slug(r["book"])
            if bid in found:
                found[bid].add(token)
                parts = Path(r.get("path", "")).parts
                if len(parts) >= 3 and parts[1] == "books":
                    home.setdefault(bid, src.parent / Path(*parts[:3]))
            else:
                unknown.add(r["book"])
    out = ROOT / "data" / "editions.csv"
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["book_id", "format"])
        for bid in ids:
            for token in ORDER:
                if token in found[bid]:
                    w.writerow([bid, token])
    n = sum(len(v) for v in found.values())
    print(f"wrote {out.relative_to(ROOT)} — {n} editions across {len(ids)} books")
    art = 0
    if shutil.which("sips"):
        dest = ROOT / "covers" / "audio"
        dest.mkdir(parents=True, exist_ok=True)
        for bid in ids:
            for token, name in AUDIO_ART.items():
                pic = home.get(bid, Path()) / "assets" / name
                if token not in found[bid] or not pic.exists():
                    continue
                target = dest / f"{bid}-{token}.jpg"
                if not target.exists() or pic.stat().st_mtime > target.stat().st_mtime:
                    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80",
                                    "-Z", "360", str(pic), "--out", str(target)],
                                   check=True, capture_output=True)
                art += 1
        print(f"audio edition covers in covers/audio/: {art}")
    else:
        print("  · sips not found — audio edition covers skipped")
    for bid in ids:
        if not found[bid]:
            print(f"  ⚠ no editions found for {bid}")
    for t in sorted(unknown):
        print(f"  ⚠ release-sheet title not in books.csv: {t}")


if __name__ == "__main__":
    main()
