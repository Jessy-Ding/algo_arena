/**
 * @fileoverview AlgoArena AI question drafting (v1.1, docs/ai-question-generation.md): input checks, prompt filling,
 * deterministic checks, duplicate flags, the LangGraph pipeline and per-question quota. Network, storage and time come
 * in through `deps` (functions/deps.js), as in coach-core.js, so the logic is unit-tested with fakes
 * (functions/test/qgen-core.test.mjs).
 *
 * Pipeline: draft -> validate -> (repair once, only if a question failed a check) -> validate -> verify. Verification
 * (a blind solve and an audit by a second model) only flags drafts; the host decides on the page.
 *
 * Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
 *     Northeastern University
 * Version: 1.0
 * Created: November 4, 2026 · San Francisco, California, USA
 *
 * License: This project is licensed under the MIT License — see LICENSE.md for details.
 * Copyright © 2026 Yikang (Richard) Liu.
 * @license MIT
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { CoachError, mapStatus, dayKey, sha256hex } from "./coach-core.js";
import * as P from "./qgen-prompts.js";

export const QGEN = Object.freeze({
  draftModel: "claude-sonnet-5-5",
  verifierModel: "gpt-6.1-terra",
  anthropicUrl: "https://api.anthropic.com/v1/messages",
  anthropicVersion: "2023-06-01",
  openaiUrl: "https://api.openai.com/v1/responses",
  draftMaxTokens: 16000,
  verifyMaxTokens: 4000,
  // Two draft calls (draft, repair) and one verifier round must fit in the function's 540 s timeout.
  draftTimeoutMs: 180000,
  verifyTimeoutMs: 90000,
  dailyCap: 50,
  maxCount: 5,
  maxFocus: 200,
  maxSource: 12000,
  maxExisting: 40,
  limits: Object.freeze({ prompt: 600, option: 160, explanation: 600, feedback: 300, rationale: 200 }),
});

export const MODULES = Object.freeze(["Module 1 (Foundations)", "Module 2 (Sorting and Order Statistics)",
  "Module 3 (Advanced Design and Analysis Techniques)", "Module 4 (Graph Algorithms)", "Module 5 (Selected Topics)",
  "Module 6 (NP-Completeness)"]);
export const SUBTYPES = Object.freeze(["complexity", "definition", "proof", "behavior", "loop-count", "recurrence"]);
const DIFFICULTIES = ["easy", "medium", "hard", "mixed"];
const KEYS = ["A", "B", "C", "D"];
const AUDIT_CHECKS = ["explanation", "distractor", "feedback_leak", "feedback_wrong", "difficulty", "wording"];
// Lower rank is shown first on the review list.
const STATUS_RANK = { disagree: 0, ambiguous: 1, unverified: 2, issues: 3, agree: 4 };

const str = (description) => (description ? { type: "string", description } : { type: "string" });
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const abcd = (description) => obj(Object.fromEntries(KEYS.map((k) => [k, str(description)])));

export const DRAFT_SCHEMA = obj({ questions: { type: "array", items: obj({
  prompt: str(), options: abcd(), correct: { type: "string", enum: KEYS },
  distractor_rationales: abcd("empty for the correct option"), explanation: str("at most 60 words"),
  feedback: abcd("one or two sentences"), difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
  subtype: { type: "string", enum: [...SUBTYPES] }, source_quote: str() }) } });
export const SOLVE_SCHEMA = obj({ choice: { type: "string", enum: KEYS }, confidence: { type: "string", enum: ["low", "medium", "high"] },
  ambiguous: { type: "boolean" }, reason: str() });
export const AUDIT_SCHEMA = obj({ issues: { type: "array", items: obj({ check: { type: "string", enum: AUDIT_CHECKS }, note: str() }) } });

/**
 * Fills each placeholder once, in a single pass, so a value that happens to contain another placeholder (or a `$`
 * pattern) is inserted literally.
 *
 * @param {string} template
 * @param {!Object<string, string>} values Placeholder text to value; every placeholder must occur in template.
 * @return {string}
 */
