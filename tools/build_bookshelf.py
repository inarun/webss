#!/usr/bin/env python3
"""Regenerate the /bookshelf page from data/books.json.

Standard library only — no pip install, in CI or locally.

    python tools/build_bookshelf.py            validate, render, write
    python tools/build_bookshelf.py --check    validate, render; write nothing

data/books.json
    series[]  { id, name, author, tags[] }                       archive order
    books[]   { id, title, isbn, series?, author?, rating?, read?, favorite?, note? }

    id        kebab-case; names the covers: covers/<id>.webp, covers/large/<id>.webp
    isbn      ISBN-13, digits only
    series    a series id. A book without one is standalone and needs its own author.
    author    required on standalone books; on series books it overrides the series author
    rating    0–5 in halves
    read      YYYY, YYYY-MM, or YYYY-MM-DD. Dated books fill "Recently read", newest first.
    favorite  true puts the book under "Favorites"
    note      one line, shown in the detail view

A book whose cover files are missing renders as a titled placeholder, so a new
read can be added before its cover is made.
"""

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "books.json"
PAGE = ROOT / "bookshelf.html"
COVERS = ROOT / "covers"

SITE = "https://nusayb.me"
PAGE_URL = f"{SITE}/bookshelf"
PERSON = {"@type": "Person", "name": "Nusayb Nurani", "url": f"{SITE}/"}

RECENT_MAX = 12
EAGER = 6               # covers above the fold load at full priority; the rest lazy
COVER_W, COVER_H = 155, 235

ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
READ_RE = re.compile(r"^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$")
ISBN_RE = re.compile(r"^\d{13}$")

BOOK_KEYS = {"id", "title", "isbn", "series", "author", "rating", "read", "favorite", "note"}
SERIES_KEYS = {"id", "name", "author", "tags"}


# ── load / derive ────────────────────────────────────────────────────────

def load():
    if not DATA.exists():
        raise SystemExit(f"missing {DATA.relative_to(ROOT).as_posix()}")
    try:
        return json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"{DATA.name}: invalid JSON — {e}")


def cover_paths(book_id):
    return COVERS / f"{book_id}.webp", COVERS / "large" / f"{book_id}.webp"


def derive(data):
    """Resolve references once so every renderer reads plain values."""
    series = {s["id"]: s for s in data.get("series", []) if isinstance(s, dict) and "id" in s}
    books = []
    for raw in data.get("books", []):
        if not isinstance(raw, dict):
            continue
        s = series.get(raw.get("series"))
        thumb, large = cover_paths(raw.get("id", ""))
        books.append({
            **raw,
            "series_obj": s,
            "author_resolved": raw.get("author") or (s["author"] if s else ""),
            "has_cover": thumb.exists() and large.exists(),
        })

    by_series = {sid: [] for sid in series}
    standalone = []
    for b in books:
        (by_series[b["series"]] if b["series_obj"] else standalone).append(b)

    dated = [b for b in books if b.get("read")]
    recent = sorted(dated, key=lambda b: str(b["read"]), reverse=True)[:RECENT_MAX]
    favorites = [b for b in books if b.get("favorite") is True]

    return {"series": list(series.values()), "books": books, "by_series": by_series,
            "standalone": standalone, "recent": recent, "favorites": favorites}


# ── helpers ──────────────────────────────────────────────────────────────

def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def attr(s):
    return esc(s).replace('"', "&quot;")


def isbn13_ok(s):
    if not ISBN_RE.match(s):
        return False
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(s))
    return total % 10 == 0


def stars(rating):
    whole = int(rating)
    return "★" * whole + ("½" if rating - whole >= 0.5 else "")


def rating_label(rating):
    shown = int(rating) if float(rating).is_integer() else rating
    return f"Rated {shown} out of 5"


def read_display(value):
    m = READ_RE.match(str(value))
    if not m or not m.group(2):
        return str(value)
    return datetime(int(m.group(1)), int(m.group(2)), 1).strftime("%b %Y")


def count_label(n):
    return f"{n} book{'' if n == 1 else 's'}"


# ── render ───────────────────────────────────────────────────────────────

