"""Builds test/e2e/app.html from site/index.html with the mock SDK and a per-frame clock skew injected.

It also copies platform-firebase.js and functions/coach-core.js into test/e2e and writes a firebase-config.js there
with the AI path (coach) enabled, so the end-to-end test does not depend on the deploy config.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import shutil
from pathlib import Path
T = Path(__file__).resolve().parent; SITE = T.parent.parent / "site"
s = (SITE / "index.html").read_text(encoding="utf-8")
inj = """<script>
(function () { const q = new URLSearchParams(location.search); const skew = Number(q.get("skew") || 0); const real = Date.now.bind(Date);
  Date.now = () => real() + skew; window.open = () => null; window.AA_FIREBASE_SDK = "./mock-sdk/";
  window.confirm = () => false; window.prompt = () => null;
  const M = window.parent.__FB;
  window.addEventListener("error", (e) => M.errs.push(q.get("u") + ": " + e.message));
  window.addEventListener("unhandledrejection", (e) => M.errs.push(q.get("u") + ": rejection " + ((e.reason && e.reason.message) || e.reason))); })();
</script>
"""
assert s.count("<head>") == 1
(T / "app.html").write_text(s.replace("<head>", "<head>\n" + inj, 1), encoding="utf-8")
shutil.copy(SITE / "platform-firebase.js", T / "platform-firebase.js")
# The test uses the mock SDK, so it must not depend on the deploy config: enable the AI path regardless of `coach`.
cfg = (SITE / "firebase-config.js").read_text(encoding="utf-8").replace("coach: false", "coach: true")
(T / "firebase-config.js").write_text(cfg, encoding="utf-8")
shutil.copy(T.parent.parent / "functions" / "coach-core.js", T / "coach-core.js")
print("built", T / "app.html")
