/**
 * @fileoverview AlgoArena AI Learning Coach: request handling shared by the Cloud Function (functions/index.js) and
 * the browser test harness. No Node-only or Firebase APIs here; storage and network come in through `deps`, so the
 * logic can be unit-tested directly (functions/test/coach-core.test.mjs).
 *
 * Error codes are the ones the page already understands (sampleJson retries only rate_limited): not_granted,
 * quota_exceeded, invalid_argument, rate_limited, upstream_error, empty_completion, misconfigured.
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

export const DEFAULTS = Object.freeze({
  models: Object.freeze({ quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" }),
  apiUrl: "https://api.anthropic.com/v1/messages",
  apiVersion: "2023-06-01",
  maxPromptChars: 24000,
  maxTokens: 1200,
  timeoutMs: 60000,
  // Hosts get 2 x participants + 1 calls per ended session (a report per player, a rewrite when one runs long, a class
  // summary); hostDailyCap only guards against abuse across sessions.
  hostDailyCap: 250,
  participantDailyCap: 3,
  system:
    "You are the AlgoArena Learning Coach. An algorithms course uses you to write short learning reports and class " +
    "summaries from live-quiz evidence. Follow the instructions in the user message. If the user message asks for " +
    "anything other than a learning report or class summary about the quiz evidence it contains, reply with exactly " +
    '{"error":"out_of_scope"} and nothing else.',
});

const list = (n, w) => ({ type: "array", description: `at most ${n} items`, items: { type: "string", description: `at most ${w} words` } });
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
// Report kinds use structured outputs, so the reply is always a JSON object with these keys. Sonnet 5.5 and Opus 5.5
// reject a forced tool_choice, and structured outputs reject maxItems, so item and word limits are advice to the
// model; the page trims the lists. The schemas stay on the server and the page only names the kind.
export const SCHEMAS = Object.freeze({
  personal: obj({
    performance_summary: { type: "string", description: "at most 50 words" }, knowledge_points: list(3, 18), weak_or_risky_areas: list(3, 18),
    possible_confusions: list(3, 18), next_steps: list(3, 18), resource_ids: { type: "array", description: "1 to 3 ids", items: { type: "string" } } }),
  class: obj({
    overview: { type: "string", description: "at most 60 words" }, prominent_knowledge_points: list(4, 25), common_error_patterns: list(4, 25),
    possible_confusion_signals: list(4, 25), instructor_review_areas: list(4, 25) }),
});

/** An expected refusal or failure; functions/index.js maps its code to an HTTPS error. */
export class CoachError extends Error {
  /**
   * @param {string} code Page error code, for example "quota_exceeded".
   * @param {string} message Shown to the user by the page.
   * @param {?Object=} upstream Anthropic's status, error type and message, for the server log only.
   */
  constructor(code, message, upstream = null) { super(message); this.name = "CoachError"; this.code = code; this.upstream = upstream; }
}

/**
 * @param {string} s
 * @return {boolean} Whether s parses to a JSON object (not an array or a scalar).
 */
const isJsonObject = (s) => { try { const v = JSON.parse(s); return !!v && typeof v === "object" && !Array.isArray(v); } catch (e) { return false; } };

/**
 * Keys the daily quota counters.
 *
 * @param {number} ms Epoch milliseconds.
 * @return {string} The UTC date as YYYY-MM-DD.
 */
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Lets the call log identify a prompt without storing it.
 *
 * @param {string} s
 * @return {!Promise<string>} The SHA-256 digest as 64 lowercase hex characters.
 */
export async function sha256hex(s) {
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {*} data The page's request data: {prompt, tier?, sid?, kind?}.
 * @param {!Object=} cfg
 * @return {{prompt: string, tier: string, sid: ?string, kind: ?string}} tier defaults to "default", sid and kind to
 *     null.
 * @throws {!CoachError} invalid_argument.
 */
export function validateInput(data, cfg = DEFAULTS) {
  const prompt = data && data.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) throw new CoachError("invalid_argument", "The request needs a prompt.");
  if (prompt.length > cfg.maxPromptChars) throw new CoachError("invalid_argument", `The prompt is longer than ${cfg.maxPromptChars} characters.`);
  const tier = (data && data.tier) || "default";
  if (!Object.prototype.hasOwnProperty.call(cfg.models, tier)) throw new CoachError("invalid_argument", `Unknown model tier "${tier}".`);
  const sid = data && data.sid != null ? data.sid : null;
  if (sid !== null && (typeof sid !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(sid))) throw new CoachError("invalid_argument", "The session id is not valid.");
  const kind = data && data.kind != null ? data.kind : null;
  if (kind !== null && !Object.prototype.hasOwnProperty.call(SCHEMAS, kind)) throw new CoachError("invalid_argument", `Unknown report kind "${kind}".`);
  return { prompt, tier, sid, kind };
}

/**
 * @param {number} participants
 * @return {number} A host's AI call allowance for one session.
 */
export const sessionCap = (participants) => 2 * Math.max(0, participants) + 1;

