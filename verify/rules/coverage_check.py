"""Check the Firestore emulator's rules coverage (ruleCoverage JSON) against the round-1 threshold:
every boolean condition in firestore.rules was evaluated both true and false.

Usage: python3 verify/rules/coverage_check.py firestore.rules cov1.json [cov2.json ...]
Several reports (one per test file: loading rules resets the emulator's counters) are merged by source position.
Prints every boolean expression with the values it took, then a summary. Exit 1 if any expression misses true or
false, or if an `allow ... if <expr>` line with a non-literal condition never appears in any report.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import json, re, sys

rules_path, cov_paths = sys.argv[1], sys.argv[2:]
src = open(rules_path, encoding="utf-8").read().encode("utf-8")

merged = {}  # (line, start, end) -> {value kind: count}
def walk(n):
    pos = n["sourcePosition"]; k = (pos["line"], pos["currentOffset"], pos["endOffset"]); vals = merged.setdefault(k, {})
    for v in n.get("values", []):
        kind = next(iter(v["value"]), "empty")  # "empty": the emulator recorded no value (expression short-circuited)
        key = ("true" if v["value"][kind] else "false") if kind == "boolValue" else ("error" if kind == "undefined" else kind)
        vals[key] = vals.get(key, 0) + v["count"]
    for c in n.get("children", []):
        walk(c)
for p in cov_paths:
    for n in json.load(open(p))["report"]:
        walk(n)

missing = []; nbool = 0
for (line, a, b), vals in sorted(merged.items()):
    if "true" not in vals and "false" not in vals:
        continue  # not a boolean expression (a value such as request.auth or a document)
    nbool += 1
    text = " ".join(src[a:b + 1].decode("utf-8").split())  # endOffset is inclusive
    gap = [x for x in ("true", "false") if x not in vals]
    print(f"L{line:<3} {'MISSING ' + '/'.join(gap) if gap else 'ok':<14} {json.dumps(vals):<48} {text[:100]}")
    if gap:
        missing.append((line, text, gap))

covered_lines = {line for line, _, _ in merged}
never = []
for i, l in enumerate(src.decode("utf-8").splitlines()):
    m = re.search(r"\ballow\b[^:]*:\s*if\s+(.*?);", l)
    if m and m.group(1).strip() not in ("true", "false") and i + 1 not in covered_lines:
        never.append(i + 1)
print(f"\nreports merged: {len(cov_paths)}; boolean expressions: {nbool}; missing true or false: {len(missing)}; "
      f"allow lines with a non-literal condition never evaluated: {never or 'none'}")
for line, text, gap in missing:
    print(f"  GAP L{line}: never {'/'.join(gap)}: {text[:100]}")
sys.exit(1 if missing or never else 0)