export function fill(template, values) {
  const at = Object.keys(values).map((k) => {
    const i = template.indexOf(k);
    if (i < 0) throw new Error(`Template lacks ${k}`);
    return /** @type {[number, string]} */ ([i, k]);
  }).sort((a, b) => a[0] - b[0]);
  let out = "", pos = 0;
  for (const [i, k] of at) { out += template.slice(pos, i) + values[k]; pos = i + k.length; }
  return out + template.slice(pos);
}

const CHECK = P.REPAIR_CHECKS.split("\n");
const SAY = {
  sameOptions: CHECK[0], above: CHECK[1], noExplanation: CHECK[2],
  noFeedback: (k) => fill(CHECK[3], { "{{K}}": k }), noRationale: (k) => fill(CHECK[4], { "{{K}}": k }),
  correctRationale: CHECK[5], tooLong: (field, max) => fill(CHECK[6], { "{{FIELD}}": field, "{{MAX}}": String(max) }),
  quoteNotInSource: CHECK[7], quoteWithoutSource: CHECK[8],
};

/**
 * @param {*} data The page's request: {module, count, setId, focus?, chapter?, difficulty?, subtype?, sourceText?}.
 * @param {!Object=} cfg
 * @return {{module: string, count: number, setId: string, focus: string, chapter: ?number, difficulty: string,
 *     subtype: ?string, sourceText: string}}
 * @throws {!CoachError} invalid_argument.
 */
export function validateDraftInput(data, cfg = QGEN) {
  const d = data || {};
  const bad = (msg) => new CoachError("invalid_argument", msg);
  if (!MODULES.includes(d.module)) throw bad("Choose one of the six modules.");
  if (!Number.isInteger(d.count) || d.count < 1 || d.count > cfg.maxCount) throw bad(`Draft 1 to ${cfg.maxCount} questions at a time.`);
  if (typeof d.setId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(d.setId)) throw bad("The question set id is not valid.");
  const focus = d.focus == null ? "" : d.focus;
  if (typeof focus !== "string" || focus.length > cfg.maxFocus) throw bad(`The focus must be text of at most ${cfg.maxFocus} characters.`);
  const chapter = d.chapter == null || d.chapter === "" ? null : d.chapter;
  if (chapter !== null && (!Number.isInteger(chapter) || chapter < 1 || chapter > 40)) throw bad("The chapter must be a whole number from 1 to 40.");
  const difficulty = d.difficulty == null || d.difficulty === "" ? "mixed" : d.difficulty;
  if (!DIFFICULTIES.includes(difficulty)) throw bad("Difficulty must be easy, medium, hard or mixed.");
  const subtype = d.subtype == null || d.subtype === "" ? null : d.subtype;
  if (subtype !== null && !SUBTYPES.includes(subtype)) throw bad("Unknown question subtype.");
  const sourceText = d.sourceText == null ? "" : d.sourceText;
  if (typeof sourceText !== "string" || sourceText.length > cfg.maxSource) throw bad(`Source text must be at most ${cfg.maxSource} characters.`);
  // The prompt fences the source with these tags, so the source must not be able to close the fence.
  if (/<\/?source>/i.test(sourceText)) throw bad("Source text must not contain <source> tags.");
  return { module: d.module, count: d.count, setId: d.setId, focus: focus.trim(), chapter, difficulty, subtype, sourceText: sourceText.trim() };
}

const oneLine = (s) => String(s).replace(/\s+/g, " ").trim();

/**
 * @param {!Object} inp Output of validateDraftInput.
 * @param {!Array<string>} existing Prompts the model must not repeat, most relevant first.
 * @param {!Object=} cfg
 * @return {string} The qgen-draft-v1 user message.
 */
export function draftUserMessage(inp, existing, cfg = QGEN) {
  const avoid = [...new Set(existing.map(oneLine).filter(Boolean))].slice(0, cfg.maxExisting);
  return fill(P.DRAFT_USER, {
    "{{COUNT}}": String(inp.count),
    "{{MODULE}}": inp.module,
    '{{FOCUS | "none"}}': inp.focus || "none",
    '{{CHAPTER | "not specified"}}': inp.chapter === null ? "not specified" : String(inp.chapter),
    "{{DIFFICULTY}}": inp.difficulty,
    '{{SUBTYPE | "choose from: complexity, definition, proof, behavior, loop-count, recurrence"}}':
      inp.subtype || "choose from: complexity, definition, proof, behavior, loop-count, recurrence",
    '{{EXISTING_PROMPTS, up to 40, one per line | "none"}}': avoid.length ? avoid.join("\n") : "none",
    "{{SOURCE_TEXT | empty}}": inp.sourceText,
    "{{EXAMPLES}}": P.DRAFT_EXAMPLES,
  });
}

