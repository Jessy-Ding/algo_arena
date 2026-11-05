/**
 * @fileoverview Wiring test for the `draftQuestions` callable on the Auth, Firestore and Functions emulators: both
 * secrets reach the upstream requests, the Firestore deps read the host's set and the bank, the per-question quota
 * and the call log are written, and refusals carry the page's error codes. One fake server answers as the Anthropic
 * Messages API (/v1/messages) and the OpenAI Responses API (/v1/responses), refusing requests the real APIs would
 * refuse. Run by functions/test/emulator/run.sh.
 *
 * Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
 *     Northeastern University
 * Version: 1.0
 * Created: November 5, 2026 · San Francisco, California, USA
 *
 * License: This project is licensed under the MIT License — see LICENSE.md for details.
 * Copyright © 2026 Yikang (Richard) Liu.
 * @license MIT
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { dayKey } from "../../coach-core.js";
import { contractProblem } from "../anthropic-contract.mjs";
import { openaiProblem, openaiReply } from "../openai-contract.mjs";

const PROJECT = "demo-algoarena";
const FAKE_PORT = Number(process.env.FAKE_ANTHROPIC_PORT || 8799);
const EMULATOR_SECRET = "sk-emulator-fake";
const CALL_URL = `http://127.0.0.1:5001/${PROJECT}/us-central1/draftQuestions`;
const MODULE = "Module 1 (Foundations)";

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const seen = { anthropic: [], openai: [] };
let fake;

const QUESTION = {
  prompt: "How many times does the inner loop test of INSERTION-SORT run on already sorted input of n keys?",
  options: { A: "n − 1", B: "0", C: "n²/2", D: "n log n" }, correct: "A",
  distractor_rationales: { A: "", B: "Forgets the loop test runs once per key.", C: "Uses the worst case.", D: "Confuses it with MERGE-SORT." },
  explanation: "On sorted input the while-loop test fails at once for each of the n − 1 keys after the first.",
  feedback: { A: "Right: one failing test per key.", B: "The test itself still runs.", C: "That is the reverse-sorted case.", D: "Nothing is halved here." },
  difficulty: "easy", subtype: "loop-count", source_quote: "",
};

async function idToken(uid) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  // The Auth emulator accepts unsigned custom tokens.
  const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: "t@demo.test", sub: "t@demo.test", uid, iat: now, exp: now + 3600,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit" })}.`;
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error(`Auth emulator refused the custom token: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function call(uid, data) {
  const headers = { "content-type": "application/json" };
  if (uid) headers.authorization = `Bearer ${await idToken(uid)}`;
  const r = await fetch(CALL_URL, { method: "POST", headers, body: JSON.stringify({ data }) });
  return r.json();
}

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      const send = (status, b) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      if (req.url === "/v1/messages") {
        seen.anthropic.push({ headers: req.headers, body });
        const problem = contractProblem(body);
        if (problem) return send(400, { type: "error", error: { type: "invalid_request_error", message: problem } });
        return send(200, { model: body.model, stop_reason: "end_turn", usage: { input_tokens: 4000, output_tokens: 2000 },
          content: [{ type: "text", text: JSON.stringify({ questions: [QUESTION] }) }] });
      }
      seen.openai.push({ headers: req.headers, body });
      const problem = openaiProblem(body);
      if (problem) return send(400, { error: { type: "invalid_request_error", message: problem } });
      const reply = body.text.format.name === "solve" ? { choice: "A", confidence: "high", ambiguous: false, reason: "One test per key." } : { issues: [] };
      return send(200, openaiReply(JSON.stringify(reply)));
    });
  }).listen(FAKE_PORT, "127.0.0.1");
  await db.doc("meta/aiHosts").set({ uids: ["H"] });
  await db.doc("data/users/H/profile/sets/set_w1").set({ title: "Week 1", count: 0 });
  await db.doc("bank/b0001").set({ prompt: "What is the worst-case running time of INSERTION-SORT on n elements?", img: "",
    options: ["Θ(n²)", "Θ(n)", "Θ(n log n)", "Θ(n³)"], topic: MODULE });
});

after(() => fake.close());

test("a signed-out call and a player's call are refused with not_granted", async () => {
  for (const uid of [null, "P1"]) {
    const r = await call(uid, { module: MODULE, count: 1, setId: "set_w1" });
    assert.equal(r.error.status, "PERMISSION_DENIED");
    assert.equal(r.error.details.code, "not_granted");
  }
});

test("a host's call drafts, verifies, charges the delivered questions and logs no content", async () => {
  seen.anthropic.length = 0; seen.openai.length = 0;
  const r = await call("H", { module: MODULE, count: 2, setId: "set_w1", focus: "loop counts" });
  assert.equal(r.result.delivered, 1);
  assert.equal(r.result.dropped, 1);
  const d = r.result.drafts[0];
  assert.equal(d.verify.status, "agree");
  assert.equal(d.question.correct, 0);
  assert.deepEqual(d.question.options, ["n − 1", "0", "n²/2", "n log n"]);
  assert.equal(seen.anthropic.length, 1);
  assert.equal(seen.anthropic[0].headers["x-api-key"], EMULATOR_SECRET);
  assert.match(seen.anthropic[0].body.messages[0].content, /What is the worst-case running time of INSERTION-SORT on n elements\?/);
  assert.equal(seen.openai.length, 2);
  for (const o of seen.openai) assert.equal(o.headers.authorization, `Bearer ${EMULATOR_SECRET}`);
  const q = (await db.doc(`aiQuota/H_g_${dayKey(Date.now())}`).get()).data();
  assert.deepEqual([q.count, q.kind], [1, "qgen"]);
  const logs = (await db.collection("aiLog").where("kind", "==", "qgen").get()).docs.map((x) => x.data());
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0].requested, logs[0].delivered, logs[0].input_tokens, logs[0].verifier_input_tokens], [2, 1, 4000, 600]);
  assert.ok(!JSON.stringify(logs[0]).includes("INSERTION"));
});

test("a set that is not the host's and a bad module are refused before any upstream call", async () => {
  seen.anthropic.length = 0;
  let r = await call("H", { module: MODULE, count: 1, setId: "set_other" });
  assert.equal(r.error.details.code, "not_granted");
  r = await call("H", { module: "Module 9", count: 1, setId: "set_w1" });
  assert.equal(r.error.status, "INVALID_ARGUMENT");
  assert.equal(seen.anthropic.length, 0);
});
