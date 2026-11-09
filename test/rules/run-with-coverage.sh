#!/usr/bin/env bash
#
# Runs the Firestore rules tests on the emulator, saves the rules coverage after each test file, and checks it.
#
# Author: Yikang (Richard) Liu, M.S. Candidate in Computer Science, Khoury College of Computer Sciences,
#     Northeastern University
# Version: 1.0
# Created: October 29, 2026 · San Francisco, California, USA
#
# License: This project is licensed under the MIT License — see LICENSE.md for details.
# Copyright © 2026 Yikang (Richard) Liu.
#
# Run inside: firebase emulators:exec --only firestore --project demo-algoarena "bash test/rules/run-with-coverage.sh"
# Each test file calls initializeTestEnvironment, which reloads the rules and resets the emulator's coverage counters,
# so coverage is saved after each file and merged by verify/rules/coverage_check.py.
set -euo pipefail
cd "$(dirname "$0")"
COV="http://127.0.0.1:8080/emulator/v1/projects/demo-algoarena:ruleCoverage"
for f in rules properties; do
  node --test "$f.test.mjs"
  curl -sf "$COV" -o "rules-coverage-$f.json"
  curl -sf "$COV.html" -o "rules-coverage-$f.html"
done
python3 -I ../../verify/rules/coverage_check.py ../../firestore.rules rules-coverage-rules.json rules-coverage-properties.json
echo "rules coverage reports written to test/rules/rules-coverage-*.{json,html}"
