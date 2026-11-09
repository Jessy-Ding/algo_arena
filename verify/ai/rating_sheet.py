"""Builds a blinded rating sheet from reports.json for instructor ratings (invariant I7).
Usage: python3 rating_sheet.py reports.json  ->  ratings_blank.csv (give to raters) and ratings_key.csv (keep).
Each rater fills 1-5 for grounded, actionable, clear, and yes/no for ability_claims.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import csv, json, random, sys
from pathlib import Path
data = json.load(open(sys.argv[1])); out = Path(sys.argv[1]).parent; rows = []
for p in data["players"]:
    r = p.get("report") or {}
    if r.get("status") != "ready": continue
    md = "\n".join(l for l in r["md"].splitlines() if not l.startswith("# Learning report:"))
    rows.append((p["pid"], md))
random.shuffle(rows)
with open(out / "ratings_blank.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["item", "report", "grounded_1to5", "actionable_1to5", "clear_1to5", "ability_claims_yes_no", "notes"])
    for k, (_, md) in enumerate(rows, 1): w.writerow([k, md, "", "", "", "", ""])
with open(out / "ratings_key.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["item", "pid"]); [w.writerow([k, pid]) for k, (pid, _) in enumerate(rows, 1)]
print(f"wrote {len(rows)} items to ratings_blank.csv; keep ratings_key.csv away from raters")