/**
 * Model output with the answer key upper-cased (structured outputs do not guarantee enum casing) and every field a
 * string, so later checks can rely on the shape.
 *
 * @param {*} q One element of the draft reply's questions array.
 * @return {!Object}
 */
export function normalizeDraft(q) {
  const s = (v) => (typeof v === "string" ? v : "");
  const four = (o) => Object.fromEntries(KEYS.map((k) => [k, s(o && o[k])]));
  return { prompt: s(q && q.prompt), options: four(q && q.options), correct: s(q && q.correct).trim().toUpperCase(),
    distractor_rationales: four(q && q.distractor_rationales), explanation: s(q && q.explanation), feedback: four(q && q.feedback),
    difficulty: s(q && q.difficulty).toLowerCase(), subtype: s(q && q.subtype).toLowerCase(), source_quote: s(q && q.source_quote) };
}

const fold = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
const ABOVE = /\b(all|none) of (the )?(above|these|them)\b/i;

/**
 * Deterministic checks of section 6. `fatal` marks a question no approved repair sentence can describe (an empty
 * prompt or option, or a key outside A to D); it is dropped. `fails` holds approved qgen-repair-v1 sentences.
 *
 * @param {!Object} q Output of normalizeDraft.
 * @param {string} sourceText The host's source text, or "".
 * @param {!Object=} cfg
 * @return {{fatal: boolean, fails: !Array<string>}}
 */
export function checkDraft(q, sourceText, cfg = QGEN) {
  const L = cfg.limits;
  if (!q.prompt.trim() || KEYS.some((k) => !q.options[k].trim()) || !KEYS.includes(q.correct)) return { fatal: true, fails: [] };
  const fails = [];
  if (new Set(KEYS.map((k) => fold(q.options[k]))).size < 4) fails.push(SAY.sameOptions);
  if (KEYS.some((k) => ABOVE.test(q.options[k]))) fails.push(SAY.above);
  if (!q.explanation.trim()) fails.push(SAY.noExplanation);
  for (const k of KEYS) if (!q.feedback[k].trim()) fails.push(SAY.noFeedback(k));
  for (const k of KEYS) if (k !== q.correct && !q.distractor_rationales[k].trim()) fails.push(SAY.noRationale(k));
  if (q.distractor_rationales[q.correct].trim()) fails.push(SAY.correctRationale);
  if (q.prompt.length > L.prompt) fails.push(SAY.tooLong("prompt", L.prompt));
  for (const k of KEYS) if (q.options[k].length > L.option) fails.push(SAY.tooLong(`option ${k}`, L.option));
  if (q.explanation.length > L.explanation) fails.push(SAY.tooLong("explanation", L.explanation));
  for (const k of KEYS) if (q.feedback[k].length > L.feedback) fails.push(SAY.tooLong(`feedback for option ${k}`, L.feedback));
  for (const k of KEYS) if (q.distractor_rationales[k].length > L.rationale) fails.push(SAY.tooLong(`rationale for option ${k}`, L.rationale));
  if (sourceText) {
    const quote = oneLine(q.source_quote);
    if (!quote || !oneLine(sourceText).includes(quote)) fails.push(SAY.quoteNotInSource);
  } else if (q.source_quote.trim()) fails.push(SAY.quoteWithoutSource);
  return { fatal: false, fails };
}

// Near-duplicate detection, ported from the owner's Route 2 pack (dedup.py): normalized prompts that are identical,
// or that share the same content words and a similarity ratio of at least 0.90.
const STOPWORDS = new Set(["what", "which", "does", "with", "from", "that", "this", "have", "into", "over", "under",
  "when", "then", "than", "them", "they", "their", "there", "each", "such", "both", "also", "only", "just", "like",
  "using", "used"]);
const dnorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9θΩω]+/g, " ").replace(/\s+/g, " ").trim();
const contentKey = (s) => [...new Set(dnorm(s).split(" ").filter((w) => w.length > 3 && !STOPWORDS.has(w)))].sort().join(" ");

/**
 * @param {string} a
 * @param {string} b
 * @return {number} Characters in the longest common substrings, found recursively (Ratcliff/Obershelp).
 */
function matched(a, b) {
  if (!a.length || !b.length) return 0;
  let best = 0, ai = 0, bj = 0, prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] !== b[j - 1]) continue;
      cur[j] = prev[j - 1] + 1;
      if (cur[j] > best) { best = cur[j]; ai = i - best; bj = j - best; }
    }
    prev = cur;
  }
  if (!best) return 0;
  return best + matched(a.slice(0, ai), b.slice(0, bj)) + matched(a.slice(ai + best), b.slice(bj + best));
}

/**
 * @param {string} a
 * @param {string} b
 * @return {number} 2M / T, as difflib.SequenceMatcher.ratio() without its junk heuristic.
 */
export const similarity = (a, b) => (a.length + b.length ? (2 * matched(a, b)) / (a.length + b.length) : 1);

/**
 * The page's qkeyOf: content-based, so the same question copied or written twice gets the same key.
 *
 * @param {{prompt: string, img: (string|undefined), options: !Array<string>}} q
 * @return {!Promise<string>} 16 hex digits.
 */
export async function qkeyOf(q) { return (await sha256hex([q.prompt, q.img || "", ...q.options].join("␞"))).slice(0, 16); }

/**
 * @param {{prompt: (string|undefined), img: (string|undefined), options: (!Array<string>|undefined)}} q
 * @return {!Promise<{qkey: string, n: string, ck: string}>} What duplicateFlag compares a draft with.
 */
export async function knownEntry(q) {
  const prompt = q.prompt || "";
  return { qkey: await qkeyOf({ prompt, img: q.img, options: q.options || [] }), n: dnorm(prompt), ck: contentKey(prompt) };
}

/**
 * @param {{prompt: string, qkey: string}} q
 * @param {!Array<{qkey: string, n: string, ck: string}>} known knownEntry output for questions already in the set,
 *     the bank or this batch.
 * @return {?string} "duplicate", "near_duplicate" or null.
 */
export function duplicateFlag(q, known) {
  const n = dnorm(q.prompt), ck = contentKey(q.prompt);
  if (known.some((x) => x.qkey === q.qkey || x.n === n)) return "duplicate";
  return known.some((x) => x.ck === ck && similarity(n, x.n) >= 0.9) ? "near_duplicate" : null;
}

const timeout = (ms) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

/**
 * One qgen-draft-v1 or qgen-repair-v1 call to the Messages API with structured output.
 *
 * @return {!Promise<{text: string, questions: !Array, model: string, usage: {input: number, output: number}}>}
 * @throws {!CoachError}
 */
