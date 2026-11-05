"""Route B (Firebase) end-to-end test with Playwright.

Host H and players A (clock +3 s) and B (clock -5 s) run in three iframes, on the mock Firebase SDK whose server
clock is the harness page's clock. The script serves test/e2e over HTTP, then drives sign-in, a three-question
room, the AI learning reports through coach-core.js, the research export and sign-out. It prints PASS or FAIL per
check and exits with status 1 if any check fails.

Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
    Northeastern University
Version: 1.0
Created: October 29, 2026 · San Francisco, California, USA

License: This project is licensed under the MIT License — see LICENSE.md for details.
Copyright © 2026 Yikang (Richard) Liu.
"""
import json, math, os, re, sys, http.server, threading, functools, zipfile
from playwright.sync_api import sync_playwright

from pathlib import Path
ROOT = str(Path(__file__).resolve().parent); PORT = 8781
BANK = json.load(open(Path(ROOT).parent.parent / "data" / "bank.json"))
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
bank = lambda i: {k: v for k, v in BANK[i - 1].items() if k != "_id"}
Q = [bank(1), bank(2), bank(3)]
Q[2]["refs"] = [{"kind": "url", "title": "CLRS 4e, Section 2.1", "url": "https://example.org/clrs-2-1", "text": "", "asset": "", "ctype": ""}]
C = [q["correct"] for q in Q]
SEED = {"meta/admins": {"uids": ["H"]},
        "data/users/H/profile": {"displayName": "Host", "salt": "s" * 24, "createdAt": 1},
        "data/users/A/profile": {"displayName": "Alice", "salt": "a", "createdAt": 1},
        "data/users/B/profile": {"displayName": "Bob", "salt": "b", "createdAt": 1},
        "data/users/H/profile/sets/set1": {"title": "Pilot set", "count": 3, "updatedAt": 2},
        "data/users/H/profile/sets/set2": {"title": "AI drafts", "count": 0, "updatedAt": 1}}
for k, q in enumerate(Q):
    SEED[f"data/users/H/profile/sets/set1/q/q{k + 1}"] = {**q, "order": k}
SEED["bank/bk1"] = {**bank(4), "order": 0}
SEED["bank/bk2"] = {**bank(5), "order": 1}
SEED["meta/bank"] = {"count": 2, "source": "seed"}

