/**
 * @fileoverview A draftQuestions result produced by the real runDraft (functions/qgen-core.js) with fake APIs, for the
 * browser end-to-end test, whose harness cannot load LangGraph. `node functions/test/qgen-fixture.mjs` prints it;
 * test/e2e/qgen-fixture.json holds a copy, and functions/test/qgen-core.test.mjs fails if the copy no longer matches,
 * so the page is always tested against the function's current output shape.
 *
 * The run: two drafts, the first marked A but solved as B by the checker (status disagree, listed first), the second
 * agreed and a near duplicate of the bank question it is given.
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
import { pathToFileURL } from "node:url";
import { QGEN, runDraft } from "../qgen-core.js";

const DRAFTS = [
  { prompt: "After BUILD-MAX-HEAP runs on the array ⟨4, 1, 3, 2, 16⟩, which element is at index 1?",
    options: { A: "16", B: "4", C: "3", D: "2" }, correct: "A",
    distractor_rationales: { A: "", B: "Assumes the root never moves.", C: "Stops after the first MAX-HEAPIFY call.", D: "Confuses a max-heap with a min-heap of the last half." },
    explanation: "BUILD-MAX-HEAP sifts down from the last internal node, and the maximum, 16, ends at the root.",
    feedback: { A: "Right: the maximum rises to the root.", B: "The root is replaced as larger keys sift up.", C: "Later MAX-HEAPIFY calls move it again.", D: "In a max-heap the root holds the largest key." },
    difficulty: "easy", subtype: "behavior", source_quote: "" },
  { prompt: "What is the running time of BUILD-MAX-HEAP on an array of n elements, as CLRS proves?",
    options: { A: "Θ(n)", B: "Θ(n log n)", C: "Θ(log n)", D: "Θ(n²)" }, correct: "A",
    distractor_rationales: { A: "", B: "Multiplies n calls by the worst-case height without summing level by level.", C: "Gives the cost of one MAX-HEAPIFY call.", D: "Treats each sift-down as linear." },
    explanation: "Summing the heights of all nodes gives O(n), and every element is touched, so Θ(n).",
    feedback: { A: "Right: most nodes are near the leaves, so the total height is linear.", B: "That bound is valid but not tight.", C: "That is a single MAX-HEAPIFY call.", D: "Each sift-down costs at most the node's height." },
    difficulty: "easy", subtype: "complexity", source_quote: "" },
];
const BANK = [{ prompt: "What is the running time of BUILD-MAX-HEAP on the array of n elements, as CLRS proves?", img: "", options: ["a", "b", "c", "d"], topic: "Module 2 (Sorting and Order Statistics)" }];
const NOW = Date.UTC(2026, 10, 5, 17, 0, 0);

const fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (url === QGEN.anthropicUrl) {
    return { ok: true, status: 200, json: async () => ({ model: body.model, content: [{ type: "text", text: JSON.stringify({ questions: DRAFTS }) }], usage: { input_tokens: 5000, output_tokens: 3000 } }) };
  }
  const solve = body.text.format.name === "solve";
  const value = !solve ? { issues: [] } : body.input.includes("⟨4, 1, 3, 2, 16⟩")
    ? { choice: "B", confidence: "medium", ambiguous: false, reason: "The root keeps 4 because MAX-HEAPIFY only moves keys down." }
    : { choice: "A", confidence: "high", ambiguous: false, reason: "The sum of node heights is linear." };
  return { ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }], usage: { input_tokens: 300, output_tokens: 90 } }) };
};

/** @return {!Promise<!Object>} The runDraft result for module 2, two questions, quota 2 of 50 used. */
export function fixtureResult() {
  const deps = { now: () => NOW, fetch, apiKey: () => "k", openaiKey: () => "o", isHost: async () => true,
    setQuestions: async () => [], bankQuestions: async () => BANK, reserveDrafts: async ({ n }) => ({ ok: true, used: n }),
    refundDrafts: async () => {}, log: async () => {} };
  return runDraft({ uid: "H", data: { module: "Module 2 (Sorting and Order Statistics)", count: 2, setId: "set2" }, deps });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await fixtureResult(), null, 1));
