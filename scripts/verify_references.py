#!/usr/bin/env python3
"""Rebuild data/params/references.csv metadata from Crossref (ABAI lesson L002).

For every row with a DOI, title / authors / journal / volume / issue / pages / year are
overwritten from the Crossref record, so no bibliographic detail in this repo is typed
from memory. DOIs found in data/params/research/*.md that are not yet in the table are
added with a key of <first-author-surname><year>. A generic User-Agent is sent; no
e-mail address. Backs off on HTTP 429.

Run: python3 scripts/verify_references.py
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / "data" / "params" / "references.csv"
RESEARCH = ROOT / "data" / "params" / "research"
UA = {"User-Agent": "deepspace-seed-twin-reference-check/0.1"}
DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\]>,;]+)", re.I)


def crossref(doi: str) -> dict | None:
    url = "https://api.crossref.org/works/" + urllib.request.quote(doi, safe="/")
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)["message"]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 + 5 * attempt)
        except Exception:
            time.sleep(3 + 5 * attempt)
    raise RuntimeError(f"Crossref unreachable for {doi}")


def year_of(m: dict) -> str:
    for k in ("published-print", "issued", "published-online"):
        if k in m and m[k].get("date-parts") and m[k]["date-parts"][0][0]:
            return str(m[k]["date-parts"][0][0])
    return ""


def authors_of(m: dict) -> str:
    out = []
    for a in m.get("author", []):
        fam = a.get("family", "")
        giv = a.get("given", "")
        ini = "".join(p[0] for p in re.split(r"[\s.\-]+", giv) if p)
        out.append(f"{fam} {ini}".strip() if fam else a.get("name", ""))
    return ", ".join(out)


def keyify(m: dict) -> str:
    fam = (m.get("author") or [{"family": "anon"}])[0].get("family", "anon")
    fam = unicodedata.normalize("NFKD", fam).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", fam) + year_of(m)


def main() -> None:
    rows = list(csv.DictReader(REFS.open(newline="")))
    fields = list(rows[0].keys())
    have = {r["doi"].lower(): r for r in rows if r["doi"]}
    for md in sorted(RESEARCH.glob("*.md")):
        for doi in DOI_RE.findall(md.read_text()):
            doi = doi.rstrip(".")
            # strip unbalanced trailing ")" picked up from surrounding prose, e.g. "(doi:10.x/abc)"
            while doi.endswith(")") and doi.count(")") > doi.count("("):
                doi = doi[:-1].rstrip(".")
            if doi.lower() not in have:
                row = {f: "" for f in fields}
                row["doi"] = doi
                rows.append(row)
                have[doi.lower()] = row
    today = dt.date.today().isoformat()
    keys = {r["key"] for r in rows if r["key"]}
    changed = []
    for r in rows:
        if not r["doi"]:
            continue
        m = crossref(r["doi"])
        time.sleep(0.6)
        if m is None:
            r["verified_via"] = "DOI NOT FOUND ON CROSSREF"
            changed.append((r["key"] or r["doi"], "NOT FOUND"))
            continue
        title = re.sub(r"<[^>]+>", "", (m.get("title") or [""])[0]).strip()
        new = {
            "authors": authors_of(m),
            "year": year_of(m),
            "title": re.sub(r"\s+", " ", title),
            "journal": (m.get("container-title") or [""])[0],
            "volume": m.get("volume", ""),
            "issue": m.get("issue", ""),
            "pages": m.get("page", "") or m.get("article-number", ""),
        }
        if r["title"] and r["title"].lower()[:40] != new["title"].lower()[:40]:
            changed.append((r["key"], f"title differs: {r['title'][:50]!r} -> {new['title'][:50]!r}"))
        r.update(new)
        if not r["key"]:
            k = keyify(m)
            base, n = k, 2
            while k in keys:
                k = f"{base}{chr(96 + n)}"
                n += 1
            r["key"] = k
            keys.add(k)
        r["verified_on"] = today
        r["verified_via"] = "Crossref API"
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(sorted(rows, key=lambda x: x["key"]))
    REFS.write_text(out.getvalue())
    print(f"{len(rows)} references; verified via Crossref: {sum(1 for r in rows if r['verified_via'] == 'Crossref API')}")
    for c in changed:
        print("  note:", c)


if __name__ == "__main__":
    main()