with sync_playwright() as pw:
    browser = pw.chromium.launch(); page = browser.new_page(viewport={"width": 1800, "height": 950})
    cons = []; page.on("console", lambda m: m.type in ("error", "warning") and cons.append(m.text))
    page.goto(f"http://127.0.0.1:{PORT}/harness-b.html")
    page.evaluate("(seed) => { for (const [k, v] of Object.entries(seed)) __FB.docs.set(k, v); __FB.names = {H: 'Host User', A: 'Alice A', B: 'Bob B'}; }", SEED)
    page.evaluate("() => { __FB.addFrame('host', 'H', 0); __FB.addFrame('pA', 'A', 3000); __FB.addFrame('pB', 'B', -5000); }")
    sleep = lambda s: page.wait_for_timeout(int(s * 1000))

    def frame_for(uid):
        for _ in range(100):
            for f in page.frames:
                if f"u={uid}&" in f.url:
                    return f
            sleep(0.05)
        raise AssertionError(uid)
    H, A, B = frame_for("H"), frame_for("A"), frame_for("B")
    get = lambda p: page.evaluate("(p) => __FB.get(p)", p)
    ms = lambda v: v["__ts"] if isinstance(v, dict) and "__ts" in v else v

    def wait_status(st, timeout=12):
        for _ in range(int(timeout * 20)):
            r = get("rooms/H")
            if r and r.get("status") == st:
                return r
            sleep(0.05)
        raise AssertionError(f"room never reached {st}")

    def wait_answers(sid, n, q, timeout=8):
        for _ in range(int(timeout * 20)):
            got = page.evaluate("([sid, q]) => [...__FB.docs.keys()].filter((k) => k.startsWith('rooms/H/answers/') && k.endsWith('_' + sid + '_' + q)).length", [sid, q])
            if got >= n:
                return
            sleep(0.05)
        raise AssertionError("answers not stored")

    def direct_answer(F, q, srv_server=True):
        return F.evaluate("""async ([q, srvServer]) => { const p = S.play; try {
            await DB.doc(`rooms/${p.hostId}/answers/${S.uid}_${p.sid}_${q}`).set({ uid: S.uid, sid: p.sid, q, ct: "forged", srv: srvServer ? DB.serverTime() : Date.now() });
            return "accepted"; } catch (e) { return e.code; } }""", [q, srv_server])

    def page_width_at(name, width):
        """Narrows iframe `name` to `width` px for one measurement; returns its page's [scrollWidth, clientWidth]."""
        return page.evaluate("""async ([n, w]) => { const f = document.querySelector(`iframe[name="${n}"]`); f.style.width = w + "px";
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const de = f.contentDocument.documentElement; const dims = [de.scrollWidth, de.clientWidth]; f.style.width = ""; return dims; }""", [name, width])

    # Google sign-in
    for F in (H, A, B):
        F.wait_for_selector('[data-act="signIn"]', timeout=8000)
    check("signed-out users see 'Sign in with Google'", "Google" in H.inner_text('[data-act="signIn"]'))
    page.evaluate("() => { __FB.popupBlocked = true; }")
    H.click('[data-act="signIn"]')
    H.wait_for_selector(".toast", timeout=4000)
    check("a blocked popup explains how to sign in instead of redirecting", "Pop-ups are blocked" in H.inner_text(".toast") and "signIn" in H.inner_html("body"), H.inner_text(".toast"))
    page.evaluate("() => { __FB.popupBlocked = false; }")
    H.wait_for_selector('[data-act="signIn"]:not([disabled])', timeout=4000)
    for F in (H, A, B):
        F.click('[data-act="signIn"]')
    H.wait_for_selector('[data-act="launch"][data-id="set1"]', timeout=10000)
    A.wait_for_selector("#code", timeout=10000); B.wait_for_selector("#code", timeout=10000)
    check("after sign-in the host reaches Home", True)
    sleep(1.0)
    offB = B.evaluate("() => DB.serverOffset()")
    check("B's server-clock offset estimate corrects its -5 s skew", 4500 <= offB <= 5500, str(offB))

    # Phone width (375 px, iPhone SE): scrollWidth above clientWidth means the page scrolls sideways. The seeded
    # name "Host" is short enough to hide a header overflow, so the header checks also use a long name.
    def host_width_with_name(display_name):
        name0 = H.evaluate("() => S.profile.displayName")
        H.evaluate("(n) => { S.profile.displayName = n; rerender(); }", display_name)
        dims = page_width_at("host", 375)
        H.evaluate("(n) => { S.profile.displayName = n; rerender(); }", name0)
        return dims
    LONG_NAME = "Maria Fernanda Gonzalez-Rodriguez"
    dims = page_width_at("host", 375)
    check("at 375 px the signed-in home screen does not scroll sideways", dims[0] <= dims[1], str(dims))
    dims = host_width_with_name(LONG_NAME)
    check("at 375 px a long display name is cut short in the header instead of widening the page", dims[0] <= dims[1], str(dims))

    # Question image upload: the assets capability against the mock's mirror of storage.rules. Download links are
    # served locally so the image really loads without the network.
    PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                        "1f15c4890000000d49444154789c6360f8cf000002020101a2f4a0a70000000049454e44ae426082")
    page.route("https://firebasestorage.googleapis.com/**", lambda route: route.fulfill(status=200, content_type="image/png", body=PNG))
    H.click('[data-act="editSet"][data-id="set1"]'); H.wait_for_selector('[data-act="editQ"][data-i="0"]', timeout=6000)
    dims = host_width_with_name(LONG_NAME)
    check("at 375 px the set editor does not scroll sideways, even with a long display name", dims[0] <= dims[1], str(dims))
    H.click('[data-act="editQ"][data-i="0"]'); H.wait_for_selector("#q_img", state="attached", timeout=4000)
    H.set_input_files("#q_img", files=[{"name": "q1.png", "mimeType": "image/png", "buffer": PNG}])
    H.wait_for_selector('img[alt="Prompt image"]', timeout=6000)
    src = H.get_attribute('img[alt="Prompt image"]', "src")
    check("an approved host uploads a prompt image to Cloud Storage and sees it in the editor",
          src.startswith("https://firebasestorage.googleapis.com/v0/b/") and "assets%2FH%2F" in src, src)
    H.click('[data-act="saveQ"]'); sleep(0.6)
    img = (get("data/users/H/profile/sets/set1/q/q1") or {}).get("img", "")
    check("the saved question names the file as <uid>/<random id>, and the file exists",
          bool(re.match(r"^H/[0-9a-f-]{36}$", img)) and page.evaluate("(p) => __FB.blobs.has(p)", "assets/" + img), img)
    up = """async ([name, type, size]) => { const a = await claude.use("assets");
        return a.upload(new File([new Uint8Array(size)], name, { type })).then(() => "accepted", (e) => e.code); }"""
    check("a player who is not an approved host cannot upload", A.evaluate(up, ["x.png", "image/png", 10]) == "not_uploader")
    check("an SVG is refused as an unsupported type", H.evaluate(up, ["x.svg", "image/svg+xml", 10]) == "unsupported_type")
    check("a file over 20 MB is refused before upload", H.evaluate(up, ["big.mp4", "video/mp4", 20 * 1024 * 1024 + 1]) == "too_large")
    H.click('[data-act="home"]'); H.wait_for_selector('[data-act="launch"][data-id="set1"]', timeout=6000)

    # AI question drafts (v1.1): the form, the review list from a real runDraft result (qgen-fixture.json), accept,
    # edit and discard, the hosting block while drafts are pending, and the provenance an accepted draft carries.
    H.wait_for_function("() => S.canDraft === true", timeout=6000)
    check("an approved host may draft with AI and a player may not", A.evaluate("() => S.canDraft") is False)
    set2_docs = lambda sub: sorted((k, v) for k, v in page.evaluate("() => [...__FB.docs.entries()]") if k.startswith(f"data/users/H/profile/sets/set2/{sub}/"))
    H.click('[data-act="editSet"][data-id="set2"]'); H.wait_for_selector('[data-act="draftOpen"]', timeout=6000)
    H.click('[data-act="draftOpen"]'); H.wait_for_selector("#d_module", timeout=4000)
    check("the draft form names the drafting and checking models and the daily limit",
          "written by Claude Sonnet 5.5 and checked by GPT-6.1 Terra." in H.inner_text(".dialog") and "up to 50 questions a day" in H.inner_text(".dialog"))
    check("before any draft, the daily limit number is bold", H.eval_on_selector_all(".dialog p.muted b", "els => els.map((e) => e.innerText)") == ["50"])
    H.select_option("#d_module", "Module 2 (Sorting and Order Statistics)"); H.select_option("#d_count", "2")
    check("the draft button follows the count", H.inner_text("#d_go") == "Draft 2 questions", H.inner_text("#d_go"))
    H.fill("#d_focus", "heaps"); H.fill("#d_ch", "6")
    page.evaluate("() => { __FB.draftFailNext = { code: 'quota_exceeded', message: 'The daily AI drafting limit (50 questions) leaves 0 for today.' }; }")
    H.click("#d_go"); H.wait_for_selector(".toast", timeout=6000)
    check("a quota refusal shows the function's message, not the storage-full one", "leaves 0 for today" in H.inner_text(".toast"), H.inner_text(".toast"))
    H.wait_for_selector("#d_go:not([disabled])", timeout=4000)
    H.click("#d_go"); H.wait_for_selector('[data-act="draftAccept"]', timeout=8000)
    sent = page.evaluate("() => __FB.draftCalls[__FB.draftCalls.length - 1].data")
    check("the page sends only the form's fields, never prompt text",
          sent == {"module": "Module 2 (Sorting and Order Statistics)", "count": 2, "setId": "set2", "focus": "heaps", "chapter": 6, "difficulty": "mixed", "subtype": None, "sourceText": ""}, json.dumps(sent))
    cards = H.eval_on_selector_all("[data-draft]", "els => els.map((e) => e.innerText)")
    check("drafts are listed with the checker's disagreement first, with its reasoning",
          len(cards) == 2 and "The checker chose B, not the marked A." in cards[0] and "Its reasoning" in cards[0], (cards or [""])[0][:160])
    check("the agreed draft carries its near-duplicate note", "The checker agrees." in cards[1] and "check it is not a repeat" in cards[1])
    audit = H.evaluate("""() => { const box = document.createElement("div"); box.className = "small";
        box.innerHTML = draftStatus({ verify: { status: "issues" }, question: { correct: 0 },
          auditIssues: [{ check: "explanation", note: "The lower bound is not argued." }, { check: "feedback_wrong", note: "Feedback A is wrong; it says n." }] });
        document.querySelector("[data-draft]").appendChild(box);
        const head = box.querySelector(".vstat"), ps = [...box.querySelectorAll(".audit > p")];
        const tops = [head, ...ps].map((e) => e.getBoundingClientRect());
        const r = { head: head.innerText, items: ps.map((p) => p.innerText),
          bold: ps.map((p) => p.firstElementChild.tagName === "B" && Number(getComputedStyle(p.firstElementChild).fontWeight) >= 700),
          ownLines: tops.slice(1).every((t, k) => t.top >= tops[k].bottom - 1) };
        box.remove(); return r; }""")
    check("the checker's issues show one paragraph each under the summary, each starting with its bold check name",
          audit["head"] == "The checker agrees with the answer but noted 2 issues." and audit["ownLines"] and all(audit["bold"])
          and audit["items"] == ["Explanation: The lower bound is not argued.", "Feedback error: Feedback A is wrong; it says n."], json.dumps(audit))
    why = H.evaluate("() => [...document.querySelectorAll('[data-draft]')[0].querySelectorAll('.why li')].map((li) => li.innerText)")
    check("the host sees the misconception behind each wrong option, and none for the right one",
          [w[:2] for w in why] == ["B:", "C:", "D:"] and why[0] == "B: Assumes the root never moves.", str(why))
    check("hosting is off while drafts are pending", H.is_disabled('[data-act="launch"][data-id="set2"]'))
    meta = get("data/users/H/profile/sets/set2")
    check("drafts are stored under the set and counted in its metadata; the dialog closed",
          len(set2_docs("drafts")) == 2 and meta.get("drafts") == 2 and H.query_selector("#d_module") is None and H.evaluate("() => S.draftQuotaLeft") == 48, str(meta))
    ids = H.eval_on_selector_all("[data-draft]", "els => els.map((e) => e.dataset.draft)")
    H.click(f'[data-act="draftAccept"][data-id="{ids[1]}"]'); H.wait_for_function("() => S.edit && S.edit.qs.length === 1", timeout=6000); sleep(0.4)
    q = set2_docs("q")[0][1]
    check("an accepted draft is stored with origin ai_draft and its drafting record",
          q.get("origin") == "ai_draft" and q["ai"]["model"] == "claude-sonnet-5-5" and q["ai"]["verifierModel"] == "gpt-6.1-terra"
          and q["ai"]["promptVersions"]["draft"] == "qgen-draft-v1" and q["ai"]["verify"]["status"] == "agree" and q["ai"]["editedBeforeAccept"] is False
          and q["ai"]["distractorRationales"]["B"].startswith("Multiplies") and q["ai"]["acceptedBy"] == "H" and "distractor_rationales" not in q, json.dumps(q)[:300])
    check("its provenance says who drafted, checked and accepted it",
          "Drafted by claude-sonnet-5-5 on" in q.get("provenance", "") and "verified by gpt-6.1-terra: agree; reviewed and accepted by the host on" in q.get("provenance", ""), q.get("provenance", ""))
    H.click(f'[data-act="draftEdit"][data-id="{ids[0]}"]'); H.wait_for_selector("#q_expl", timeout=4000)
    check("editing a draft opens the question editor as 'Edit AI draft'", "Edit AI draft" in H.inner_text(".dialog h2") and H.inner_text('[data-act="saveQ"]') == "Save and accept")
    H.fill("#q_expl", H.input_value("#q_expl") + " Checked by the host.")
    H.click('[data-act="saveQ"]'); H.wait_for_function("() => S.edit && S.edit.qs.length === 2 && !S.edit.drafts.length", timeout=6000); sleep(0.4)
    q2 = [v for k, v in set2_docs("q") if v["ai"]["verify"]["status"] == "disagree"][0]
    check("an edited draft is marked editedBeforeAccept and says so in provenance",
          q2["ai"]["editedBeforeAccept"] is True and "reviewed, edited and accepted" in q2["provenance"] and q2["explanation"].endswith("Checked by the host."))
    meta = get("data/users/H/profile/sets/set2")
    check("with no drafts left, the set can be hosted again", not H.is_disabled('[data-act="launch"][data-id="set2"]') and meta.get("drafts") == 0 and meta.get("count") == 2 and not set2_docs("drafts"), str(meta))
    H.click('[data-act="draftOpen"]'); H.wait_for_selector("#d_go", timeout=4000)
    check("the form shows the quota left after a draft", "48 of 50 questions left today" in H.inner_text(".dialog"))
    check("both quota numbers are bold", H.eval_on_selector_all(".dialog p.muted b", "els => els.map((e) => e.innerText)") == ["48", "50"])
    H.click("#d_go"); H.wait_for_selector('[data-act="draftDiscard"]', timeout=8000)
    for _ in range(2):
        H.click('[data-act="draftDiscard"]'); H.wait_for_selector('[data-act="mOk"]', timeout=4000); H.click('[data-act="mOk"]'); sleep(0.5)
    check("discarded drafts are deleted and never reach the set", not set2_docs("drafts") and len(set2_docs("q")) == 2 and get("data/users/H/profile/sets/set2").get("drafts") == 0)
    H.click('[data-act="home"]'); H.wait_for_selector('[data-act="launch"][data-id="set1"]', timeout=6000)

    # Built-in bank editing: admins add, edit and delete one question at a time; players see no controls.
    bank_ids = lambda: sorted(k for k in page.evaluate("() => [...__FB.docs.keys()]") if k.startswith("bank/"))
    H.click('[data-act="tab"][data-tab="bank"]'); H.wait_for_selector('[data-act="bankEditQ"][data-id="bk1"]', timeout=6000)
    H.click('[data-act="bankNewQ"]'); H.wait_for_selector("#q_prompt", timeout=4000)
    check("New question in the bank opens the editor in bank mode", "New bank question" in H.inner_text(".dialog h2"))
    H.fill("#q_prompt", "Which structure gives O(1) find-min?")
    for k, o in enumerate(["Unsorted array", "Binary min-heap", "Stack", "Queue"]):
        H.fill(f"#q_o{k}", o)
    H.check('input[name="q_c"][value="1"]'); H.click('[data-act="saveQ"]'); sleep(0.6)
    added = [k for k in bank_ids() if k not in ("bank/bk1", "bank/bk2")]
    nq = get(added[0]) if len(added) == 1 else {}
    check("a new bank question is saved to bank/{id} with its provenance, and the count updates",
          nq.get("prompt", "").startswith("Which structure") and nq.get("correct") == 1 and "Written in AlgoArena on" in nq.get("provenance", "")
          and get("meta/bank")["count"] == 3, str(added))
    before = get("bank/bk1")
    H.click('[data-act="bankEditQ"][data-id="bk1"]'); H.wait_for_selector("#q_o1", timeout=4000)
    check("Edit opens the bank question in the editor", "Edit bank question" in H.inner_text(".dialog h2") and H.input_value("#q_prompt") == before["prompt"])
    H.fill("#q_o1", "Edited option B"); H.click('[data-act="saveQ"]'); sleep(0.6)
    after = get("bank/bk1")
    check("an edited option is saved in place; fields the form does not show are kept",
          after["options"][1] == "Edited option B" and after.get("chapter") == before.get("chapter") and "Edited in AlgoArena on" in after.get("provenance", ""))
    H.click('[data-act="bankDelQ"][data-id="bk2"]'); H.wait_for_selector('[data-act="mOk"]', timeout=4000); H.click('[data-act="mOk"]'); sleep(0.6)
    check("Delete asks first, then removes the question and updates the count",
          get("bank/bk2") is None and get("meta/bank")["count"] == 2 and H.locator('[data-act="bankDelQ"][data-id="bk2"]').count() == 0)
    with page.expect_download() as dl:
        H.click('[data-act="bankDl"]')
    dumped = json.loads(Path(dl.value.path()).read_text(encoding="utf-8"))
    check("Download bank as JSON holds the current bank", len(dumped) == 2 and any(q["options"][1] == "Edited option B" for q in dumped), str(len(dumped)))
    A.click('[data-act="tab"][data-tab="bank"]'); A.wait_for_selector(".qcard", timeout=6000)
    check("players see the bank without edit, delete or new-question controls",
          A.locator('[data-act="bankEditQ"], [data-act="bankDelQ"], [data-act="bankNewQ"]').count() == 0)
    H.click('[data-act="tab"][data-tab="sets"]'); H.click('[data-act="editSet"][data-id="set1"]'); H.wait_for_selector('[data-act="editQ"][data-i="1"]', timeout=6000)
    H.click('[data-act="editQ"][data-i="1"]'); H.wait_for_selector("#q_prompt", timeout=4000); H.click('[data-act="saveQ"]'); sleep(0.6)
    check("after bank editing, the set editor still saves into the set", bank_ids() == sorted(["bank/bk1"] + added) and get("data/users/H/profile/sets/set1/q/q2") is not None)
    H.click('[data-act="home"]'); H.wait_for_selector('[data-act="launch"][data-id="set1"]', timeout=6000)

    # room
    H.click('[data-act="launch"][data-id="set1"]'); H.wait_for_selector("#l_r")
    check("the reading time defaults to 5 s", H.input_value("#l_r") == "5", H.input_value("#l_r"))
    check("the answer time defaults to 10 s", H.input_value("#l_t") == "10", H.input_value("#l_t"))
    launch = H.inner_text("main")
    check("the launch screen shows the scoring formula, one case per line, and no consent notice",
          "score =" in launch and "if wrong or no answer" in launch and "Players are told before joining" not in launch and "Streaks" not in launch
          and H.evaluate("() => [...document.querySelectorAll('.notice span')].filter((s) => /^(500 \\+|0$)/.test(s.textContent)).every((s) => s.getClientRects().length === 1)"))
    sym = H.evaluate("""() => { const b = document.querySelector('.score-brace').getBoundingClientRect();
        const rows = [...document.querySelectorAll('.score-cases > span:nth-child(odd)')].map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
        const tip = b.top + b.height / 2; return { tipToMid: Math.abs(tip - (rows[0] + rows[1]) / 2), topGap: rows[0] - b.top, bottomGap: b.bottom - rows[1] }; }""")
    check("the brace tip sits midway between the two cases, with equal space above and below",
          sym["tipToMid"] <= 1 and abs(sym["topGap"] - sym["bottomGap"]) <= 1, str(sym))
    gap = H.evaluate("""() => { const p = document.querySelector('.score-params'); const f = document.querySelector('.score-cases').getBoundingClientRect();
        return { gap: p.getBoundingClientRect().top - f.bottom, line: parseFloat(getComputedStyle(p).lineHeight) }; }""")
    check("two blank lines of the explanation's own line height separate it from the formula",
          abs(gap["gap"] - 2 * gap["line"]) <= 2, str(gap))
    if os.environ.get("E2E_SHOTS"):
        H.locator(".notice").first.screenshot(path=os.path.join(os.environ["E2E_SHOTS"], "launch-scoring.png"))
    H.fill("#l_t", "15"); H.fill("#l_r", "3")
    H.click('[data-act="createRoom"]'); H.wait_for_selector(".join-line b", timeout=8000)
    code = H.inner_text(".join-line b").strip()
    lob = H.evaluate("""() => { const q = document.querySelector('#qr').getBoundingClientRect(); const box = document.querySelector('.stage-inner');
        const c = box.getBoundingClientRect(); const cs = getComputedStyle(box); const mid = c.left + parseFloat(cs.paddingLeft) + (c.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / 2;
        const note = document.querySelector('.join-line');
        return { off: Math.abs(q.left + q.width / 2 - mid), below: !!note && note.getBoundingClientRect().top >= q.bottom, text: document.querySelector('.joinboard').innerText }; }""")
    check("the host lobby centres the QR code with one line below it: scan, sign in and enter the room code",
          lob["off"] <= 2 and lob["below"] and lob["text"].strip().startswith(f"Scan the code, sign in and enter {code}") and "Join at" not in lob["text"]
          and "Players see that" not in lob["text"], str({k: lob[k] for k in ("off", "below")}))
    if os.environ.get("E2E_SHOTS"):
        H.locator(".stage-inner").screenshot(path=os.path.join(os.environ["E2E_SHOTS"], "host-lobby.png"))
    for F in (A, B):
        F.fill("#code", code); F.check("#consent"); F.click('[data-act="join"]'); F.wait_for_selector("text=You're in", timeout=8000)
    H.wait_for_selector("text=2 ready", timeout=8000)
    check("host sees both players (pub query filtered by host)", True)
    H.click('[data-act="hStart"]')

    # Q1
    r = wait_status("question"); sid = r["sid"]
    check("room has a server timestamp for the question", isinstance(r.get("shownSrv"), dict) and "__ts" in r["shownSrv"] and r["readS"] == 3)
    A.wait_for_selector(".answers.locked", timeout=3000); B.wait_for_selector(".answers.locked", timeout=3000)
    check("both players locked during reading", A.locator('[data-act="answer"]').count() == 0 and B.locator('[data-act="answer"]').count() == 0)
    A.wait_for_function("() => { const i = document.querySelector('.qprompt img'); return i && i.complete && i.naturalWidth > 0; }", timeout=4000)
    check("a player sees the uploaded prompt image, loaded from its Storage link",
          A.get_attribute(".qprompt img", "src") == src, A.get_attribute(".qprompt img", "src"))
    check("database refuses an answer written during reading", direct_answer(A, 0) == "permission_denied")
    A.wait_for_selector('[data-act="answer"]', timeout=4500); B.wait_for_selector('[data-act="answer"]', timeout=4500)
    opened = page.evaluate("() => Date.now()")
    check("players unlock at the server's open time (within 0.6 s)", abs(opened - (ms(r["shownSrv"]) + 3000)) < 600, str(opened - ms(r["shownSrv"]) - 3000))
    check("database refuses a client-chosen timestamp", direct_answer(A, 0, srv_server=False) == "permission_denied")
    sleep(1.0); A.click(f'[data-act="answer"][data-i="{(C[0] + 1) % 4}"]')
    A.wait_for_selector("text=Tap another option to change it", timeout=3000)
    check("after answering, a player can still tap the other options", A.locator('[data-act="answer"]').count() == 4 and A.locator(".ans.mine").count() == 1)
    sleep(0.6); A.click(f'[data-act="answer"][data-i="{C[0]}"]')
    sleep(0.4); B.click(f'[data-act="answer"][data-i="{(C[0] + 1) % 4}"]')
    wait_answers(sid, 2, 0)
    for _ in range(80):
        if get(f"rooms/H/answers/A_{sid}_0_c1"):
            break
        sleep(0.05)
    check("a change is stored as a new document, the first one kept", get(f"rooms/H/answers/A_{sid}_0") is not None and (get(f"rooms/H/answers/A_{sid}_0_c1") or {}).get("n") == 1)
    t1 = int(A.inner_text("#ringnum")); sleep(1.6); t2 = int(A.inner_text("#ringnum"))
    check("after answering, the player's countdown keeps running", t2 < t1 < 15, f"{t1} -> {t2}")
    check("everyone has answered, yet the round stays open until time runs out", get("rooms/H")["status"] == "question")
    rc = wait_status("closed", 20)
    check("the round closes when time is up", rc["closed"]["reason"] == "time_up", str(rc["closed"]))
    A.wait_for_selector("text=Your answer is in", timeout=4000)
    check("once time is up the player's answer is final", A.locator('[data-act="answer"]').count() == 0)
    H.click('[data-act="hReveal"]'); wait_status("reveal")
    log = get(f"data/users/H/profile/sessions/{sid}/log/q0000")
    rowsA = [x for x in log["submissions"] if x["uid"] == "A"]
    s = {x["uid"]: x for x in log["submissions"] if x["is_final_answer"]}
    check("each selection is a submission row; only the final one counts",
          [x["selection_index"] for x in rowsA] == [1, 2] and [x["is_final_answer"] for x in rowsA] == [False, True]
          and not rowsA[0]["correct"] and rowsA[0]["score"] == 0 and rowsA[1]["correct"], str([(x["selected_option"], x["correct"], x["score"]) for x in rowsA]))
    eA = next(x for x in log["exposures"] if x["uid"] == "A")
    check("the exposure records the first attempt, the number of selections and the final result",
          eA["first_attempt_correct"] is False and eA["n_submissions"] == 2 and eA["final_correct"] is True and eA["time_to_correct_ms"] == s["A"]["elapsed_ms"], str(eA))
    check("timing source is the server for both players", s["A"]["timing_source"] == "server" and s["B"]["timing_source"] == "server")
    check("A's final answer elapsed ~1.6 s from open on the server clock", 1200 <= s["A"]["elapsed_ms"] <= 2600, str(s["A"]["elapsed_ms"]))
    check("B elapsed ~2 s despite a -5 s device clock", 1500 <= s["B"]["elapsed_ms"] <= 3000, str(s["B"]["elapsed_ms"]))
    check("client-measured elapsed recorded alongside", all(isinstance(x["client_elapsed_ms"], int) and abs(x["client_elapsed_ms"] - x["elapsed_ms"]) < 700 for x in log["submissions"]), str([(x["client_elapsed_ms"], x["elapsed_ms"]) for x in log["submissions"]]))
    # The app uses JS Math.round (half up); Python's round() is half-to-even and disagreed whenever elapsed % 30 == 15.
    check("A's score follows the final answer's server elapsed time", s["A"]["correct"] and s["A"]["score"] == math.floor(500 + 500 * (1 - s["A"]["elapsed_ms"] / 15000) + 0.5), f'{s["A"]["score"]} at {s["A"]["elapsed_ms"]} ms')
    check("log uses the server open time", log["answers_open_at_ms"] - log["shown_at_ms"] == 3000 and log["shown_at_ms"] == ms(r["shownSrv"]))
    A.wait_for_selector(".feedback-big", timeout=4000)
    check("A sees Correct", "Correct" in A.inner_text(".feedback-big"))

    # Q2: open early; the host stops answers by hand
    H.click('[data-act="hNext"]'); r2 = wait_status("question")
    B.wait_for_selector(".answers.locked", timeout=3000); sleep(0.8)
    H.click('[data-act="hOpenNow"]'); B.wait_for_selector('[data-act="answer"]', timeout=3000)
    r2 = get("rooms/H")
    check("open-now stores a server timestamp earlier than shown + 3 s", r2.get("openNowSrv") and ms(r2["openNowSrv"]) - ms(r2["shownSrv"]) < 2500)
    sleep(1.0); B.click(f'[data-act="answer"][data-i="{C[1]}"]'); wait_answers(sid, 1, 1)
    check("database refuses rewriting a selection", direct_answer(B, 1) == "permission_denied")
    A.wait_for_selector('[data-act="answer"]', timeout=3000); A.click(f'[data-act="answer"][data-i="{(C[1] + 1) % 4}"]')
    wait_answers(sid, 2, 1); H.click('[data-act="hClose"]'); wait_status("closed"); H.click('[data-act="hReveal"]'); wait_status("reveal")
    log2 = get(f"data/users/H/profile/sessions/{sid}/log/q0001"); s2 = {x["uid"]: x for x in log2["submissions"]}
    check("B scored from the early open (~1 s)", s2["B"]["correct"] and 600 <= s2["B"]["elapsed_ms"] <= 2200, str(s2["B"]["elapsed_ms"]))
    check("database refuses answers while the room is not taking them", direct_answer(A, 1) == "permission_denied")

    # Q3 and end
    H.click('[data-act="hNext"]'); wait_status("question")
    A.wait_for_selector('[data-act="answer"]', timeout=6000); B.wait_for_selector('[data-act="answer"]', timeout=6000)
    A.click(f'[data-act="answer"][data-i="{C[2]}"]'); B.click(f'[data-act="answer"][data-i="{C[2]}"]')
    wait_answers(sid, 2, 2); H.click('[data-act="hClose"]'); wait_status("closed"); H.click('[data-act="hReveal"]'); wait_status("reveal")
    A.wait_for_selector('.refs [data-act="openRef"]', timeout=4000); A.click('.refs [data-act="openRef"]')
    page.evaluate("() => { __FB.aiFailNext = 1; }")  # the first AI call gets HTTP 529
    sleep(1.5); H.click('[data-act="hNext"]'); wait_status("ended", 15)
    A.wait_for_selector(".review details", timeout=6000)
    check("A's review lists 3 questions", A.locator(".review details").count() == 3)
    check("other players' answers are unreadable to A", A.evaluate("(sid) => DB.doc(`rooms/H/answers/B_${sid}_0`).get().then(() => 'read', (e) => e.code)", sid) == "permission_denied")

    # AI learning reports through the coach function
    aidoc = lambda u: get(f"data/users/H/profile/sessions/{sid}/ai/{u}") or {}
    for _ in range(600):
        if all(aidoc(u).get("status") == "ready" for u in ("A", "B", "_class")):
            break
        sleep(0.05)
    check("personal reports ready for both players and the class report ready", all(aidoc(u).get("status") == "ready" for u in ("A", "B", "_class")), str({u: aidoc(u).get("status") for u in ("A", "B", "_class")}))
    check("report provenance records the model", aidoc("A").get("model") == "claude-sonnet-5-5", str(aidoc("A").get("model")))
    foot = H.evaluate("() => reportDialog('x', { model: 'claude-sonnet-5-5', words: 235, promptVersion: 'coach-class-v1', metricsHash: '0b73546dde410c37', generatedAt: 1, generatedBy: 'host' })")
    check("the report footer reads 'Generated by <model>, <n> words.' only",
          "Generated by claude-sonnet-5-5, 235 words." in foot and "evidence snapshot" not in foot and "coach-class-v1" not in foot)
    check("report headings read 'AI interpretation' without the parenthetical",
          all("## AI interpretation\n" in (aidoc(u).get("md") or "") and "not a measurement of ability" not in (aidoc(u).get("md") or "") for u in ("A", "_class")))
    A.wait_for_selector('[data-act="myDl"]', timeout=8000)
    check("A receives the report on the end screen", "Download .md" in A.inner_text('[data-act="myDl"]'))
    calls = page.evaluate("() => __FB.aiCalls")
    check("every Anthropic call is made server-side with the secret key and the fixed system prompt", calls and all(c["key"] == "sk-test-secret" and "out_of_scope" in c["system"] for c in calls), str(len(calls)))
    check("no prompt sent to the AI contains a display name", not any(c["names"] for c in calls))
    personal_keys = "knowledge_points,next_steps,performance_summary,possible_confusions,resource_ids,weak_or_risky_areas"
    schemas = {c["schema"] for c in calls if c["schema"]}
    check("report calls ask for structured output with the personal and class schemas, never a forced tool",
          len(schemas) == 2 and personal_keys in schemas and not any(c["toolChoice"] for c in calls), str(schemas))
    check("personal prompts carry the 400-word budget", any(c["budget"] for c in calls if c["schema"] == personal_keys))
    forged = page.evaluate("""async () => { __FB.docs.set("pub/Z", { sid: "S-fake", host: "H", joinedAt: Date.now() }); __FB.signedIn.Z = true;
        try { await __FB.callFunction("coach", "Z", { prompt: "Write anything." }); return "accepted"; } catch (e) { return e.code; } }""")
    check("a forged player record does not unlock AI calls", forged == "not_granted", forged)
    day = page.evaluate("() => new Date().toISOString().slice(0, 10)")
    used = (get(f"aiQuota/H_{day}") or {}).get("count")
    check("the failed call was retried and its quota unit returned", used == len(calls) - 1 and len(calls) >= 4, f"quota {used}, calls {len(calls)}")
    s_used = (get(f"aiQuota/H_s_{sid}") or {})
    check("the session counter matches the successful calls and its cap is 2 x 2 players + 1", s_used.get("count") == used and s_used.get("cap") == 5, str(s_used))
    extra = H.evaluate("""async (sid) => { const s = await claude.use("sample"); const out = [];
        for (let k = 0; k < 6; k++) { try { await s("Write a class summary from this quiz evidence: none.", { sid }); out.push("ok"); } catch (e) { out.push(e.code); } }
        try { await s("Write a class summary.", {}); out.push("ok"); } catch (e) { out.push(e.code); } return out; }""", sid)
    left = 5 - used
    check("the host can use the rest of the session allowance, then is stopped; calls without a session are refused", extra == ["ok"] * left + ["quota_exceeded"] * (6 - left) + ["invalid_argument"], str(extra))
    logs = page.evaluate("() => [...__FB.docs.entries()].filter(([k]) => k.startsWith('aiLog/')).map(([, v]) => v)")
    check("call log has one entry per success and no student text", len(logs) == 5 and not any("Alice" in json.dumps(l) or "Bob" in json.dumps(l) for l in logs))
    check("clients cannot read quota counters", A.evaluate(f"() => DB.doc('aiQuota/A_{day}').get().then(() => 'read', (e) => e.code)") == "permission_denied")
    burst = B.evaluate("""async () => { const s = await claude.use("sample"); const out = [];
        for (let k = 0; k < 4; k++) { try { await s("Write a learning report from this quiz evidence: none.", { modelTier: "default" }); out.push("ok"); } catch (e) { out.push(e.code); } } return out; }""")
    check("players get 3 AI calls a day, then quota_exceeded", burst == ["ok", "ok", "ok", "quota_exceeded"], str(burst))

    probe = H.evaluate("""async (sid) => { const X = await loadSessionData(sid); const part = X.meta.participants[0]; const snap = personalSnapshot(X, part); const cands = candidatesFor(snap);
        const real = C.sample; let n = 0; const out = {};
        C.sample = async () => { n++; return { text: "not json" }; };
        try { await generatePersonal(snap, cands); out.bad = "ok"; } catch (e) { out.bad = e.name; } out.badCalls = n; n = 0;
        const long = Array.from({ length: 3 }, (_, k) => ("This point is deliberately long so that the composed report runs past the four hundred word limit item " + k + ". ").repeat(2));
        C.sample = async () => { n++; return { text: JSON.stringify({ performance_summary: long[0] + " " + long[1], knowledge_points: long, weak_or_risky_areas: long, possible_confusions: long, next_steps: long, resource_ids: [] }) }; };
        const g = await generatePersonal(snap, cands); out.longCalls = n; out.words = g.words; C.sample = real; return out; }""", sid)
    check("an unparseable AI reply is not retried (one call, then the report fails)", probe["bad"] == "SyntaxError" and probe["badCalls"] == 1, str(probe))
    check("a long report is shortened locally to 400 words or fewer without a second call", probe["longCalls"] == 1 and probe["words"] <= 400, str(probe))

    # export
    H.click('[data-act="openSession"]'); H.wait_for_selector("text=Research export", timeout=6000); sleep(1.0)
    ex = H.evaluate("() => buildExport([S.sess.sid], false)")
    check("export: reading time, server timing, client elapsed", ex["sessions"][0]["reading_time_s"] == 3 and all(x["timing_source"] == "server" and "client_elapsed_ms" in x for x in ex["submissions"]))
    finals = [x for x in ex["submissions"] if x["is_final_answer"]]
    check("export has 7 submission rows (A changed once), 6 of them final, and 6 exposures",
          len(ex["submissions"]) == 7 and len(finals) == 6 and len(ex["exposures"]) == 6,
          str((len(ex["submissions"]), len(finals), len(ex["exposures"]))))
    cols = H.evaluate("() => COLS.questions")
    check("export (schema 5): questions.csv says each question's origin; human-written ones read as human",
          cols[-4:] == ["origin", "ai_model", "ai_prompt_version", "ai_edited"] and all(x["origin"] == "human" and x["ai_model"] == "" and x["ai_edited"] == "" for x in ex["questions"]),
          str([(x["origin"], x["ai_model"], x["ai_edited"]) for x in ex["questions"]]))
    with page.expect_download() as dl:
        H.click('[data-act="aiBatch"]')
    with zipfile.ZipFile(dl.value.path()) as z:
        names = z.namelist(); pcsv = z.read("provenance.csv").decode("utf-8") if "provenance.csv" in names else ""
        pjson = json.loads(z.read("provenance.json")) if "provenance.json" in names else {"reports": []}
    rows = pjson["reports"]
    check("the reports zip carries provenance: model, prompt version and evidence snapshot per report, keyed by research id",
          pcsv.startswith("kind,pid,model,model_tier,prompt_version,evidence_snapshot,generated_at,generated_by,words,resources")
          and sorted(r["kind"] for r in rows) == ["class", "personal", "personal"]
          and all(r["model"] == "claude-sonnet-5-5" and r["prompt_version"] and r["evidence_snapshot"] and r["evidence"] for r in rows)
          and all(r["pid"].startswith("P-") for r in rows if r["kind"] == "personal") and "Alice" not in pcsv,
          str((names, [(r["kind"], r["pid"]) for r in rows])))

    # sign out
    A.click('[data-act="home"]'); A.wait_for_selector('[data-act="signOut"]', timeout=5000); A.click('[data-act="signOut"]')
    A.wait_for_selector('[data-act="signIn"]', timeout=8000)
    check("sign out returns to the sign-in screen", True)

    errs = page.evaluate("() => __FB.errs")
    bad = [c for c in cons if "net::ERR" not in c and "Failed to load resource" not in c and "permission" not in c.lower()]
    check("no uncaught errors", not errs, str(errs[:3]))
    check("no unexpected console errors or warnings", not bad, str(bad[:4]))
    page.screenshot(path=f"{ROOT}/shot_b_review.png")
    browser.close()
srv.shutdown()
fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed"); sys.exit(1 if fails else 0)
