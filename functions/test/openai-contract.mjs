/**
 * @fileoverview Request rules of the OpenAI Responses API with strict structured outputs that fakes must enforce, so a
 * request the API would reject fails in tests too. Source: developers.openai.com, "Structured outputs" (supported
 * schemas: every property required, additionalProperties false on every object), read on 2026-11-04. The live check
 * before release confirms the response shape (output[].content[].output_text).
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

// The keywords qgen-core.js uses; OpenAI accepts more, but anything else here would be an unreviewed change.
const SCHEMA_KEYS = new Set(["type", "properties", "required", "additionalProperties", "items", "description", "enum"]);

/**
 * @param {*} s A JSON Schema node.
 * @param {string} at Path for the message.
 * @return {?string} The first strict-mode rule broken, or null.
 */
function strictProblem(s, at) {
  if (!s || typeof s !== "object") return null;
  for (const k of Object.keys(s)) if (!SCHEMA_KEYS.has(k)) return `${at}: unsupported keyword ${k}`;
  if (s.type === "object") {
    if (s.additionalProperties !== false) return `${at}: additionalProperties must be false`;
    const props = Object.keys(s.properties || {});
    if (props.length !== (s.required || []).length || props.some((p) => !s.required.includes(p))) return `${at}: every property must be required`;
  }
  for (const [k, v] of Object.entries(s.properties || {})) { const p = strictProblem(v, `${at}.${k}`); if (p) return p; }
  return s.items ? strictProblem(s.items, `${at}[]`) : null;
}

/**
 * @param {!Object} body A Responses API request body.
 * @return {?string} Why the real API would refuse it, or null.
 */
export function openaiProblem(body) {
  if (typeof body.model !== "string" || !body.model) return "model is required";
  if (typeof body.input !== "string" && !Array.isArray(body.input)) return "input must be a string or a list";
  const f = body.text && body.text.format;
  if (!f) return null;
  if (f.type !== "json_schema") return "text.format.type must be json_schema";
  if (typeof f.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(f.name)) return "text.format.name is required";
  if (f.strict !== true) return null;
  return strictProblem(f.schema, "schema");
}

/**
 * @param {string} text The output_text the fake model returns.
 * @param {!Object=} extra Fields that override the response, for example {status: "incomplete"}.
 * @return {!Object} A Responses API response body.
 */
export const openaiReply = (text, extra = {}) => ({ id: "resp_test", object: "response", status: "completed",
  output: [{ type: "reasoning", summary: [] }, { type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 300, output_tokens: 90 }, ...extra });
