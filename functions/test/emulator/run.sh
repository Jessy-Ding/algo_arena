#!/usr/bin/env bash
# Runs coach.emulator.test.mjs and qgen.emulator.test.mjs against the Auth, Firestore and Functions emulators.
#
# Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
#     Northeastern University
# Version: 1.0
# Created: October 29, 2026 · San Francisco, California, USA
#
# License: This project is licensed under the MIT License — see LICENSE.md for details.
# Copyright © 2026 Yikang (Richard) Liu.
set -euo pipefail
cd "$(dirname "$0")/../../.."
# The emulator reads secrets from functions/.secret.local. It gets a fake key for the run and is removed afterwards;
# an existing file may hold a real key, so it is never overwritten.
if [ -e functions/.secret.local ]; then echo "functions/.secret.local exists; move it away first." >&2; exit 1; fi
printf 'ANTHROPIC_API_KEY=sk-emulator-fake\nOPENAI_API_KEY=sk-emulator-fake\n' > functions/.secret.local
# iCloud Drive (this folder is under Desktop) can leave conflict copies such as ".secret 2.local"; remove those too.
trap 'rm -f functions/.secret.local functions/.secret\ *.local' EXIT
# A file URL, because the repository path contains a space and NODE_OPTIONS splits on spaces.
preload="file://$(pwd | sed 's/ /%20/g')/functions/test/emulator/fake-anthropic-preload.mjs"
FAKE_ANTHROPIC_URL=http://127.0.0.1:8799/v1/messages FAKE_OPENAI_URL=http://127.0.0.1:8799/v1/responses NODE_OPTIONS="--import=$preload" \
  firebase emulators:exec --only auth,firestore,functions --project demo-algoarena \
  "node --test --test-concurrency=1 functions/test/emulator/coach.emulator.test.mjs functions/test/emulator/qgen.emulator.test.mjs"
