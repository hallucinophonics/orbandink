#!/usr/bin/env python3
"""Fill missing books_i18n rows by transcreating the English copy.

House practice, read off the existing rows rather than assumed: the TITLE
stays in English in every language (Venice 2068 A.D. is Venice 2068 A.D. in
ja), and only tagline and synopsis are rendered. These are marketing lines,
so they are transcreated for the market rather than translated literally —
the em dash the English taglines use is kept, because the existing rows keep
it.

One model call per book covering all of its missing languages, so 34 books
cost 34 calls rather than 207. Idempotent: an existing (book, lang) row is
never touched, so a partial run resumes cleanly.

    python3 tools/fill_translations.py --check   # what is missing
    python3 tools/fill_translations.py           # fill it
"""
import argparse, csv, json, os, pathlib, re, subprocess, sys

SITE = pathlib.Path(__file__).resolve().parents[1]
LANGS = ["en", "ru", "fr", "pt", "de", "it", "es", "ja"]
NAMES = {"ru": "Russian", "fr": "French", "pt": "European Portuguese",
         "de": "German", "it": "Italian", "es": "Spanish", "ja": "Japanese"}


def read(name):
    with open(SITE / "data" / f"{name}.csv", newline="") as f:
        return list(csv.DictReader(f)), csv.DictReader(open(SITE/"data"/f"{name}.csv")).fieldnames


def claude(prompt: str) -> str:
    env = {k: v for k, v in os.environ.items()
           if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    for cfg in (os.path.expanduser("~/.claude-a"), os.path.expanduser("~/.claude-b")):
        env["CLAUDE_CONFIG_DIR"] = cfg
        p = subprocess.run(["claude", "-p", prompt, "--max-turns", "1"],
                           capture_output=True, text=True, timeout=600, env=env)
        out = (p.stdout or "").strip()
        if p.returncode == 0 and out and "usage limit" not in out.lower():
            return out
    raise RuntimeError("no account could answer")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    books, _ = read("books")
    i18n, ifields = read("books_i18n")
    have = {(r["book_id"], r["lang"]) for r in i18n}
    en = {r["book_id"]: r for r in i18n if r["lang"] == "en"}

    todo = []
    for b in books:
        miss = [l for l in LANGS[1:] if (b["id"], l) not in have]
        if miss and b["id"] in en:
            todo.append((b["id"], miss))
    print(f"{len(todo)} book(s) need {sum(len(m) for _, m in todo)} row(s)")
    if args.check:
        return 0

    written = 0
    for bid, miss in todo:
        src = en[bid]
        prompt = (
            "You are localising a literary publisher's catalogue copy. Transcreate "
            "for each market: keep the register, the rhythm and the restraint; do not "
            "translate word for word, and do not add marketing enthusiasm the English "
            "does not have. Keep the em dash where the English uses one.\n\n"
            f"TITLE (do NOT translate, for context only): {src['title']}\n"
            f"TAGLINE: {src['tagline']}\n"
            f"SYNOPSIS: {src['synopsis']}\n\n"
            "Return ONLY a JSON object, no prose, no code fence, shaped:\n"
            '{"<lang>": {"tagline": "...", "synopsis": "..."}}\n'
            f"with exactly these language keys: {', '.join(miss)}\n"
            f"({', '.join(NAMES[l] for l in miss)})."
        )
        try:
            raw = claude(prompt)
        except Exception as exc:
            print(f"  {bid}: FAILED ({exc})"); continue
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            print(f"  {bid}: no JSON in reply"); continue
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as exc:
            print(f"  {bid}: bad JSON ({exc})"); continue
        rows = []
        for lang in miss:
            d = data.get(lang)
            if not isinstance(d, dict) or not d.get("tagline") or not d.get("synopsis"):
                print(f"  {bid}/{lang}: missing in reply"); continue
            rows.append({"book_id": bid, "lang": lang, "title": src["title"],
                         "tagline": d["tagline"].strip(), "synopsis": d["synopsis"].strip(),
                         "excerpt_url": src.get("excerpt_url", "")})
        if rows:
            with open(SITE/"data"/"books_i18n.csv", "a", newline="") as f:
                csv.DictWriter(f, fieldnames=ifields).writerows(rows)
            written += len(rows)
            print(f"  {bid}: +{len(rows)} ({', '.join(r['lang'] for r in rows)})")
    print(f"\n{written} row(s) written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
