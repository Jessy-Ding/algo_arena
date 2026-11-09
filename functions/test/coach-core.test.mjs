/**
 * @fileoverview Unit tests (node:test) for functions/coach-core.js and the Firestore-backed deps in
 * functions/deps.js: access control for hosts and recent players, input validation, the daily and per-session AI quotas
 * and their refunds, the Anthropic request shape, upstream error mapping, structured report output and the call log.
 * An in-memory stand-in for the Admin SDK Firestore and fake fetch functions replace the network; no emulator is needed.
 * The round-2 tests target mutants that survived Stryker (verify/evidence/round2/MUTATION_SURVIVORS.md).
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
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCoach, DEFAULTS, CoachError, dayKey, sessionCap, SCHEMAS } from "../coach-core.js";
import { firestoreDeps } from "../deps.js";
import { contractProblem, badRequest } from "./anthropic-contract.mjs";

function fakeAdminDb(seed = {}) {
  const docs = new Map(Object.entries(seed)); const added = [];
  const snap = (path) => { const d = docs.get(path); return { exists: d !== undefined, get: (f) => (d ? d[f] : undefined), data: () => d }; };
  const ref = (path) => ({ path, get: async () => snap(path), set: async (v, o) => docs.set(path, o && o.merge ? { ...(docs.get(path) || {}), ...v } : v) });
  return {
    docs, added,
    doc: ref,
    collection: (c) => ({ add: async (v) => { added.push({ c, v }); return { id: "x" + added.length }; } }),
    // Transactions delegate straight to the refs, with no isolation.
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v, o) => r.set(v, o) }),
  };
}
const NOW = Date.UTC(2026, 9, 29, 15, 0, 0);
function okFetch(text = '{"performance_summary":"ok"}', extra = {}) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) });
    const problem = contractProblem(JSON.parse(init.body)); if (problem) return badRequest(problem);
    return { ok: true, status: 200, json: async () => ({ model: JSON.parse(init.body).model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 120, output_tokens: 40 }, ...extra }) }; };
  f.calls = calls; return f;
}
const statusFetch = (status) => async () => ({ ok: false, status, json: async () => ({ type: "error" }) });
function setup({ seed = {}, fetch = okFetch(), now = NOW } = {}) {
  const db = fakeAdminDb({ "meta/admins": { uids: ["host1"] }, "pub/stu1": { sid: "S1", host: "host1", joinedAt: now - 3600e3 },
    "data/users/host1/profile/sessions/S1": { createdAt: now - 3600e3, endAt: now - 600e3, participants: [{ uid: "stu1" }, { uid: "stu2" }] }, ...seed });
  const deps = firestoreDeps(db, { fetch, apiKey: () => "sk-test", now: () => now });
  return { db, deps, fetch };
}
// Host calls must name a session; call() adds the host's own unless the test sets sid.
const HOST_SID = { host1: "S1", ta1: "T1" };
const call = (deps, uid, data) => runCoach({ uid, data: { ...(HOST_SID[uid] && !("sid" in data) ? { sid: HOST_SID[uid] } : {}), ...data }, deps });
const sessionUsed = (db, uid, sid) => (db.docs.get(`aiQuota/${uid}_s_${sid}`) || {}).count || 0;
const quota = (db, uid, now = NOW) => (db.docs.get(`aiQuota/${uid}_${dayKey(now)}`) || {}).count || 0;
// Every refusal must also carry a message the page can show.
const rejects = (p, code, msg = /\S/) => assert.rejects(p, (e) => e instanceof CoachError && e.name === "CoachError" && e.code === code && msg.test(e.message));

test("signed-out callers are refused", async () => { const { deps } = setup(); await rejects(call(deps, null, { prompt: "x" }), "not_granted"); });

test("users who are neither hosts nor recent players are refused", async () => {
  const { deps, fetch } = setup(); await rejects(call(deps, "stranger", { prompt: "x" }), "not_granted"); assert.equal(fetch.calls.length, 0);
});

test("a player whose session is older than 3 days is refused", async () => {
  const { deps } = setup({ seed: { "pub/old": { sid: "S0", host: "host1" }, "data/users/host1/profile/sessions/S0": { createdAt: NOW - 4 * 864e5, participants: [{ uid: "old" }] } } });
  await rejects(call(deps, "old", { prompt: "x" }), "not_granted");
});

test("a forged player record is refused when the host's session does not list the user", async () => {
  const { deps, fetch } = setup({ seed: { "pub/forger": { sid: "S1", host: "host1", joinedAt: NOW } } });
  await rejects(call(deps, "forger", { prompt: "x" }), "not_granted"); assert.equal(fetch.calls.length, 0);
});

test("a player record pointing at a session that does not exist is refused", async () => {
  const { deps } = setup({ seed: { "pub/ghost": { sid: "Snope", host: "host1", joinedAt: NOW } } });
  await rejects(call(deps, "ghost", { prompt: "x" }), "not_granted");
});

test("bad input is refused before any quota is used", async () => {
  const { deps, db } = setup();
  await rejects(call(deps, "host1", {}), "invalid_argument");
  await rejects(call(deps, "host1", { prompt: "   " }), "invalid_argument");
  await rejects(call(deps, "host1", { prompt: "x".repeat(DEFAULTS.maxPromptChars + 1) }), "invalid_argument");
  await rejects(call(deps, "host1", { prompt: "x", tier: "gpt" }), "invalid_argument");
  assert.equal(quota(db, "host1"), 0);
});

test("the request to Anthropic has the right shape and model for the tier", async () => {
  const { deps, fetch } = setup();
  const out = await call(deps, "host1", { prompt: "Write the report.", tier: "quick" });
  const c = fetch.calls[0];
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.init.headers["x-api-key"], "sk-test");
  assert.equal(c.init.headers["anthropic-version"], "2023-06-01");
  assert.equal(c.body.model, "claude-haiku-5-5");
  assert.equal(c.body.max_tokens, DEFAULTS.maxTokens);
  assert.match(c.body.system, /out_of_scope/);
  assert.deepEqual(c.body.messages, [{ role: "user", content: "Write the report." }]);
  assert.equal(out.modelApplied, "claude-haiku-5-5"); assert.equal(out.modelTierApplied, "quick"); assert.equal(out.truncated, false);
});

test("default tier uses the default model", async () => {
  const { deps, fetch } = setup(); await call(deps, "host1", { prompt: "x" }); assert.equal(fetch.calls[0].body.model, DEFAULTS.models.default);
});

test("players get the participant cap, then quota_exceeded", async () => {
  const { deps, db } = setup();
  for (let k = 0; k < DEFAULTS.participantDailyCap; k++) await call(deps, "stu1", { prompt: "x" });
  await rejects(call(deps, "stu1", { prompt: "x" }), "quota_exceeded");
  assert.equal(quota(db, "stu1"), DEFAULTS.participantDailyCap);
});

test("hosts get the host cap", async () => {
  const { deps, db } = setup({ seed: { [`aiQuota/host1_${dayKey(NOW)}`]: { count: DEFAULTS.hostDailyCap - 1 } } });
  await call(deps, "host1", { prompt: "x" });
  await rejects(call(deps, "host1", { prompt: "x" }), "quota_exceeded");
  assert.equal(quota(db, "host1"), DEFAULTS.hostDailyCap);
});

test("hosts can also be listed in meta/aiHosts", async () => {
  const { deps } = setup({ seed: { "meta/aiHosts": { uids: ["ta1"] }, "data/users/ta1/profile/sessions/T1": { createdAt: NOW, endAt: NOW, participants: [] } } });
  await call(deps, "ta1", { prompt: "x" });
});

test("upstream failures map to page codes and give the quota unit back", async () => {
  for (const [status, code] of [[429, "rate_limited"], [529, "rate_limited"], [500, "upstream_error"], [401, "misconfigured"], [400, "invalid_argument"]]) {
    const { deps, db } = setup({ fetch: statusFetch(status) });
    await rejects(call(deps, "host1", { prompt: "x" }), code);
    assert.equal(quota(db, "host1"), 0, `quota refunded after HTTP ${status}`);
  }
});

test("network errors map to upstream_error and refund", async () => {
  const { deps, db } = setup({ fetch: async () => { throw new TypeError("fetch failed"); } });
  await rejects(call(deps, "host1", { prompt: "x" }), "upstream_error"); assert.equal(quota(db, "host1"), 0);
});

test("an empty completion maps to empty_completion and refunds", async () => {
  const { deps, db } = setup({ fetch: okFetch("  ") }); await rejects(call(deps, "host1", { prompt: "x" }), "empty_completion"); assert.equal(quota(db, "host1"), 0);
});

test("max_tokens stop is reported as truncated", async () => {
  const { deps } = setup({ fetch: okFetch("{}", { stop_reason: "max_tokens" }) }); const out = await call(deps, "host1", { prompt: "x" }); assert.equal(out.truncated, true);
});

test("the call log has sizes and a hash, never the prompt or reply", async () => {
  const { deps, db } = setup(); const prompt = "EVIDENCE: Alice answered B on question 3"; await call(deps, "host1", { prompt });
  const e = db.added.find((x) => x.c === "aiLog").v;
  assert.equal(e.prompt_chars, prompt.length); assert.match(e.prompt_sha256, /^[0-9a-f]{64}$/);
  assert.equal(e.input_tokens, 120); assert.equal(e.output_tokens, 40); assert.equal(e.role, "host");
  assert.ok(!JSON.stringify(e).includes("Alice"), "no prompt text in the log");
});

test("refunds never take the counter below zero", async () => {
  const { deps, db } = setup(); await deps.refundQuota({ uid: "host1", day: dayKey(NOW), sid: "S1" });
  assert.equal(quota(db, "host1"), 0); assert.equal(sessionUsed(db, "host1", "S1"), 0);
});

// Per-session host quota: user decision C (2 x participants + 1 per session, plus a daily guard).
test("session cap formula", () => { assert.equal(sessionCap(0), 1); assert.equal(sessionCap(2), 5); assert.equal(sessionCap(30), 61); });

test("a host gets 2 x participants + 1 calls per session, then quota_exceeded naming the session limit", async () => {
  const { deps, db } = setup(); // S1 has 2 participants: cap 5
  for (let k = 0; k < 5; k++) await call(deps, "host1", { prompt: "x" });
  await assert.rejects(call(deps, "host1", { prompt: "x" }), (e) => e.code === "quota_exceeded" && /session/.test(e.message));
  assert.equal(sessionUsed(db, "host1", "S1"), 5); assert.equal(quota(db, "host1"), 5);
});

test("each session has its own cap", async () => {
  const { deps, db } = setup({ seed: { "data/users/host1/profile/sessions/S2": { createdAt: NOW, endAt: NOW, participants: [{ uid: "x" }] } } });
  for (let k = 0; k < 5; k++) await call(deps, "host1", { prompt: "x" });
  for (let k = 0; k < 3; k++) await call(deps, "host1", { prompt: "x", sid: "S2" });
  await rejects(call(deps, "host1", { prompt: "x", sid: "S2" }), "quota_exceeded");
  assert.equal(sessionUsed(db, "host1", "S2"), 3); assert.equal(quota(db, "host1"), 8);
});

test("a host call without a session id is refused", async () => { const { deps } = setup(); await rejects(call(deps, "host1", { prompt: "x", sid: null }), "invalid_argument"); });

test("a malformed session id is refused", async () => { const { deps } = setup(); await rejects(call(deps, "host1", { prompt: "x", sid: "../S1" }), "invalid_argument"); });

test("a host cannot charge another host's session", async () => {
  const { deps } = setup({ seed: { "meta/aiHosts": { uids: ["ta1"] } } }); // S1 belongs to host1
  await rejects(call(deps, "ta1", { prompt: "x", sid: "S1" }), "not_granted");
});

test("no AI calls before the session ends", async () => {
  const { deps } = setup({ seed: { "data/users/host1/profile/sessions/S3": { createdAt: NOW, participants: [] } } });
  await rejects(call(deps, "host1", { prompt: "x", sid: "S3" }), "not_granted");
});

test("a failed upstream call gives back both the daily and the session unit", async () => {
  const { deps, db } = setup({ fetch: statusFetch(429) });
  await rejects(call(deps, "host1", { prompt: "x" }), "rate_limited");
  assert.equal(quota(db, "host1"), 0); assert.equal(sessionUsed(db, "host1", "S1"), 0);
});

test("the daily guard still applies to hosts across sessions", async () => {
  const { deps } = setup({ seed: { [`aiQuota/host1_${dayKey(NOW)}`]: { count: DEFAULTS.hostDailyCap } } });
  await assert.rejects(call(deps, "host1", { prompt: "x" }), (e) => e.code === "quota_exceeded" && /daily/.test(e.message));
});

test("a player may name only the session they played in", async () => {
  const { deps } = setup();
  await rejects(call(deps, "stu1", { prompt: "x", sid: "S9" }), "not_granted");
  await call(deps, "stu1", { prompt: "x", sid: "S1" });
});

test("personal reports ask for the learning-report JSON schema and return the JSON text", async () => {
  const input = { performance_summary: "s", knowledge_points: ["a"], weak_or_risky_areas: [], possible_confusions: [], next_steps: ["n"], resource_ids: [] };
  const { deps, fetch } = setup({ fetch: okFetch(JSON.stringify(input)) });
  const out = await call(deps, "host1", { prompt: "x", kind: "personal" });
  const b = fetch.calls[0].body;
  assert.deepEqual(b.output_config, { format: { type: "json_schema", schema: SCHEMAS.personal } });
  assert.equal(b.tools, undefined); assert.equal(b.tool_choice, undefined);
  assert.deepEqual(Object.keys(b.output_config.format.schema.properties).sort(), ["knowledge_points", "next_steps", "performance_summary", "possible_confusions", "resource_ids", "weak_or_risky_areas"]);
  assert.deepEqual(JSON.parse(out.text), input);
});
test("class summaries ask for the class-summary JSON schema", async () => {
  const { deps, fetch } = setup({ fetch: okFetch(JSON.stringify({ overview: "o", prominent_knowledge_points: [], common_error_patterns: [], possible_confusion_signals: [], instructor_review_areas: [] })) });
  await call(deps, "host1", { prompt: "x", kind: "class" }); assert.deepEqual(fetch.calls[0].body.output_config.format.schema, SCHEMAS.class);
  // Sort a copy: sorting in place once reordered the shared, shallowly frozen schema.
  assert.deepEqual([...SCHEMAS.class.required].sort(), ["common_error_patterns", "instructor_review_areas", "overview", "possible_confusion_signals", "prominent_knowledge_points"]);
});
// The live failure of 2026-11-04: Sonnet 5.5 answered every forced-tool report call with HTTP 400.
test("every model tier and report kind passes the Messages API request rules", async () => {
  for (const tier of Object.keys(DEFAULTS.models)) for (const kind of [null, ...Object.keys(SCHEMAS)]) {
    const { deps, fetch } = setup({ fetch: okFetch('{"overview":"o"}') });
    await call(deps, "host1", { prompt: "x", tier, ...(kind ? { kind } : {}) });
    assert.equal(contractProblem(fetch.calls[0].body), null, `${tier}/${kind}`);
  }
});
test("an API 400 keeps Anthropic's error type and message for the server log", async () => {
  const { deps } = setup({ fetch: async () => badRequest("claude-sonnet-5-5 rejects tool_choice tool") });
  await assert.rejects(call(deps, "host1", { prompt: "x" }), (e) => e.code === "invalid_argument" && e.message === "The AI service refused the request."
    && e.upstream.status === 400 && e.upstream.type === "invalid_request_error" && /tool_choice/.test(e.upstream.message));
});
test("an unknown report kind is refused", async () => { const { deps } = setup(); await rejects(call(deps, "host1", { prompt: "x", kind: "essay" }), "invalid_argument"); });
test("a report reply that is not a JSON object is empty_completion and refunds", async () => {
  for (const text of ["", "I can't help with that.", "[1, 2]", '"text"', '{"cut off":']) {
    const { deps, db } = setup({ fetch: okFetch(text) }); await rejects(call(deps, "host1", { prompt: "x", kind: "personal" }), "empty_completion"); assert.equal(quota(db, "host1"), 0, text);
  }
});
test("requests without a kind stay plain text", async () => { const { deps, fetch } = setup(); await call(deps, "host1", { prompt: "x" }); assert.equal(fetch.calls[0].body.output_config, undefined); });

// Round 2: tests for mutants that survived Stryker (verify/evidence/round2/mutation-*.json).
test("day keys are UTC calendar dates", () => { assert.equal(dayKey(NOW), "2026-10-29"); assert.equal(dayKey(Date.UTC(2026, 9, 29, 23, 59, 59)), "2026-10-29"); });

// Literal ids, so a wrong id in DEFAULTS fails; comparing with DEFAULTS.models.default could not.
test("each tier maps to its fixed model id", async () => {
  for (const [tier, model] of [["quick", "claude-haiku-5-5"], ["default", "claude-sonnet-5-5"], ["complex", "claude-opus-5-5"]]) {
    const { deps, fetch } = setup(); await call(deps, "host1", { prompt: "x", tier }); assert.equal(fetch.calls[0].body.model, model);
  }
});

test("the fixed system prompt names the coach, its two tasks and the out-of-scope reply", () => {
  assert.equal(DEFAULTS.system,
    "You are the AlgoArena Learning Coach. An algorithms course uses you to write short learning reports and class " +
    "summaries from live-quiz evidence. Follow the instructions in the user message. If the user message asks for " +
    "anything other than a learning report or class summary about the quiz evidence it contains, reply with exactly " +
    '{"error":"out_of_scope"} and nothing else.');
});

test("report schemas are closed objects with lists of strings whose limits are described", () => {
  const list = (n, w) => ({ type: "array", description: `at most ${n} items`, items: { type: "string", description: `at most ${w} words` } });
  assert.deepEqual(SCHEMAS.personal, {
    type: "object", additionalProperties: false,
    required: ["performance_summary", "knowledge_points", "weak_or_risky_areas", "possible_confusions", "next_steps", "resource_ids"],
    properties: { performance_summary: { type: "string", description: "at most 50 words" }, knowledge_points: list(3, 18), weak_or_risky_areas: list(3, 18),
      possible_confusions: list(3, 18), next_steps: list(3, 18), resource_ids: { type: "array", description: "1 to 3 ids", items: { type: "string" } } } });
  assert.deepEqual(SCHEMAS.class, {
    type: "object", additionalProperties: false,
    required: ["overview", "prominent_knowledge_points", "common_error_patterns", "possible_confusion_signals", "instructor_review_areas"],
    properties: { overview: { type: "string", description: "at most 60 words" }, prominent_knowledge_points: list(4, 25), common_error_patterns: list(4, 25),
      possible_confusion_signals: list(4, 25), instructor_review_areas: list(4, 25) } });
});

test("a prompt of exactly the maximum length is accepted", async () => {
  const { deps } = setup(); await call(deps, "host1", { prompt: "x".repeat(DEFAULTS.maxPromptChars) });
});

test("session ids must be whole strings of safe characters", async () => {
  const { deps } = setup();
  await rejects(call(deps, "host1", { prompt: "x", sid: 123 }), "invalid_argument");
  await rejects(call(deps, "host1", { prompt: "x", sid: "S1/../S2" }), "invalid_argument");
  await rejects(call(deps, "host1", { prompt: "x", sid: "S".repeat(101) }), "invalid_argument");
});

test("signed-out callers are refused before input is checked", async () => {
  const { deps } = setup(); await rejects(call(deps, null, {}), "not_granted", /Sign in/); await rejects(call(deps, "", { prompt: "x" }), "not_granted", /Sign in/);
});

test("HTTP 403 and 413 map like 401 and 400", async () => {
  for (const [status, code] of [[403, "misconfigured"], [413, "invalid_argument"]]) {
    const { deps, db } = setup({ fetch: statusFetch(status) }); await rejects(call(deps, "host1", { prompt: "x" }), code); assert.equal(quota(db, "host1"), 0);
  }
});

test("the session-limit message states the cap and the player count", async () => {
  const { deps } = setup(); for (let k = 0; k < 5; k++) await call(deps, "host1", { prompt: "x" });
  await rejects(call(deps, "host1", { prompt: "x" }), "quota_exceeded", /\b5 reports for 2 players\b/);
});

test("a host session without a participant list allows one call", async () => {
  const { deps } = setup({ seed: { "data/users/host1/profile/sessions/S4": { createdAt: NOW, endAt: NOW } } });
  await call(deps, "host1", { prompt: "x", sid: "S4" }); await rejects(call(deps, "host1", { prompt: "x", sid: "S4" }), "quota_exceeded");
});

test("another host's session id is refused as not yours, not as unfinished", async () => {
  const { deps } = setup({ seed: { "meta/aiHosts": { uids: ["ta1"] } } });
  await rejects(call(deps, "ta1", { prompt: "x", sid: "S1" }), "not_granted", /not one of yours/);
});

test("the request is a JSON POST with a timeout signal", async () => {
  const { deps, fetch } = setup(); await call(deps, "host1", { prompt: "x" });
  const { init } = fetch.calls[0];
  assert.equal(init.method, "POST"); assert.equal(init.headers["content-type"], "application/json"); assert.ok(init.signal instanceof AbortSignal);
});

test("without AbortSignal (older runtimes) the request is sent without a signal", async () => {
  const saved = globalThis.AbortSignal;
  try {
    globalThis.AbortSignal = undefined;
    const { deps, fetch } = setup(); await call(deps, "host1", { prompt: "x" }); assert.equal(fetch.calls[0].init.signal, undefined);
  } finally { globalThis.AbortSignal = saved; }
});

test("the reply's model is reported when the API names one, else the requested model", async () => {
  let r = setup({ fetch: okFetch("ok", { model: "claude-sonnet-5-5-20261001" }) });
  assert.equal((await call(r.deps, "host1", { prompt: "x" })).modelApplied, "claude-sonnet-5-5-20261001");
  r = setup({ fetch: okFetch("ok", { model: undefined }) });
  assert.equal((await call(r.deps, "host1", { prompt: "x" })).modelApplied, "claude-sonnet-5-5");
});

test("plain replies concatenate only text blocks, with no separator", async () => {
  const content = [{ type: "text", text: "A" }, { type: "thinking", text: "hidden" }, { type: "text" }, { type: "text", text: "B" }];
  const { deps } = setup({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ content, stop_reason: "end_turn" }) }) });
  assert.equal((await call(deps, "host1", { prompt: "x" })).text, "AB");
});

test("report replies are read from text blocks only", async () => {
  const input = { performance_summary: "s", knowledge_points: [], weak_or_risky_areas: [], possible_confusions: [], next_steps: [], resource_ids: [] };
  const reply = (content) => async () => ({ ok: true, status: 200, json: async () => ({ content, stop_reason: "end_turn" }) });
  const r = setup({ fetch: reply([{ type: "thinking", text: '{"wrong":1}' }, { type: "text", text: JSON.stringify(input) }]) });
  assert.deepEqual(JSON.parse((await call(r.deps, "host1", { prompt: "x", kind: "personal" })).text), input);
});

test("player calls are logged with the participant role and no session", async () => {
  const { deps, db } = setup(); await call(deps, "stu1", { prompt: "x" });
  const e = db.added.find((x) => x.c === "aiLog").v; assert.equal(e.role, "participant"); assert.equal(e.sid, null);
});

test("a player record without a host or without a session never qualifies", async () => {
  // Paths that a missing field would turn into ".../undefined/..." are seeded, so only the explicit guard refuses.
  const { deps } = setup({ seed: {
    "pub/nohost": { sid: "S1" }, "data/users/undefined/profile/sessions/S1": { createdAt: NOW, participants: [{ uid: "nohost" }] },
    "pub/nosid": { host: "host1" }, "data/users/host1/profile/sessions/undefined": { createdAt: NOW, participants: [{ uid: "nosid" }] } } });
  await rejects(call(deps, "nohost", { prompt: "x" }), "not_granted"); await rejects(call(deps, "nosid", { prompt: "x" }), "not_granted");
});

test("a player session exactly 3 days old still qualifies", async () => {
  const { deps } = setup({ seed: { "pub/edge": { sid: "S5", host: "host1" }, "data/users/host1/profile/sessions/S5": { createdAt: NOW - 3 * 864e5, participants: [{ uid: "edge" }] } } });
  await call(deps, "edge", { prompt: "x" });
});

test("a failed player call gives back the daily unit", async () => {
  const { deps, db } = setup({ fetch: statusFetch(529) });
  await rejects(call(deps, "stu1", { prompt: "x" }), "rate_limited"); assert.equal(quota(db, "stu1"), 0);
});

test("a refund decrements the counters by one and keeps the other fields", async () => {
  let ok = true; const fetch = async (u, init) => (ok ? okFetch()(u, init) : statusFetch(429)());
  const { deps, db } = setup({ fetch });
  await call(deps, "host1", { prompt: "x" }); await call(deps, "host1", { prompt: "x" }); ok = false;
  await rejects(call(deps, "host1", { prompt: "x" }), "rate_limited");
  assert.equal(quota(db, "host1"), 2); assert.equal(sessionUsed(db, "host1", "S1"), 2);
  assert.deepEqual({ ...db.docs.get("aiQuota/host1_s_S1"), updatedAt: 0 }, { uid: "host1", sid: "S1", count: 2, cap: 5, updatedAt: 0 });
  assert.deepEqual({ ...db.docs.get(`aiQuota/host1_${dayKey(NOW)}`), updatedAt: 0 }, { uid: "host1", day: dayKey(NOW), count: 2, updatedAt: 0 });
});
