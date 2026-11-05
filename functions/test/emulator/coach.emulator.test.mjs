/**
 * @fileoverview The deployed `coach` function (index.js + deps.js) on the Functions, Firestore and Auth emulators, with
 * the real firebase-functions and firebase-admin. Anthropic is replaced by a local fake (see fake-anthropic-preload.mjs);
 * everything else is the code that deploys. Run with test/emulator/run.sh.
 *
 * Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
 *     Northeastern University
 * Version: 1.0
 * Created: October 29, 2026 · San Francisco, California, USA
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

const PROJECT = "demo-algoarena";
const FAKE_PORT = Number(process.env.FAKE_ANTHROPIC_PORT || 8799);
const EMULATOR_SECRET = "sk-emulator-fake";
const CALL_URL = `http://127.0.0.1:5001/${PROJECT}/us-central1/coach`;

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const upstream = { requests: [], replies: [] };
let fake;

const textReply = (text) => ({ status: 200, body: { model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 3 },
  content: [{ type: "text", text }] } });

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

const quota = async (id) => (await db.doc(`aiQuota/${id}`).get()).get("count") ?? 0;
const today = () => dayKey(Date.now());

async function endedSession(host, sid, players) {
  await db.doc(`data/users/${host}/profile/sessions/${sid}`).set({ sid, createdAt: Date.now(), endAt: Date.now(),
    participants: players.map((uid) => ({ uid, pid: "P-" + uid })) });
}

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      upstream.requests.push({ headers: req.headers, body });
      // Answer as the real API would when the request breaks its rules, whatever reply the test queued.
      const problem = contractProblem(body);
      const reply = problem ? { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: problem } } }
        : upstream.replies.shift() || textReply("Default reply.");
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body));
    });
  }).listen(FAKE_PORT, "127.0.0.1");
  await db.doc("meta/aiHosts").set({ uids: ["H"] });
  await db.doc("meta/admins").set({ uids: ["ADM"] });
});

after(() => fake.close());

test("a signed-out call is refused", async () => {
  const r = await call(null, { prompt: "Hello." });
  assert.equal(r.error.status, "PERMISSION_DENIED");
  assert.equal(r.error.details.code, "not_granted");
});

test("a host's call for an ended session returns the model text and charges one daily and one session unit", async () => {
  await endedSession("H", "S-ok", ["A1", "A2"]);
  const dayBefore = await quota(`H_${today()}`);
  upstream.replies.push(textReply("Report text."));
  const r = await call("H", { prompt: "Summarize.", sid: "S-ok" });
  assert.equal(r.result.text, "Report text.");
  assert.equal(r.result.modelTierApplied, "default");
  assert.equal(await quota(`H_${today()}`), dayBefore + 1);
  const s = (await db.doc("aiQuota/H_s_S-ok").get()).data();
  assert.deepEqual([s.count, s.cap, s.sid, s.uid], [1, 5, "S-ok", "H"]);
});

test("the upstream request carries the key from the secret and asks for the report schema", async () => {
  await endedSession("H", "S-req", ["A1"]);
  upstream.requests.length = 0;
  upstream.replies.push(textReply('{"performance_summary":"Fine."}'));
  // The default tier is Sonnet 5.5, the model that refused forced tool use live on 2026-11-04.
  const r = await call("H", { prompt: "Write a report.", sid: "S-req", kind: "personal" });
  const sent = upstream.requests[0];
  assert.equal(sent.headers["x-api-key"], EMULATOR_SECRET);
  assert.equal(sent.headers["anthropic-version"], "2023-06-01");
  assert.equal(sent.body.model, "claude-sonnet-5-5");
  assert.equal(sent.body.output_config.format.type, "json_schema");
  assert.equal(sent.body.tool_choice, undefined);
  assert.deepEqual(JSON.parse(r.result.text), { performance_summary: "Fine." });
});

test("the call log stores sizes and a hash, never the prompt or the reply", async () => {
  await endedSession("H", "S-log", ["A1"]);
  const prompt = "Student evidence that must not be logged: Q1 wrong.";
  upstream.replies.push(textReply("Reply that must not be logged."));
  await call("H", { prompt, sid: "S-log" });
  const logs = (await db.collection("aiLog").where("sid", "==", "S-log").get()).docs.map((d) => d.data());
  assert.equal(logs.length, 1);
  assert.equal(logs[0].prompt_chars, prompt.length);
  assert.match(logs[0].prompt_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual([logs[0].input_tokens, logs[0].output_tokens, logs[0].role], [5, 3, "host"]);
  const stored = JSON.stringify(logs[0]);
  assert.ok(!stored.includes("must not be logged"));
});

test("an upstream 529 maps to rate_limited and refunds both quota units", async () => {
  await endedSession("H", "S-529", ["A1"]);
  const dayBefore = await quota(`H_${today()}`);
  upstream.replies.push({ status: 529, body: { type: "error" } });
  const r = await call("H", { prompt: "Summarize.", sid: "S-529" });
  assert.equal(r.error.status, "RESOURCE_EXHAUSTED");
  assert.equal(r.error.details.code, "rate_limited");
  assert.equal(await quota(`H_${today()}`), dayBefore);
  assert.equal(await quota("H_s_S-529"), 0);
});

test("an unreadable 200 reply is empty_completion and refunds both quota units", async () => {
  await endedSession("H", "S-junk", ["A1"]);
  const dayBefore = await quota(`H_${today()}`);
  upstream.replies.push({ status: 200, body: "not json" });
  const r = await call("H", { prompt: "Summarize.", sid: "S-junk" });
  assert.equal(r.error.details.code, "empty_completion");
  assert.equal(await quota(`H_${today()}`), dayBefore);
  assert.equal(await quota("H_s_S-junk"), 0);
});

test("a host is stopped at 2 x participants + 1 calls per session", async () => {
  await endedSession("H", "S-cap", ["A1"]);
  const codes = [];
  for (let k = 0; k < 4; k++) {
    const r = await call("H", { prompt: "Summarize.", sid: "S-cap" });
    codes.push(r.error ? r.error.details.code : "ok");
  }
  assert.deepEqual(codes, ["ok", "ok", "ok", "quota_exceeded"]);
  assert.equal(await quota("H_s_S-cap"), 3);
});

test("a host cannot get reports for a session that has not ended", async () => {
  await db.doc("data/users/H/profile/sessions/S-live").set({ sid: "S-live", createdAt: Date.now(), participants: [] });
  const r = await call("H", { prompt: "Summarize.", sid: "S-live" });
  assert.equal(r.error.details.code, "not_granted");
});

test("an admin who is not on the AI host list is treated as a host", async () => {
  await endedSession("ADM", "S-adm", ["A1"]);
  const r = await call("ADM", { prompt: "Summarize.", sid: "S-adm" });
  assert.equal(r.result.text, "Default reply.");
});

test("a player listed in the host's session gets 3 calls a day, then quota_exceeded", async () => {
  await endedSession("H", "S-play", ["P1"]);
  await db.doc("pub/P1").set({ sid: "S-play", host: "H" });
  const codes = [];
  for (let k = 0; k < 4; k++) {
    const r = await call("P1", { prompt: "My report." });
    codes.push(r.error ? r.error.details.code : "ok");
  }
  assert.deepEqual(codes, ["ok", "ok", "ok", "quota_exceeded"]);
});

test("a player cannot name a session they did not play in", async () => {
  await endedSession("H", "S-mine", ["P2"]);
  await db.doc("pub/P2").set({ sid: "S-mine", host: "H" });
  const r = await call("P2", { prompt: "My report.", sid: "S-other" });
  assert.equal(r.error.details.code, "not_granted");
});

test("a self-written pub record without a matching session listing does not unlock calls", async () => {
  await endedSession("H", "S-forged", ["someone-else"]);
  await db.doc("pub/P3").set({ sid: "S-forged", host: "H" });
  const r = await call("P3", { prompt: "My report." });
  assert.equal(r.error.details.code, "not_granted");
});

test("a user with no pub record is refused", async () => {
  const r = await call("NOBODY", { prompt: "My report." });
  assert.equal(r.error.details.code, "not_granted");
});