def render_book(book, ctx, indent):
    pad = " " * indent
    out = []
    a = out.append
    thumb = f"covers/{book['id']}.webp"
    large = f"covers/large/{book['id']}.webp"
    series = book["series_obj"]
    author = book["author_resolved"]

    attrs = [
        f'data-id="{attr(book["id"])}"',
        f'data-title="{attr(book["title"])}"',
        f'data-author="{attr(author)}"',
        f'data-series="{attr(series["name"] if series else "")}"',
        f'data-isbn="{attr(book["isbn"])}"',
    ]
    if book["has_cover"]:
        attrs.append(f'data-large="{attr(large)}"')
    if "rating" in book:
        attrs.append(f'data-rating="{book["rating"]}"')
    if book.get("read"):
        attrs.append(f'data-read="{attr(book["read"])}"')
        attrs.append(f'data-read-label="{attr(read_display(book["read"]))}"')
    if book.get("note"):
        attrs.append(f'data-note="{attr(book["note"])}"')

    a(f'{pad}<li class="book">')
    a(f'{pad}    <figure>')
    a(f'{pad}        <button type="button" class="book-cover" aria-label="{attr(book["title"])}" '
      + " ".join(attrs) + ">")
    if book["has_cover"]:
        if ctx["eager"] > 0:
            ctx["eager"] -= 1
            loading = 'fetchpriority="high"'
        else:
            loading = 'loading="lazy"'
        a(f'{pad}            <img src="{attr(thumb)}" width="{COVER_W}" height="{COVER_H}" alt="" '
          f'{loading} decoding="async">')
    else:
        a(f'{pad}            <span class="book-fallback"><span>{esc(book["title"])}</span></span>')
    a(f'{pad}        </button>')
    a(f'{pad}        <figcaption class="book-caption">')
    a(f'{pad}            <span class="book-title">{esc(book["title"])}</span>')
    own_author = book.get("author") and series and book["author"] != series["author"]
    if author and (ctx["show_author"] or own_author):
        a(f'{pad}            <span class="book-author">{esc(author)}</span>')
    if "rating" in book:
        a(f'{pad}            <span class="book-rating" role="img" aria-label="{attr(rating_label(book["rating"]))}">'
          f'{stars(book["rating"])}</span>')
    if ctx["show_read"] and book.get("read"):
        a(f'{pad}            <time class="book-read" datetime="{attr(book["read"])}">'
          f'{esc(read_display(book["read"]))}</time>')
    a(f'{pad}        </figcaption>')
    a(f'{pad}    </figure>')
    a(f'{pad}</li>')
    return out


def render_shelf(shelf_id, title, meta, tags, books, ctx, level, indent):
    pad = " " * indent
    out = []
    a = out.append
    a(f'{pad}<section class="shelf" id="{shelf_id}" aria-labelledby="{shelf_id}-title">')
    a(f'{pad}    <header class="shelf-head">')
    a(f'{pad}        <h{level} class="shelf-title" id="{shelf_id}-title">{esc(title)}</h{level}>')
    a(f'{pad}        <p class="shelf-meta">{meta}</p>')
    if tags:
        chips = "".join(f'<span class="genre-tag">{esc(t)}</span>' for t in tags)
        a(f'{pad}        <div class="shelf-tags">{chips}</div>')
    a(f'{pad}    </header>')
    # role="list" survives list-style:none, which strips list semantics in VoiceOver
    a(f'{pad}    <ul class="shelf-row" role="list">')
    for b in books:
        out.extend(render_book(b, ctx, indent + 8))
    a(f'{pad}    </ul>')
    a(f'{pad}</section>')
    return out


def render_main(model):
    out = []
    ctx = {"eager": EAGER, "show_author": True, "show_read": False}

    if model["recent"]:
        ctx["show_read"] = True
        out.extend(render_shelf("recent", "Recently read", count_label(len(model["recent"])),
                                None, model["recent"], ctx, 2, 8))
        ctx["show_read"] = False

    if model["favorites"]:
        out.extend(render_shelf("favorites", "Favorites", count_label(len(model["favorites"])),
                                None, model["favorites"], ctx, 2, 8))

    a = out.append
    a('        <section class="shelf-group" aria-labelledby="series-label">')
    a('            <h2 class="shelf-label" id="series-label">Series</h2>')
    for s in model["series"]:
        books = model["by_series"][s["id"]]
        ctx["show_author"] = False
        meta = f'{esc(s["author"])} <span class="shelf-sep" aria-hidden="true">&middot;</span> {count_label(len(books))}'
        out.extend(render_shelf(f'series-{s["id"]}', s["name"], meta, s.get("tags"), books, ctx, 3, 12))
    if model["standalone"]:
        ctx["show_author"] = True
        out.extend(render_shelf("standalone", "Standalone", count_label(len(model["standalone"])),
                                None, model["standalone"], ctx, 3, 12))
    a('        </section>')
    return "\n".join(out)


