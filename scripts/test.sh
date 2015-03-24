#!/usr/bin/env bash

set -e;

echo "jscs v`jscs --version`";
jscs lib tests/unit;

echo;

jshint --version;
jshint lib tests/unit;
echo "No code lint issues found.";

echo
echo "Running unit tests..."
echo "mocha v`mocha --version`";

mocha tests/unit/**/*-spec.js

echo
echo "Running integration tests...";

./scripts/test-integration.sh;