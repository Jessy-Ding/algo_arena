"""Bland-Altman analysis of recorded vs true tap delay (invariant I4).
Usage: python3 bland_altman.py timing.csv [--limit 250]
Writes timing-summary.json and timing-bland-altman.png next to the CSV. PASS if both 95% limits of agreement
(bias +/- 1.96 SD of recorded - true) lie inside +/- limit ms. Refused answers are counted and reported, not dropped.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import csv, json, sys
from pathlib import Path
import numpy as np

def main():
    src = Path(sys.argv[1]); limit = float(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 250.0
    rows = list(csv.DictReader(src.open()))
    ok = [r for r in rows if r["outcome"] == "accepted"]
    true = np.array([float(r["true_delay_ms"]) for r in ok]); rec = np.array([float(r["recorded_ms"]) for r in ok]); d = rec - true
    bias = float(d.mean()); sd = float(d.std(ddof=1)); lo, hi = bias - 1.96 * sd, bias + 1.96 * sd
    s = {"n_trials": len(rows), "n_accepted": len(ok), "n_refused": len(rows) - len(ok), "bias_ms": round(bias, 1), "sd_ms": round(sd, 1),
         "loa_low_ms": round(lo, 1), "loa_high_ms": round(hi, 1), "limit_ms": limit, "share_within_limit": round(float((abs(d) <= limit).mean()), 3),
         "pass": bool(lo >= -limit and hi <= limit and len(ok) == len(rows))}
    (src.parent / "timing-summary.json").write_text(json.dumps(s, indent=2))
    try:
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        m = (rec + true) / 2; fig, ax = plt.subplots(figsize=(7, 4.5)); ax.scatter(m, d, s=12)
        for y, ls in [(bias, "-"), (lo, "--"), (hi, "--"), (limit, ":"), (-limit, ":")]: ax.axhline(y, linestyle=ls, linewidth=1)
        ax.set_xlabel("mean of recorded and true delay (ms)"); ax.set_ylabel("recorded - true (ms)"); ax.set_title(f"Bland-Altman, n={len(ok)}, bias {bias:.0f} ms, LoA [{lo:.0f}, {hi:.0f}]")
        fig.tight_layout(); fig.savefig(src.parent / "timing-bland-altman.png", dpi=150)
    except ImportError:
        print("matplotlib not installed; skipped the plot")
    print(json.dumps(s, indent=2)); sys.exit(0 if s["pass"] else 1)

if __name__ == "__main__":
    main()
