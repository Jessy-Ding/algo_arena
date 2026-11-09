"""I6 oracle: reference clicks are recorded exactly once and attributed to the right participant, session and question.

Runs the real page (site/index.html, site/platform-firebase.js) on the real Firebase JS SDK against the Auth and
Firestore emulators with the real firestore.rules. A host and two players, each in their own browser context, play a
three-question game while the players click reference links on a fixed plan: on the reveal screen (phase "live"), on
the end-screen review (phase "post", game still loaded) and from Home > Review answers (phase "post", game unloaded).
The host then builds the research export with the page's own buildExport(). Every planned click must appear in it
exactly once with the right pid, session_id, q_index, ref and phase, and nothing else may.

    firebase emulators:exec --only auth,firestore --project demo-algoarena "python3 verify/i6/i6_oracle.py"

I6_CONTROL=1 adds one unplanned click (negative control); the run must then fail with exactly one unexpected row.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import collections
import functools
import hashlib
import http.server
import json
import os
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
WWW = HERE / "www"
OUT = REPO / "verify" / "evidence" / "round3" / "i6"
PROJECT = "demo-algoarena"
FS_DOCS = f"http://127.0.0.1:8080/v1/projects/{PROJECT}/databases/(default)/documents"
FS_RESET = f"http://127.0.0.1:8080/emulator/v1/projects/{PROJECT}/databases/(default)/documents"
PORT = 8791
HOST_SALT = "s" * 24
UIDS = ("H", "A", "B")
CONTROL = os.environ.get("I6_CONTROL") == "1"
# Reveal-screen clicks per question. A clicks ref 1 of Q1 twice (two opens, two records); B's three Q2 clicks land
# inside one 1.2 s event-flush window.
LIVE_PLAN = {0: {"A": [0, 2], "B": [1]}, 1: {"A": [1, 1], "B": []}, 2: {"A": [], "B": [0, 1, 2]}}


def build_www():
    shutil.rmtree(WWW, ignore_errors=True)
    WWW.mkdir()
    page = (REPO / "site" / "index.html").read_text(encoding="utf-8")
    inject = """<script>
