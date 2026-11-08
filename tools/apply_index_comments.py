"""Inserts the JSDoc comment overlay into the built site/index.html.

The page is generated from the frozen 2.1.1 Artifact by build-from-2.1.1.py, so comments cannot be written into
site/index.html by hand: the next build would drop them. Instead each comment lives in tools/index-comments/*.json,
keyed by the exact text of the line it documents, and is inserted above that line as the last build step. The
frozen source is never modified, and removing the inserted lines gives back the uncommented build byte for byte.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.

Usage:
    python3 tools/apply_index_comments.py --check tools/index-comments/part-1.json [site/index.html]
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY_DIR = os.path.join(HERE, "index-comments")


def load_entries(paths=None):
    """Returns {"anchor", "comment"} entries tagged with "_src", from `paths` or every index-comments/*.json.

    "anchor" is the exact text of the documented line; "comment" is one unindented /** ... */ block.
    """
    out = []
    for p in paths if paths is not None else sorted(glob.glob(os.path.join(OVERLAY_DIR, "*.json"))):
        for e in json.load(open(p, encoding="utf-8")):
            out.append({**e, "_src": os.path.basename(p)})
    return out


def script_range(lines):
    starts = [i for i, l in enumerate(lines) if l.strip() == "<script>"]
    if len(starts) != 1:
        raise ValueError(f"expected one inline <script> line, found {len(starts)}")
    end = next(i for i in range(starts[0] + 1, len(lines)) if lines[i].strip() == "</script>")
    return starts[0], end


def problems(lines, entries):
    errs = []
    start, end = script_range(lines)
    seen = {}
    for e in entries:
        where = f'{e["_src"]}: {e["anchor"].strip()[:80]!r}'
        hits = [i for i, l in enumerate(lines) if l == e["anchor"]]
        if len(hits) != 1:
            errs.append(f"{where}: anchor matches {len(hits)} lines, expected 1")
            continue
        i = hits[0]
        if not start < i < end:
            errs.append(f"{where}: anchor is outside the inline script")
        if i in seen:
            errs.append(f"{where}: line already documented by {seen[i]}")
        seen[i] = e["_src"]
        c = e["comment"].strip()
        if not (c.startswith("/**") and c.endswith("*/")) or "*/" in c[3:-2] or "</script" in c.lower():
            errs.append(f"{where}: comment must be one /** ... */ block without '*/' or '</script' inside")
    return errs


def apply(text, entries):
    """Inserts each comment above its anchor line, indented like it; exits if problems() reports anything.

    Exiting rather than skipping means a bad overlay never produces a page.
    """
    lines = text.split("\n")
    errs = problems(lines, entries)
    if errs:
        sys.exit("index comment overlay rejected:\n  " + "\n  ".join(errs))
    by_line = {lines.index(e["anchor"]): e["comment"].strip() for e in entries}
    out = []
    for i, l in enumerate(lines):
        if i in by_line:
            indent = l[: len(l) - len(l.lstrip())]
            out.extend(indent + c.strip() if k == 0 else indent + " " + c.strip() for k, c in enumerate(by_line[i].split("\n")))
        out.append(l)
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--check":
        page = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HERE, "..", "site", "index.html")
        errs = problems(open(page, encoding="utf-8").read().split("\n"), load_entries([sys.argv[2]]))
        print("\n".join(errs) or f"OK: {len(load_entries([sys.argv[2]]))} entries")
        sys.exit(1 if errs else 0)
    sys.exit(__doc__)
