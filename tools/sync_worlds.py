#!/usr/bin/env python3
"""
sync_worlds.py — mount each series' own site under /worlds/<slug>/.

Every series is a world with a site of its own, built and versioned in its
own folder beside this repo (calorate-site, night-tenant-site, …). Mounting
copies each one's *served* files here, so one deploy of orbandink.co.uk
carries the imprint and all of its worlds, and every "Explore this world"
link is guaranteed to land:

    orbandink.co.uk/worlds/the-calorate/
    orbandink.co.uk/worlds/the-night-tenant/the-night-tenant.html

    python3 tools/sync_worlds.py            # mount everything found
    python3 tools/sync_worlds.py the-calorate the-night-tenant

The series sites use only relative URLs, so they work unchanged under a
sub-path. A series that later moves to a domain of its own just gets that
address in data/series.csv (as World Without Humans has) and its folder here
can be deleted. build.py only links to a world whose index.html exists, so a
series that has not been mounted simply shows no link.

Note: the series sites load their webfonts from Google Fonts. The imprint's
own pages still make no external request; the worlds do, until their fonts
are self-hosted.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITES = ROOT.parent                      # the folder holding every site repo
SOURCES = {
    "the-calorate": "calorate-site",
    "the-barycentric-creed": "barycentric-site",
    "the-universal-menu": "universal-menu-site",
    "terms-and-conditions": "terms-and-conditions-site",
    "the-breathing-dark": "breathing-dark-site",
    "the-calculus-of-fortune": "calculus-of-fortune-site",
    "the-drowned-houses": "drowned-houses-site",
    "the-night-tenant": "night-tenant-site",
    "the-relic-protocol": "relic-protocol-site",
    "the-seventh-watch": "seventh-watch-site",
    "the-human-factor": "human-factor-site",
}
# provenance, notes and repo furniture are not part of a served site
SKIP_DIRS = {"design", "docs", "node_modules", "tests", "shots", "screenshots"}
SKIP_FILES = {"README.md", "AUDIT.md", "CLAUDE.md", "robots.txt", "sitemap.xml"}


def served(src):
    for p in sorted(src.rglob("*")):
        rel = p.relative_to(src)
        if any(part.startswith(".") or part in SKIP_DIRS for part in rel.parts):
            continue
        if p.is_file() and rel.name not in SKIP_FILES and not rel.name.endswith(".dc.html"):
            yield p, rel


def main():
    want = sys.argv[1:] or list(SOURCES)
    for slug in want:
        if slug not in SOURCES:
            sys.exit(f"unknown world: {slug} (known: {', '.join(SOURCES)})")
        src = SITES / SOURCES[slug]
        if not (src / "index.html").exists():
            print(f"  · {slug}: no site at {src.name}/ yet — skipped")
            continue
        dst = ROOT / "worlds" / slug
        shutil.rmtree(dst, ignore_errors=True)
        n = size = 0
        for p, rel in served(src):
            out = dst / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, out)
            n += 1
            size += p.stat().st_size
        print(f"  ✓ {slug}: {n} files, {size / 1e6:.1f} MB  ←  {src.name}/")
    print("now run: python3 build.py")


if __name__ == "__main__":
    main()