def render_jsonld(model, description):
    items = []
    for s in model["series"]:
        for b in model["by_series"][s["id"]]:
            items.append((b, s))
    for b in model["standalone"]:
        items.append((b, None))

    elements = []
    for pos, (b, s) in enumerate(items, 1):
        book = {"@type": "Book", "name": b["title"],
                "author": {"@type": "Person", "name": b["author_resolved"]},
                "isbn": b["isbn"]}
        if b["has_cover"]:
            book["image"] = f"{SITE}/covers/large/{b['id']}.webp"
        if s:
            book["isPartOf"] = {"@type": "BookSeries", "name": s["name"]}
        elements.append({"@type": "ListItem", "position": pos, "item": book})

    doc = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Bookshelf — Nusayb Nurani",
        "url": PAGE_URL,
        "description": description,
        "author": PERSON,
        "mainEntity": {"@type": "ItemList", "numberOfItems": len(elements),
                       "itemListElement": elements},
    }
    # One line per book keeps the head short and a data change a one-line diff.
    doc["mainEntity"]["itemListElement"] = "@@ITEMS@@"
    body = json.dumps(doc, indent=4, ensure_ascii=False)
    items = ",\n".join("            " + json.dumps(el, ensure_ascii=False) for el in elements)
    body = body.replace('"@@ITEMS@@"', "[\n" + items + "\n        ]")
    return ('    <script type="application/ld+json">\n'
            + "\n".join("    " + line for line in body.splitlines())
            + "\n    </script>")


# ── validate ─────────────────────────────────────────────────────────────

def validate(data, model):
    """Data-level checks. Runs before rendering, so a bad field reports as a
    validation error instead of a KeyError halfway through the page."""
    errors, warnings = [], []
    e, w = errors.append, warnings.append

    if not isinstance(data.get("series"), list):
        e('"series" must be a list')
    if not isinstance(data.get("books"), list):
        e('"books" must be a list')
    if errors:
        return errors, warnings

    seen_series = set()
    for s in data["series"]:
        if not isinstance(s, dict):
            e(f"series entry {s!r} is not an object")
            continue
        sid = s.get("id", "")
        label = f"series {sid or s.get('name') or '(unnamed)'!r}"
        for field in ("id", "name", "author"):
            if not s.get(field):
                e(f"{label} is missing {field}")
        if sid and not ID_RE.match(sid):
            e(f"{label}: id must be kebab-case")
        if sid in seen_series:
            e(f"{label}: duplicate id")
        seen_series.add(sid)
        if not isinstance(s.get("tags", []), list):
            e(f"{label}: tags must be a list")
        for key in set(s) - SERIES_KEYS:
            w(f"{label}: unknown key {key!r}")

    seen_ids, seen_titles = set(), set()
    today = date.today().isoformat()
    for b in model["books"]:
        bid = b.get("id", "")
        label = f"book {bid or b.get('title') or '(unnamed)'!r}"
        for field in ("id", "title", "isbn"):
            if not b.get(field):
                e(f"{label} is missing {field}")
        if bid and not ID_RE.match(bid):
            e(f"{label}: id must be kebab-case")
        if bid in seen_ids:
            e(f"{label}: duplicate id")
        seen_ids.add(bid)
        if b.get("title") in seen_titles:
            w(f"{label}: duplicate title")
        seen_titles.add(b.get("title"))

        if b.get("series") and not b["series_obj"]:
            e(f"{label}: series {b['series']!r} does not exist")
        if not b["author_resolved"]:
            e(f"{label}: standalone book needs an author")
        if b.get("isbn") and not isbn13_ok(str(b["isbn"])):
            e(f"{label}: isbn {b['isbn']!r} is not a valid ISBN-13")

        if "rating" in b:
            r = b["rating"]
            if isinstance(r, bool) or not isinstance(r, (int, float)) or not 0 <= r <= 5 or (r * 2) % 1:
                e(f"{label}: rating must be 0–5 in halves")
        if "read" in b:
            m = READ_RE.match(str(b["read"]))
            if not m:
                e(f"{label}: read must be YYYY, YYYY-MM, or YYYY-MM-DD")
            else:
                month, day = m.group(2), m.group(3)
                if month and not 1 <= int(month) <= 12:
                    e(f"{label}: read has month {month}")
                elif day and not 1 <= int(day) <= 31:
                    e(f"{label}: read has day {day}")
                elif str(b["read"]) > today:
                    e(f"{label}: read date {b['read']} is in the future")
        if "favorite" in b and not isinstance(b["favorite"], bool):
            e(f"{label}: favorite must be true or false")
        if "note" in b:
            if not isinstance(b["note"], str):
                e(f"{label}: note must be a string")
            elif len(b["note"]) > 160:
                w(f"{label}: note is {len(b['note'])} characters; one line reads best")
        if not b["has_cover"]:
            w(f"{label}: no cover at covers/{bid}.webp + covers/large/{bid}.webp — rendering a placeholder")
        for key in set(b) - BOOK_KEYS - {"series_obj", "author_resolved", "has_cover"}:
            w(f"{label}: unknown key {key!r}")

    for s in model["series"]:
        if not model["by_series"][s["id"]]:
            e(f"series {s['id']!r} has no books")

    if not model["favorites"]:
        w("no favorites yet — the Favorites shelf is omitted")
    if not model["recent"]:
        w("no dated books yet — the Recently read shelf is omitted")

    if COVERS.exists():
        for f in sorted(COVERS.glob("*.webp")):
            if f.stem not in seen_ids:
                w(f"{f.relative_to(ROOT).as_posix()} belongs to no book")

    return errors, warnings