async function anthropicDraft(deps, cfg, messages) {
  const body = { model: cfg.draftModel, max_tokens: cfg.draftMaxTokens, system: P.DRAFT_SYSTEM, messages,
    output_config: { format: { type: "json_schema", schema: DRAFT_SCHEMA } } };
  let res, json;
  try {
    res = await deps.fetch(cfg.anthropicUrl, { method: "POST", signal: timeout(cfg.draftTimeoutMs),
      headers: { "content-type": "application/json", "x-api-key": deps.apiKey(), "anthropic-version": cfg.anthropicVersion },
      body: JSON.stringify(body) });
    json = await res.json().catch(() => null);
  } catch (e) { throw new CoachError("upstream_error", "Could not reach the AI service."); }
  if (!res.ok) {
    const m = mapStatus(res.status), err = (json && json.error) || {};
    throw new CoachError(m.code, m.msg, { status: res.status, type: err.type || null, message: err.message || null });
  }
  const text = ((json && json.content) || []).filter((b) => b && b.type === "text").map((b) => b.text || "").join("");
  let value = null;
  try { value = JSON.parse(text); } catch (e) { value = null; }
  // A refusal or a reply cut off at max_tokens can break the schema.
  if (!value || !Array.isArray(value.questions) || !value.questions.length) throw new CoachError("empty_completion", "The AI service returned no questions.");
  const u = (json && json.usage) || {};
  return { text, questions: value.questions, model: json.model || cfg.draftModel, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
}

/**
 * One verifier call (Responses API, strict json_schema, store: false so OpenAI keeps no application state). This is
 * the only provider-specific verifier code; the reply is re-checked by the caller, so a provider without strict
 * schemas can replace it here.
 *
 * @return {!Promise<{value: !Object, usage: {input: number, output: number}}>}
 * @throws {!CoachError}
 */
async function verifierJson(deps, cfg, name, schema, input) {
  const body = { model: cfg.verifierModel, input, store: false, max_output_tokens: cfg.verifyMaxTokens,
    text: { format: { type: "json_schema", name, strict: true, schema } } };
  let res, json;
  try {
    res = await deps.fetch(cfg.openaiUrl, { method: "POST", signal: timeout(cfg.verifyTimeoutMs),
      headers: { "content-type": "application/json", authorization: `Bearer ${deps.openaiKey()}` }, body: JSON.stringify(body) });
    json = await res.json().catch(() => null);
  } catch (e) { throw new CoachError("upstream_error", "Could not reach the verifier."); }
  if (!res.ok) {
    const err = (json && json.error) || {};
    throw new CoachError(mapStatus(res.status).code, `The verifier failed (HTTP ${res.status}).`, { status: res.status, type: err.type || null, message: err.message || null });
  }
  const parts = ((json && json.output) || []).filter((o) => o && o.type === "message").flatMap((o) => o.content || []);
  const text = parts.filter((c) => c && c.type === "output_text").map((c) => c.text || "").join("");
  let value = null;
  if (json && json.status === "completed") { try { value = JSON.parse(text); } catch (e) { value = null; } }
  if (!value || typeof value !== "object") throw new CoachError("empty_completion", "The verifier returned no answer.");
  const u = json.usage || {};
  return { value, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0 } };
}

/**
 * @param {*} v A solve reply.
 * @return {?{choice: string, confidence: string, ambiguous: boolean, reason: string}} null when it breaks SOLVE_SCHEMA.
 */
export function readSolve(v) {
  const choice = String((v && v.choice) || "").trim().toUpperCase(), confidence = String((v && v.confidence) || "").toLowerCase();
  if (!KEYS.includes(choice) || !["low", "medium", "high"].includes(confidence) || typeof v.ambiguous !== "boolean") return null;
  return { choice, confidence, ambiguous: v.ambiguous, reason: typeof v.reason === "string" ? v.reason : "" };
}

/**
 * @param {*} v An audit reply.
 * @return {?Array<{check: string, note: string}>} null when it breaks AUDIT_SCHEMA.
 */
export function readAudit(v) {
  if (!v || !Array.isArray(v.issues)) return null;
  const issues = v.issues.map((x) => ({ check: String((x && x.check) || "").toLowerCase(), note: typeof (x && x.note) === "string" ? x.note : "" }));
  return issues.every((x) => AUDIT_CHECKS.includes(x.check)) ? issues : null;
}

/**
 * @param {?Object} solve readSolve output, or null when the call failed.
 * @param {?Array} issues readAudit output, or null when the call failed.
 * @param {string} key The draft's correct option.
 * @return {string} One of the statuses of section 7.
 */
export function verifyStatus(solve, issues, key) {
  if (!solve) return "unverified";
  if (solve.ambiguous) return "ambiguous";
  if (solve.choice !== key) return "disagree";
  if (!issues) return "unverified";
  return issues.length ? "issues" : "agree";
}

const auditJson = (q) => JSON.stringify({ prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation,
  feedback: q.feedback, distractor_rationales: q.distractor_rationales, difficulty: q.difficulty }, null, 1);

const State = Annotation.Root({
  inp: Annotation(),
  messages: Annotation(),
  reply: Annotation(),
  model: Annotation(),
  items: Annotation(),
  repaired: Annotation({ reducer: (a, b) => b, default: () => false }),
  repairError: Annotation({ reducer: (a, b) => b, default: () => null }),
  // Token counts per provider, summed across nodes: ain/aout for the draft model, vin/vout for the verifier.
  usage: Annotation({ reducer: (/** @type {!Object} */ a, /** @type {!Object} */ b) => ({ ain: a.ain + (b.ain || 0), aout: a.aout + (b.aout || 0), vin: a.vin + (b.vin || 0), vout: a.vout + (b.vout || 0) }),
    default: () => ({ ain: 0, aout: 0, vin: 0, vout: 0 }) }),
});

