#!/usr/bin/env python3
"""Regenerate the /resume page from resume.docx.

Standard library only — no pip install, in CI or locally.

    python tools/build_resume.py            parse, render, write
    python tools/build_resume.py --check    parse, render, validate; write nothing

resume.docx is the source of truth. Nusayb-Nurani-Resume.pdf is never parsed;
it is read only for its CreationDate, which dates the "Updated" line.
"""

import argparse
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / "resume.docx"
PDF = ROOT / "Nusayb-Nurani-Resume.pdf"
PAGE = ROOT / "resume.html"
DATA = ROOT / "data" / "resume.json"
LINKS = ROOT / "data" / "resume-links.json"

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

SITE = "https://nusayb.me"
PERSON_ID = f"{SITE}/#nusayb"
GITHUB = "https://github.com/inarun"

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}
MONTH_RE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{4})\b")

COURSEWORK_PREFIX = "Relevant Coursework:"
LEADING_HOST = re.compile(r"^https?://(www[.])?")


# ── parse ────────────────────────────────────────────────────────────────

def _runs(p):
    """(bold, text) per run, with tabs preserved — tabs separate role from dates."""
    out = []
    for r in p.iter(W + "r"):
        rPr = r.find(W + "rPr")
        bold = rPr is not None and rPr.find(W + "b") is not None
        text = "".join((n.text or "") if n.tag == W + "t" else "\t"
                       for n in r if n.tag in (W + "t", W + "tab"))
        if text:
            out.append((bold, text))
    return out


def _blocks(body, rels):
    """Yield (kind, payload) for every top-level block, in document order."""
    for el in body:
        tag = el.tag.replace(W, "")
        if tag == "p":
            pPr = el.find(W + "pPr")
            style = "Normal"
            numbered = False
            if pPr is not None:
                st = pPr.find(W + "pStyle")
                if st is not None:
                    style = st.get(W + "val")
                numbered = pPr.find(W + "numPr") is not None
            links = [rels.get(h.get(R + "id"))
                     for h in el.iter(W + "hyperlink") if h.get(R + "id") in rels]
            yield "p", {"style": style, "list": numbered,
                        "runs": _runs(el), "links": links}
        elif tag == "tbl":
            cells = ["".join("".join(t.text or "" for t in p.iter(W + "t"))
                             for p in tc.findall(W + "p"))
                     for tr in el.findall(W + "tr") for tc in tr.findall(W + "tc")]
            yield "tbl", " ".join(c for c in cells if c).strip()


