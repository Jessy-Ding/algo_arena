/**
 * @fileoverview Real Firebase app SDK for the emulator oracles; refuses any project id that is not a demo- project.
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
import * as M from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

/**
 * Guard so a test page can never reach a real Firebase project.
 *
 * @param {!Object} cfg
 * @param {string=} name
 * @return {!Object} The FirebaseApp.
 * @throws {!Error} If cfg.projectId does not start with "demo-".
 */
export function initializeApp(cfg, name) {
  if (!String(cfg.projectId || "").startsWith("demo-")) throw new Error("emulator oracle refuses project " + cfg.projectId);
  return M.initializeApp(cfg, name);
}
