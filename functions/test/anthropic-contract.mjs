/**
 * @fileoverview Request rules of the real Messages API that fakes must enforce, so a request the API would reject
 * with HTTP 400 fails in tests too. Sources: platform.claude.com/docs, "Define tools" (forced tool use) and
 * "Structured outputs" (JSON Schema limits), read on 2026-11-04.
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

const NO_FORCED_TOOLS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-mythos-5-1"];
// Keywords this project uses that structured outputs accept; anything else (maxItems, minLength, ...) is a 400.
const SCHEMA_KEYS = new Set(["type", "properties", "required", "additionalProperties", "items", "description", "enum"]);

/**
 * @param {*} s A JSON Schema node.
 * @param {string} at Path for the message.
 * @return {?string} The first rule broken, or null.
 */
function schemaProblem(s, at) {
  if (!s || typeof s !== "object") return null;
  for (const k of Object.keys(s)) if (!SCHEMA_KEYS.has(k)) return `${at}: unsupported keyword ${k}`;
  if (s.type === "object" && s.additionalProperties !== false) return `${at}: additionalProperties must be false`;
  for (const [k, v] of Object.entries(s.properties || {})) { const p = schemaProblem(v, `${at}.${k}`); if (p) return p; }
  return s.items ? schemaProblem(s.items, `${at}[]`) : null;
}

/**
 * @param {!Object} body A Messages API request body.
 * @return {?string} Why the real API would answer HTTP 400, or null.
 */
export function contractProblem(body) {
  const tc = body.tool_choice && body.tool_choice.type;
  if ((tc === "tool" || tc === "any") && NO_FORCED_TOOLS.includes(body.model)) return `${body.model} rejects tool_choice ${tc}`;
  const f = body.output_config && body.output_config.format;
  if (f) { if (f.type !== "json_schema") return "output_config.format.type must be json_schema"; return schemaProblem(f.schema, "schema"); }
  return null;
}

/**
 * @param {string} problem
 * @return {{ok: boolean, status: number, json: function(): !Promise<!Object>}} A fetch response shaped like the API's 400.
 */
export const badRequest = (problem) => ({ ok: false, status: 400, json: async () => ({ type: "error", error: { type: "invalid_request_error", message: problem } }) });