def _slug(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def parse_docx(path):
    z = zipfile.ZipFile(path)
    xml = z.read("word/document.xml")
    if b"<w:ins " in xml or b"<w:del " in xml:
        raise SystemExit(
            "resume.docx contains unresolved tracked changes. Word paragraphs inside "
            "revision marks are skipped when reading, which would silently drop "
            "content. Accept or reject all changes in Word, re-save, and retry."
        )

    rels = {r.get("Id"): r.get("Target") for r in
            ET.fromstring(z.read("word/_rels/document.xml.rels"))}
    body = ET.fromstring(xml).find(W + "body")

    data = {"basics": {}, "sections": []}
    orphans = []
    header = []
    section = None
    entry = None

    for kind, payload in _blocks(body, rels):
        if kind == "tbl":
            # A single-cell table is how Word draws the horizontal rules here.
            # With text it is a section heading; empty it is the rule under the name.
            if not payload:
                continue
            section = {"title": payload.title() if payload.isupper() else payload,
                       "id": _slug(payload), "entries": [], "skills": []}
            data["sections"].append(section)
            entry = None
            continue

        text = "".join(t for _, t in payload["runs"]).strip()
        if not text:
            continue

        # Word Heading styles work as section headings too, if the rules are ever replaced.
        if re.fullmatch(r"Heading[1-3]", payload["style"] or ""):
            section = {"title": text, "id": _slug(text), "entries": [], "skills": []}
            data["sections"].append(section)
            entry = None
            continue

        if section is None:
            header.append(payload)
            continue

        if payload["list"]:
            if entry is None:
                orphans.append(text)
                continue
            if text.startswith(COURSEWORK_PREFIX):
                entry["coursework"] = text[len(COURSEWORK_PREFIX):].strip()
            else:
                entry["bullets"].append(text)
            continue

        if "\t" in text:                                    # role + dates row
            parts = [p.strip() for p in text.split("\t") if p.strip()]
            entry = {"role": parts[0], "dates": parts[1] if len(parts) > 1 else "",
                     "org": "", "note": "", "bullets": [], "coursework": ""}
            section["entries"].append(entry)
            continue

        bold_head = payload["runs"] and payload["runs"][0][0]
        if bold_head and ":" in text:                       # bold label -> skills row
            label, _, values = text.partition(":")
            section["skills"].append({"label": label.strip(), "items": values.strip()})
            continue

        if entry is not None and not entry["org"]:
            entry["org"] = text
        elif entry is not None and not entry["bullets"] and not entry["note"]:
            entry["note"] = text                            # e.g. "Elected Board Member, ..."
        else:
            # Nothing may be dropped silently: a paragraph with no home usually means
            # a role line lost its tab, which reattaches the bullets below it to the
            # job above and leaves the page quietly wrong.
            orphans.append(text)

    # header: name, then the bulleted contact line
    if header:
        name = "".join(t for _, t in header[0]["runs"]).strip()
        data["basics"]["name"] = name.title() if name.isupper() else name
    for block in header[1:]:
        for target in block["links"]:
            if target.startswith("mailto:"):
                data["basics"]["email"] = target[len("mailto:"):]
            elif "linkedin.com" in target:
                data["basics"]["linkedin"] = target
    data["orphans"] = orphans
    data["basics"]["url"] = SITE + "/"
    data["updated"] = _updated()
    return data


def _updated():
    """Date of the last PDF export — i.e. when the resume was last published."""
    # docProps/core.xml is not usable here: Word leaves dcterms:modified stale
    # (it reads 2026-03-03 on a file last saved 2026-08-21).
    try:
        m = re.search(rb"/CreationDate\s*\(D:(\d{8})", PDF.read_bytes())
        if m:
            return datetime.strptime(m.group(1).decode(), "%Y%m%d").strftime("%Y-%m-%d")
    except OSError:
        pass
    return datetime.fromtimestamp(DOCX.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d")


# ── date helpers ─────────────────────────────────────────────────────────

def iso_month(month, year):
    return f"{year}-{MONTHS[month.lower().rstrip('.')]:02d}"


def date_bounds(dates):
    """(start, end, ongoing) — end is None while a role is current or expected."""
    found = MONTH_RE.findall(dates)
    start = iso_month(*found[0]) if found else None
    ongoing = "present" in dates.lower() or "expected" in dates.lower()
    end = iso_month(*found[-1]) if len(found) > 1 and not ongoing else None
    return start, end, ongoing


# ── render ───────────────────────────────────────────────────────────────

def org_link(name, orgs):
    """Enrichment value is either a URL string or {"url":…, "@type":…}."""
    value = orgs.get(name)
    if isinstance(value, str):
        return value, None
    if isinstance(value, dict):
        return value.get("url"), value.get("@type")
    return None, None


def split_list(text):
    """Split on commas, but not commas inside parentheses."""
    out, depth, buf = [], 0, ""
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            out.append(buf.strip())
            buf = ""
        else:
            buf += ch
    out.append(buf.strip())
    return [x for x in out if x]


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def wrap_times(dates):
    """Mark every 'Mon YYYY' as a <time>, leaving 'Present'/'Expected' as prose."""
    return MONTH_RE.sub(
        lambda m: f'<time datetime="{iso_month(m.group(1), m.group(2))}">{esc(m.group(0))}</time>',
        esc(dates))


def render_role(role):
    """Trailing parenthetical is a qualifier; an en dash joins a dual title."""
    m = re.match(r"^(.*?)\s*(\([^()]*\))$", role)
    if m:
        return f'{esc(m.group(1))} <span class="rp-qual">{esc(m.group(2))}</span>'
    return esc(role).replace(" – ", ' <span class="rp-sep">–</span> ')


def render_bullet(text):
    """A short Title Case phrase before a colon reads as a lead-in."""
    head, sep, tail = text.partition(": ")
    if sep and len(head) <= 60 and "." not in head:
        words = [w for w in head.split() if w[:1].isalpha()]
        if words and sum(w[0].isupper() for w in words) / len(words) >= 0.5:
            return f'<span class="rp-lead">{esc(head)}:</span> {esc(tail)}'
    return esc(text)


def render_main(data, links):
    orgs = links.get("organizations", {})
    basics = data["basics"]
    updated = datetime.strptime(data["updated"], "%Y-%m-%d")
    out = []
    a = out.append

    a('        <h1 class="sp-title">Resume</h1>')
    a('        <div class="sp-rule"></div>')
    a('        <p class="sp-sub">')
    a(f'            <a href="mailto:{esc(basics["email"])}">{esc(basics["email"])}</a>')
    if basics.get("linkedin"):
        short = LEADING_HOST.sub("", basics["linkedin"]).rstrip("/")
        a('            <span class="rp-sep" aria-hidden="true">&middot;</span>')
        a(f'            <a href="{esc(basics["linkedin"])}" target="_blank" rel="noopener">'
          f'<span class="screen-only">LinkedIn</span>'
          f'<span class="print-only">{esc(short)}</span></a>')
    a('            <span class="print-only">'
      '<span class="rp-sep" aria-hidden="true">&middot;</span>nusayb.me</span>')
    a('        </p>')
    a('')
    a('        <div class="rp-actions">')
    a(f'            <a href="{PDF.name}" class="rp-download" target="_blank" rel="noopener">'
      f'Download PDF</a>')
    a(f'            <span class="rp-updated">Updated <time datetime="{updated:%Y-%m}">'
      f'{updated:%B %Y}</time></span>')
    a('        </div>')

    for sec in data["sections"]:
        a('')
        a(f'        <section class="rp-section" id="{sec["id"]}">')
        a(f'            <h2 class="rp-section-title">{esc(sec["title"])}</h2>')

        for entry in sec["entries"]:
            a('')
            a('            <article class="rp-entry">')
            a('                <header class="rp-entry-head">')
            a('                    <div>')
            a(f'                        <h3 class="rp-role">{render_role(entry["role"])}</h3>')
            org, url = esc(entry["org"]), org_link(entry["org"], orgs)[0]
            org = (f'<a href="{esc(url)}" target="_blank" rel="noopener">{org}</a>'
                   if url else org)
            a(f'                        <p class="rp-org">{org}</p>')
            if entry["note"]:
                a(f'                        <p class="rp-note">{esc(entry["note"])}</p>')
            a('                    </div>')
            a(f'                    <p class="rp-dates">{wrap_times(entry["dates"])}</p>')
            a('                </header>')
            if entry["bullets"]:
                # role="list" survives list-style:none, which strips list semantics in VoiceOver
                a('                <ul class="rp-bullets" role="list">')
                for b in entry["bullets"]:
                    a(f'                    <li>{render_bullet(b)}</li>')
                a('                </ul>')
            if entry["coursework"]:
                a('                <p class="rp-course">'
                  '<span class="rp-course-label">Relevant coursework</span> '
                  f'{esc(entry["coursework"])}</p>')
            a('            </article>')

        if sec["skills"]:
            a('            <dl class="rp-skills">')
            for skill in sec["skills"]:
                a(f'                <dt class="rp-skill-label">{esc(skill["label"])}</dt>')
                a(f'                <dd class="rp-skill-list">{esc(skill["items"])}</dd>')
            a('            </dl>')
        a('        </section>')

    return "\n".join(out)


def render_jsonld(data, links):
    orgs = links.get("organizations", {})
    basics = data["basics"]
    work, alumni, credentials, knows = [], [], [], []
    current_role = current_org = None

    for sec in data["sections"]:
        education = "education" in sec["id"]
        for entry in sec["entries"]:
            start, end, ongoing = date_bounds(entry["dates"])
            url, kind = org_link(entry["org"], orgs)
            org = {"@type": kind or ("EducationalOrganization" if education
                                     else "Organization"),
                   "name": entry["org"]}
            if url:
                org["url"] = url

            if education:
                if org not in alumni:
                    alumni.append(org)
                # schema.org has no "in progress" state, so a credential is only
                # asserted once its date range has actually ended.
                if end and not ongoing:
                    credentials.append({
                        "@type": "EducationalOccupationalCredential",
                        "name": entry["role"], "credentialCategory": "degree",
                        "recognizedBy": dict(org),
                    })
            else:
                role = {"@type": "OrganizationRole", "roleName": entry["role"],
                        "worksFor": org}
                if start:
                    role["startDate"] = start
                if end:
                    role["endDate"] = end
                work.append(role)
                if ongoing and current_role is None:
                    current_role, current_org = entry["role"], entry["org"]

        for skill in sec["skills"]:
            knows.extend(split_list(skill["items"]))

    person = {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": basics["name"],
        "url": basics["url"],
        "email": basics["email"],
    }
    if current_role:
        # An en dash in the source joins two concurrent titles.
        titles = [t.strip() for t in current_role.split(" – ")]
        person["jobTitle"] = titles if len(titles) > 1 else titles[0]
    if work:
        person["worksFor"] = work
    if alumni:
        person["alumniOf"] = alumni
    if credentials:
        person["hasCredential"] = credentials
    if knows:
        person["knowsAbout"] = sorted(set(knows))
    person["sameAs"] = ([basics["linkedin"]] if basics.get("linkedin") else []) + [GITHUB]

    doc = {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "name": f"Resume — {basics['name']}",
        "url": f"{SITE}/resume",
        "dateModified": data["updated"],
        "mainEntity": person,
    }
    body = json.dumps(doc, indent=4, ensure_ascii=False)
    # The script element is generated too — an HTML comment inside it would leave
    # the block unparseable as JSON.
    return ('    <script type="application/ld+json">\n'
            + "\n".join("    " + line for line in body.splitlines())
            + "\n    </script>")


# ── validate ─────────────────────────────────────────────────────────────

def validate(data, links):
    """Data-level checks. Runs before rendering, so a missing field reports as a
    validation error instead of a KeyError halfway through the page."""
    errors, warnings = [], []
    sections = data["sections"]
    entries = [e for s in sections for e in s["entries"]]
    bullets = sum(len(e["bullets"]) for e in entries)

    if len(sections) < 4:
        errors.append(f"only {len(sections)} sections parsed, expected at least 4")
    if bullets < 15:
        errors.append(f"only {bullets} bullets parsed, expected at least 15")
    if not data["basics"].get("email"):
        errors.append("no email found in the contact line")
    if not data["basics"].get("name"):
        errors.append("no name found")
    for text in data.get("orphans", []):
        errors.append(f"paragraph {text[:60]!r} belongs to no entry — check that its "
                      f"role line still has a tab between the title and the dates")
    if not data["basics"].get("linkedin"):
        warnings.append("no LinkedIn link found in the contact line")

    for e in entries:
        for field in ("role", "org", "dates"):
            if not e[field]:
                errors.append(f"entry {e['role'] or '(unnamed)'!r} is missing {field}")
        if not date_bounds(e["dates"])[0]:
            errors.append(f"entry {e['role']!r} has an unparseable date range {e['dates']!r}")

    seen = {e["org"] for e in entries}
    for name in links.get("organizations", {}):
        if name not in seen:
            warnings.append(f"enrichment key {name!r} matches no organization — "
                            f"it was probably reworded in resume.docx")

    return errors, warnings


def check_html(page):
    depth = 0
    for tag in re.finditer(r"<(/?)(article|section|div|ul|dl|header|p|h2|h3)\b[^>]*?(/?)>", page):
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
        raise SystemExit(f"resume.html has no '{region}' generated region")
    return pattern.sub(lambda _: f"{start}\n{body}\n{_indent_of(start, html)}{end}", html)


def _indent_of(marker, html):
    line_start = html.rfind("\n", 0, html.index(marker)) + 1
    return html[line_start:html.index(marker)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="validate without writing any files")
    args = ap.parse_args()

    if not DOCX.exists():
        raise SystemExit(f"missing {DOCX.name} — the resume source")

    data = parse_docx(DOCX)
    links = json.loads(LINKS.read_text(encoding="utf-8")) if LINKS.exists() else {}

    errors, warnings = validate(data, links)
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)

    main_html = jsonld = ""
    if not errors:
        main_html = render_main(data, links)
        jsonld = render_jsonld(data, links)
        errors = check_html(main_html)

    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        raise SystemExit(
            f"\n{len(errors)} validation error(s) — refusing to write. "
            f"The published page keeps its last good version."
        )

    counts = (f"{len(data['sections'])} sections, "
              f"{sum(len(s['entries']) for s in data['sections'])} entries, "
              f"{sum(len(e['bullets']) for s in data['sections'] for e in s['entries'])} bullets")
    if args.check:
        print(f"ok: {counts} (nothing written)")
        return

    page = PAGE.read_text(encoding="utf-8")
    page = splice(page, "jsonld", jsonld)
    page = splice(page, "resume", main_html)
    PAGE.write_text(page, encoding="utf-8", newline="\n")

    DATA.parent.mkdir(exist_ok=True)
    DATA.write_text(json.dumps({k: v for k, v in data.items() if k != "orphans"},
                               indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8", newline="\n")

    print(f"ok: {counts} -> {PAGE.name}, {DATA.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