/**
 * @param {!Object} deps
 * @param {!Object} cfg
 * @return {!Object} A compiled LangGraph graph; invoke it with {inp, messages} where messages holds the draft request.
 */
export function buildGraph(deps, cfg) {
  const draft = async (s) => {
    const r = await anthropicDraft(deps, cfg, s.messages);
    return { reply: r.text, model: r.model, items: r.questions.slice(0, s.inp.count).map((q) => ({ q: normalizeDraft(q) })), usage: { ain: r.usage.input, aout: r.usage.output } };
  };
  const validate = async (s) => ({ items: s.items.map((it) => ({ ...it, ...checkDraft(it.q, s.inp.sourceText, cfg) })) });
  const needsRepair = (s) => (!s.repaired && s.items.some((it) => !it.fatal && it.fails.length) ? "repair" : "verify");
  const repair = async (s) => {
    const failed = s.items.filter((it) => !it.fatal && it.fails.length);
    const blocks = failed.map((it, i) => fill(P.REPAIR_ITEM, { "{{i}}": String(i + 1), "{{CHECKS}}": it.fails.join("; "), "{{QUESTION_JSON}}": JSON.stringify(it.q) }));
    const ask = [fill(P.REPAIR_HEAD, { "{{N}}": String(failed.length) }), ...blocks].join("\n\n");
    let r;
    // A failed repair is not fatal: the questions that failed are dropped and refunded.
    try { r = await anthropicDraft(deps, cfg, [...s.messages, { role: "assistant", content: s.reply }, { role: "user", content: ask }]); }
    catch (e) { if (e instanceof CoachError) return { repaired: true, repairError: e.code }; throw e; }
    if (r.questions.length !== failed.length) return { repaired: true, repairError: "count_mismatch", usage: { ain: r.usage.input, aout: r.usage.output } };
    let k = 0;
    const items = s.items.map((it) => (!it.fatal && it.fails.length ? { q: normalizeDraft(r.questions[k++]) } : it));
    return { items, repaired: true, usage: { ain: r.usage.input, aout: r.usage.output } };
  };
  const verify = async (s) => {
    let vin = 0, vout = 0;
    const call = async (name, schema, input, read) => {
      try { const r = await verifierJson(deps, cfg, name, schema, input); vin += r.usage.input; vout += r.usage.output; return read(r.value); }
      catch (e) { if (e instanceof CoachError) return null; throw e; }
    };
    const items = await Promise.all(s.items.map(async (it) => {
      if (it.fatal || it.fails.length) return it;
      const q = it.q;
      const [solve, issues] = await Promise.all([
        call("solve", SOLVE_SCHEMA, fill(P.SOLVE_TEMPLATE, { "{{PROMPT}}": q.prompt, "{{A}}": q.options.A, "{{B}}": q.options.B, "{{C}}": q.options.C, "{{D}}": q.options.D }), readSolve),
        call("audit", AUDIT_SCHEMA, fill(P.AUDIT_TEMPLATE, { "{{DRAFT_JSON}}": auditJson(q) }), readAudit),
      ]);
      return { ...it, solve, issues, status: verifyStatus(solve, issues, q.correct) };
    }));
    return { items, usage: { vin, vout } };
  };
  return new StateGraph(State)
    .addNode("draft", draft).addNode("validate", validate).addNode("repair", repair).addNode("verify", verify)
    .addEdge(START, "draft").addEdge("draft", "validate")
    .addConditionalEdges("validate", needsRepair, ["repair", "verify"])
    .addEdge("repair", "validate").addEdge("verify", END)
    .compile();
}

/**
 * @param {!Object} q normalizeDraft output that passed checkDraft.
 * @param {!Object} inp
 * @return {!Object} The question in the page's normQ shape, with no internal drafting fields.
 */
