"""Agreement and means for two raters' filled sheets (invariant I7).
Usage: python3 kappa.py rater1.csv rater2.csv
PASS if every 1-5 item has mean >= 4 (both raters) and quadratic-weighted kappa >= 0.6, and no ability claims.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import csv, sys
import numpy as np
ITEMS = ["grounded_1to5", "actionable_1to5", "clear_1to5"]
def load(p):
    return {r["item"]: r for r in csv.DictReader(open(p))}
def wkappa(a, b, k=5):
    """Cohen's kappa with quadratic weights; ratings are integers in 1..k."""
    a, b = np.asarray(a) - 1, np.asarray(b) - 1; O = np.zeros((k, k))
    for x, y in zip(a, b): O[x, y] += 1
    W = np.array([[(i - j) ** 2 / (k - 1) ** 2 for j in range(k)] for i in range(k)]); E = np.outer(O.sum(1), O.sum(0)) / O.sum()
    return 1 - (W * O).sum() / (W * E).sum() if (W * E).sum() else None  # undefined when ratings have no variance
r1, r2 = load(sys.argv[1]), load(sys.argv[2]); ids = sorted(set(r1) & set(r2), key=int); ok = True
for it in ITEMS:
    a = [int(r1[i][it]) for i in ids]; b = [int(r2[i][it]) for i in ids]; m = (np.mean(a) + np.mean(b)) / 2; kv = wkappa(a, b)
    if kv is None: good = m >= 4 and a == b; ks = "undefined (no variance; exact agreement " + ("yes" if a == b else "no") + ")"
    else: good = m >= 4 and kv >= 0.6; ks = f"{kv:.2f}"
    ok &= good; print(f"{it}: mean {m:.2f}, weighted kappa {ks} {'ok' if good else 'BELOW THRESHOLD'}")
claims = sum(1 for i in ids for r in (r1, r2) if r[i]["ability_claims_yes_no"].strip().lower().startswith("y"))
print(f"ability claims flagged: {claims}"); ok &= claims == 0
print("PASS" if ok else "FAIL"); sys.exit(0 if ok else 1)
