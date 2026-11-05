/**
 * @fileoverview Preloaded into the Functions emulator (NODE_OPTIONS=--import) so calls to the Anthropic API (and, when
 * FAKE_OPENAI_URL is set, the OpenAI API) reach the test's fake endpoint instead. Inert unless FAKE_ANTHROPIC_URL is
 * set; never loaded in production.
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
const target = process.env.FAKE_ANTHROPIC_URL;
const openaiTarget = process.env.FAKE_OPENAI_URL;
if (target) {
  const realFetch = globalThis.fetch;
  const route = (url) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/")) return target;
    return openaiTarget && u.startsWith("https://api.openai.com/") ? openaiTarget : url;
  };
  globalThis.fetch = (url, init) => realFetch(route(url), init);
}
