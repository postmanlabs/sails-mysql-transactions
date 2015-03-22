#!/usr/bin/env bash

set -e;

echo "jscs v`jscs --version`";
jscs lib;

echo;

jshint --version;
jshint lib;
echo "No code lint issues found.";