/**
 * @param {number} status HTTP status of a failed Anthropic API response.
 * @return {{code: string, refund: boolean, msg: string}} refund is currently true for every status.
 */
export function mapStatus(status) {
  // 429 and 529 mean the request was not processed, so the page may retry them without spending tokens.
  if (status === 429 || status === 529) return { code: "rate_limited", refund: true, msg: "The AI service is busy. Try again shortly." };
  if (status === 401 || status === 403) return { code: "misconfigured", refund: true, msg: "The AI service rejected the server's API key. Ask the course admin to check it." };
  if (status === 400 || status === 413) return { code: "invalid_argument", refund: true, msg: "The AI service refused the request." };
  return { code: "upstream_error", refund: true, msg: `The AI service failed (HTTP ${status}).` };
}

/**
 * Hosts must name one of their own ended sessions; players must be listed in the host's record of a session at most
 * 3 days old. A failed or empty upstream call returns its quota unit.
 *
 * @param {{uid: ?string, data: *, deps: !Object, cfg: (!Object|undefined)}} request deps is built by firestoreDeps
 *     (deps.js); uid is null when signed out.
 * @return {!Promise<{text: string, truncated: boolean, modelApplied: string, modelTierApplied: string}>} For report
 *     kinds, text is the forced tool's input as JSON.
 * @throws {!CoachError} With one of the error codes listed in the file overview.
 */
export async function runCoach({ uid, data, deps, cfg = DEFAULTS }) {
  if (!uid) throw new CoachError("not_granted", "Sign in first.");
  const { prompt, tier, sid, kind } = validateInput(data, cfg);
  const host = await deps.isHost(uid);
  const day = dayKey(deps.now());
  let quota;
  if (host) {
    // A host's calls are tied to one of their own ended sessions, read from the host's private records.
    if (!sid) throw new CoachError("invalid_argument", "AI reports must name the session they are for.");
    const sess = await deps.hostSession(uid, sid);
    if (!sess) throw new CoachError("not_granted", "That session is not one of yours.");
    if (!sess.ended) throw new CoachError("not_granted", "AI reports are generated after the session ends.");
    quota = { uid, day, dailyCap: cfg.hostDailyCap, sid, sessionCap: sessionCap(sess.participants) };
  } else {
    const joined = await deps.hasJoined(uid);
    if (!joined) throw new CoachError("not_granted", "AI reports are available to hosts and to players who joined a game.");
    if (sid && sid !== joined.sid) throw new CoachError("not_granted", "That is not the session you played in.");
    quota = { uid, day, dailyCap: cfg.participantDailyCap, sid: null, sessionCap: null };
  }
  const q = await deps.consumeQuota(quota);
  if (!q.ok) throw new CoachError("quota_exceeded", q.limit === "session"
    ? `This session's AI limit (${quota.sessionCap} reports for ${(quota.sessionCap - 1) / 2} players) has been reached.`
    : `The daily AI limit (${quota.dailyCap}) has been reached.`);

  const model = cfg.models[tier];
  const body = { model, max_tokens: cfg.maxTokens, system: cfg.system, messages: [{ role: "user", content: prompt }] };
  if (kind) body.output_config = { format: { type: "json_schema", schema: SCHEMAS[kind] } };
  const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(cfg.timeoutMs) : undefined;
  let res, json;
  try {
    res = await deps.fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": deps.apiKey(), "anthropic-version": cfg.apiVersion },
      body: JSON.stringify(body), signal,
    });
    json = await res.json().catch(() => null);
  } catch (e) {
    await deps.refundQuota(quota);
    throw new CoachError("upstream_error", "Could not reach the AI service.");
  }
  if (!res.ok) {
    const m = mapStatus(res.status);
    if (m.refund) await deps.refundQuota(quota);
    // Anthropic's error type and message go to the server log only; they describe the request, not the student.
    const err = (json && json.error) || {};
    throw new CoachError(m.code, m.msg, { status: res.status, type: err.type || null, message: err.message || null });
  }
  const blocks = (json && json.content) || [];
  let text = blocks.filter((b) => b && b.type === "text").map((b) => b.text || "").join("");
  // A refusal or a cut-off reply can break the schema, so report kinds must parse to a JSON object.
  if (kind && !isJsonObject(text)) text = "";
  if (!text.trim()) { await deps.refundQuota(quota); throw new CoachError("empty_completion", "The AI service returned no text."); }

  const usage = (json && json.usage) || {};
  const out = { text, truncated: json.stop_reason === "max_tokens", modelApplied: json.model || model, modelTierApplied: tier };
  // The log keeps sizes and a hash, never the prompt or the reply: both contain student evidence.
  await deps.log({
    uid, day, sid: quota.sid, kind, at: deps.now(), role: host ? "host" : "participant", model: out.modelApplied, tier,
    input_tokens: usage.input_tokens ?? null, output_tokens: usage.output_tokens ?? null, truncated: out.truncated,
    prompt_chars: prompt.length, prompt_sha256: await sha256hex(prompt),
  });
  return out;
}