window.AA_FIREBASE_SDK = "../emu-sdk/"; window.__opened = []; window.__errs = [];
window.open = (u) => { window.__opened.push(String(u)); return null; }; window.confirm = () => true; window.prompt = () => null;
window.addEventListener("error", (e) => window.__errs.push(e.message));
window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection " + ((e.reason && e.reason.message) || e.reason)));
</script>
"""
    assert page.count("<head>") == 1
    (WWW / "app.html").write_text(page.replace("<head>", "<head>\n" + inject, 1), encoding="utf-8")
    shutil.copy(REPO / "site" / "platform-firebase.js", WWW / "platform-firebase.js")
    (WWW / "firebase-config.js").write_text(
        'export default { firebase: { apiKey: "demo-key", authDomain: "demo-algoarena.firebaseapp.com", '
        'projectId: "demo-algoarena", appId: "demo-app" }, functionsRegion: "us-central1", coach: false };\n',
        encoding="utf-8")


def fs_value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [fs_value(x) for x in v]}}
    return {"mapValue": {"fields": {k: fs_value(x) for k, x in v.items()}}}


def fs_admin(method, url, body=None):
    """The emulator treats the bearer token "owner" as an admin, so these calls bypass the rules."""
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer owner", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def room_status():
    try:
        fields = fs_admin("GET", f"{FS_DOCS}/rooms/H").get("fields", {})
    except urllib.error.HTTPError as e:
        if e.code == 404:  # the room does not exist until the host creates it
            return None, None
        raise
    return fields.get("status", {}).get("stringValue"), fields.get("sid", {}).get("stringValue")


def seed():
    fs_admin("DELETE", FS_RESET)
    bank = json.load(open(REPO / "data" / "bank.json", encoding="utf-8"))
    questions = []
    for i in range(3):
        q = {k: v for k, v in bank[i].items() if k != "_id"}
        q["refs"] = [{"kind": kind, "title": f"Q{i} ref {k}", "url": f"https://example.org/q{i}/r{k}", "text": "",
                      "asset": "", "ctype": ""} for k, kind in enumerate(("url", "pdf", "doc"))]
        questions.append(q)
    docs = {"meta/admins": {"uids": ["H"]},
            "data/users/H/profile": {"displayName": "Host", "salt": HOST_SALT, "createdAt": 1},
            "data/users/A/profile": {"displayName": "Alice", "salt": "a" * 24, "createdAt": 1},
            "data/users/B/profile": {"displayName": "Bob", "salt": "b" * 24, "createdAt": 1},
            "data/users/H/profile/sets/set1": {"title": "I6 oracle set", "count": 3, "updatedAt": 2}}
    for k, q in enumerate(questions):
        docs[f"data/users/H/profile/sets/set1/q/q{k + 1}"] = {**q, "order": k}
    for path, doc in docs.items():
        fs_admin("PATCH", f"{FS_DOCS}/{path}", {"fields": {k: fs_value(v) for k, v in doc.items()}})
    return questions


def pid(uid):
    """Export pseudonym computed independently of the page, as the export README defines it."""
    return "P-" + hashlib.sha256((HOST_SALT + ":" + uid).encode()).hexdigest()[:12]


def wait_status(page, status, timeout_s=20):
    end = time.time() + timeout_s
    while time.time() < end:
        got, sid = room_status()
        if got == status:
            return sid
        page.wait_for_timeout(100)
    raise AssertionError(f"room never reached {status}")


def click_ref(page, q, k):
    sel = f'[data-act="openRef"][data-q="{q}"][data-k="{k}"]'
    # Live updates re-render the page and can close the <details> around the link between the open and the click.
    for attempt in range(8):
        page.evaluate("(s) => { const d = document.querySelector(s)?.closest('details'); if (d) d.open = true; }", sel)
        try:
            page.click(sel, timeout=1500)
            return
        except PlaywrightTimeout:
            if attempt == 7:
                raise


def play_question(i, questions, pages, plan):
    H, A, B = (pages[u] for u in UIDS)
    sid = wait_status(H, "question")
    for p in (A, B):
        p.wait_for_selector('[data-act="answer"]', timeout=10000)
        p.click(f'[data-act="answer"][data-i="{questions[i]["correct"]}"]')
    wait_status(H, "closed")
    H.click('[data-act="hReveal"]')
    wait_status(H, "reveal")
    for uid in ("A", "B"):
        for k in LIVE_PLAN[i][uid]:
            click_ref(pages[uid], i, k)
            plan.append((uid, i, k, "live", "in-game buffer"))
            if not (uid == "B" and i == 2):
                pages[uid].wait_for_timeout(300)
    H.wait_for_timeout(1600)
    H.click('[data-act="hNext"]')
    return sid


def run_game(pages, questions):
    H, A, B = (pages[u] for u in UIDS)
    plan = []
    for p in (H, A, B):
        # Google sign-in sits behind "Other sign-in options"; the Northeastern email link is the default.
        p.wait_for_selector('[data-act="gateOthers"]', timeout=20000)
        p.click('[data-act="gateOthers"]')
        p.wait_for_selector('[data-act="signIn"]', timeout=5000)
        p.click('[data-act="signIn"]')
    H.wait_for_selector('[data-act="launch"][data-id="set1"]', timeout=20000)
    H.click('[data-act="launch"][data-id="set1"]')
    H.wait_for_selector("#l_r")
    H.fill("#l_t", "15")
    H.fill("#l_r", "3")
    H.click('[data-act="createRoom"]')
    H.wait_for_selector(".join-line b", timeout=15000)
    code = H.inner_text(".join-line b").strip()
    for p in (A, B):
        p.wait_for_selector("#code", timeout=20000)
        p.fill("#code", code)
        p.check("#consent")
        p.click('[data-act="join"]')
        p.wait_for_selector("text=You're in", timeout=15000)
    H.wait_for_selector("text=2 ready", timeout=15000)
    H.click('[data-act="hStart"]')
    sid = [play_question(i, questions, pages, plan) for i in range(3)][0]
    wait_status(H, "ended")

    A.wait_for_selector(".review details", timeout=15000)
    click_ref(A, 0, 0)
    plan.append(("A", 0, 0, "post", "end screen, in-game buffer"))
    A.wait_for_timeout(2000)

    B.click('[data-act="home"]')
    B.click('[data-act="tab"][data-tab="reports"]', timeout=15000)
    B.click('[data-act="myReview"]', timeout=15000)
    B.wait_for_selector(".review details", timeout=15000)
    for q, k in ((1, 2), (2, 1)):
        click_ref(B, q, k)
        plan.append(("B", q, k, "post", "home review, direct pub append"))
    if CONTROL:
        click_ref(B, 0, 2)  # deliberately left out of the plan
    B.wait_for_timeout(3000)

    H.click('[data-act="openSession"]')
    H.wait_for_selector("text=Research export", timeout=20000)
    H.wait_for_timeout(2000)
    return sid, plan, H.evaluate("(sid) => buildExport([sid], false)", sid)


def compare(sid, plan, export):
    want = collections.Counter((pid(u), sid, q, k, phase) for u, q, k, phase, _ in plan)
    rows = [e for e in export["events"] if e["type"] == "reference_opened"]
    got = collections.Counter()
    for e in rows:
        detail = json.loads(e["detail"] or "{}")
        got[(e["actor"], e["session_id"], e["q_index"], detail.get("ref"), detail.get("phase"))] += 1
    names = {pid(u): u for u in UIDS}
    listed = lambda c: [{"uid": names.get(a, a), "pid": a, "sid": s, "q": q, "ref": k, "phase": ph, "count": n}
                        for (a, s, q, k, ph), n in sorted(c.items(), key=str)]
    per_exposure = collections.Counter((pid(u), q) for u, q, *_ in plan)
    exposures = {(x["pid"], x["q_index"]): x.get("reference_interactions") for x in export["exposures"]}
    return {
        "export_reference_rows": len(rows),
        "recorded_exactly_once": sum((want & got).values()),
        "missing": listed(want - got),
        "unexpected_or_duplicate": listed(got - want),
        "exposure_reference_interactions_mismatch": [
            {"pid": p, "q": q, "want": n, "got": exposures.get((p, q))}
            for (p, q), n in per_exposure.items() if exposures.get((p, q)) != n],
    }


def main():
    build_www()
    questions = seed()
    handler = type("Quiet", (http.server.SimpleHTTPRequestHandler,), {"log_message": lambda *a: None})
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(handler, directory=str(HERE)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    console_errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        pages = {}
        for u in UIDS:
            page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
            page.on("console", lambda m, u=u: m.type in ("error", "warning") and console_errors.append(f"{u}: {m.text}"))
            page.goto(f"http://127.0.0.1:{PORT}/www/app.html?u={u}")
            pages[u] = page
        sid, plan, export = run_game(pages, questions)
        page_errors = {u: p.evaluate("() => window.__errs") for u, p in pages.items()}
        links_opened = {u: len(pages[u].evaluate("() => window.__opened")) for u in ("A", "B")}
        browser.close()
    srv.shutdown()

    result = {
        "where": "emulator (Auth + Firestore, demo-algoarena); real page, real Firebase JS SDK 10.12.2, real rules",
        "negative_control": CONTROL,
        "session_id": sid,
        "planned_clicks": len(plan),
        "plan": [{"uid": u, "q": q, "ref": k, "phase": ph, "path": path} for u, q, k, ph, path in plan],
        **compare(sid, plan, export),
        "links_opened_in_browser": links_opened,
        "page_errors": page_errors,
        "console_errors": console_errors[:20],
        # Scoring does not use it, but players unlock by it: a failed estimate lets a fast clock unlock too early.
        "server_clock_estimate_failures": [c for c in console_errors if "Server clock estimate failed" in c],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / ("result-control.json" if CONTROL else "result.json")).write_text(json.dumps(result, indent=2), encoding="utf-8")
    ok = not result["missing"] and not result["unexpected_or_duplicate"] and not result["server_clock_estimate_failures"]
    print(json.dumps({k: v for k, v in result.items() if k != "plan"}, indent=2))
    print("I6", "PASS" if ok else "FAIL", f'{result["recorded_exactly_once"]}/{len(plan)} planned clicks recorded exactly once')
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