def check_html(page):
    depth = 0
    for tag in re.finditer(r"<(/?)(section|header|ul|li|figure|figcaption|button|div|p|h2|h3|span|time)\b[^>]*?(/?)>", page):
        depth += -1 if tag.group(1) else (0 if tag.group(3) else 1)
        if depth < 0:
            return ["rendered HTML has an unbalanced closing tag"]
    return [f"rendered HTML has {depth} unclosed tag(s)"] if depth else []


# ── write ────────────────────────────────────────────────────────────────

def splice(html, region, body):
    start = f"<!-- BEGIN GENERATED: {region} -->"
    end = f"<!-- END GENERATED: {region} -->"
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    if not pattern.search(html):
        raise SystemExit(f"{PAGE.name} has no '{region}' generated region")
    return pattern.sub(lambda _: f"{start}\n{body}\n{_indent_of(start, html)}{end}", html)


def _indent_of(marker, html):
    line_start = html.rfind("\n", 0, html.index(marker)) + 1
    return html[line_start:html.index(marker)]


def page_description(page):
    m = re.search(r'<meta name="description" content="([^"]*)"', page)
    return m.group(1).replace("&amp;", "&") if m else ""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="validate without writing any files")
    args = ap.parse_args()

    data = load()
    model = derive(data)

    errors, warnings = validate(data, model)
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)

    page = PAGE.read_text(encoding="utf-8") if PAGE.exists() else ""
    main_html = jsonld = ""
    if not errors:
        main_html = render_main(model)
        jsonld = render_jsonld(model, page_description(page))
        errors = check_html(main_html)

    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        raise SystemExit(
            f"\n{len(errors)} validation error(s) — refusing to write. "
            f"The published page keeps its last good version."
        )

    counts = (f"{len(model['books'])} books, {len(model['series'])} series, "
              f"{len(model['recent'])} recent, {len(model['favorites'])} favorites")
    if args.check:
        print(f"ok: {counts} (nothing written)")
        return

    if not page:
        raise SystemExit(f"missing {PAGE.name} — the hand-written shell the sections are spliced into")
    page = splice(page, "jsonld", jsonld)
    page = splice(page, "bookshelf", main_html)
    PAGE.write_text(page, encoding="utf-8", newline="\n")
    print(f"ok: {counts} -> {PAGE.name}")


if __name__ == "__main__":
    main()