function pageQuestion(q, inp) {
  return { prompt: q.prompt, img: "", options: KEYS.map((k) => q.options[k]), correct: KEYS.indexOf(q.correct),
    optFeedback: KEYS.map((k) => q.feedback[k]), explanation: q.explanation, refs: [], topic: inp.module, subtype: q.subtype,
    difficulty: q.difficulty, timeLimit: null, source: "AlgoArena AI draft", chapter: inp.chapter };
}

/**
 * Approved hosts only; the set must be the host's own. The day's quota is reserved for `count` questions up front and
 * every question not delivered is returned.
 *
 * @param {{uid: ?string, data: *, deps: !Object, cfg: (!Object|undefined)}} request deps is built by firestoreDeps.
 * @return {!Promise<!Object>} {drafts, ai, requested, delivered, dropped, quotaLeft}; drafts are flagged first.
 * @throws {!CoachError}
 */
export async function runDraft({ uid, data, deps, cfg = QGEN }) {
  if (!uid) throw new CoachError("not_granted", "Sign in first.");
  const inp = validateDraftInput(data, cfg);
  if (!(await deps.isHost(uid))) throw new CoachError("not_granted", "AI drafting is available to approved hosts.");
  const setQs = await deps.setQuestions(uid, inp.setId);
  if (!setQs) throw new CoachError("not_granted", "That question set is not one of yours.");
  const bank = await deps.bankQuestions();
  const existing = [...setQs.map((q) => q.prompt || ""), ...bank.filter((q) => q.topic === inp.module).map((q) => q.prompt || "")];
  const user = draftUserMessage(inp, existing, cfg);

  const at = deps.now(), day = dayKey(at);
  const q = await deps.reserveDrafts({ uid, day, n: inp.count, cap: cfg.dailyCap });
  if (!q.ok) throw new CoachError("quota_exceeded", `The daily AI drafting limit (${cfg.dailyCap} questions) leaves ${Math.max(0, cfg.dailyCap - q.used)} for today.`);
  let s;
  try { s = await buildGraph(deps, cfg).invoke({ inp, messages: [{ role: "user", content: user }] }); }
  catch (e) { await deps.refundDrafts({ uid, day, n: inp.count }); throw e; }

  const known = await Promise.all([...setQs, ...bank].map(knownEntry));
  const drafts = [];
  for (const it of s.items.filter((x) => !x.fatal && !x.fails.length)) {
    const question = pageQuestion(it.q, inp);
    const entry = await knownEntry(question), qkey = entry.qkey;
    const flag = duplicateFlag({ prompt: question.prompt, qkey }, known);
    known.push(entry);
    drafts.push({ question, qkey, rationales: KEYS.map((k) => it.q.distractor_rationales[k]), sourceQuote: it.q.source_quote,
      flags: flag ? [flag] : [], verify: { status: it.status, ...(it.solve || {}) }, auditIssues: it.issues || [] });
  }
  drafts.sort((a, b) => STATUS_RANK[a.verify.status] - STATUS_RANK[b.verify.status] || (b.flags.length - a.flags.length));
  const undelivered = inp.count - drafts.length;
  if (undelivered > 0) await deps.refundDrafts({ uid, day, n: undelivered });

  const requestSha256 = await sha256hex(P.DRAFT_SYSTEM + "\n" + user);
  const ai = { model: s.model, verifierModel: cfg.verifierModel, promptVersions: { ...P.PROMPT_VERSIONS }, generatedAt: at, requestSha256 };
  // Sizes, counts and hashes only: no source text, prompts or replies.
  await deps.log({ uid, day, kind: "qgen", at, role: "host", set_id: inp.setId, model: s.model, verifier_model: cfg.verifierModel,
    prompt_versions: ai.promptVersions, requested: inp.count, delivered: drafts.length, repaired: !!s.repaired, repair_error: s.repairError,
    statuses: drafts.map((d) => d.verify.status), draft_qkeys: drafts.map((d) => d.qkey), input_tokens: s.usage.ain, output_tokens: s.usage.aout,
    verifier_input_tokens: s.usage.vin, verifier_output_tokens: s.usage.vout, prompt_chars: user.length, prompt_sha256: requestSha256,
    source_chars: inp.sourceText.length });
  return { drafts, ai, requested: inp.count, delivered: drafts.length, dropped: undelivered, quotaLeft: Math.max(0, cfg.dailyCap - q.used + undelivered) };
}
