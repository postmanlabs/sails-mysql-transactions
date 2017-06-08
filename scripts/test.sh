#!/usr/bin/env bash

set -e;

# location of integration test server
INTEGRATION_APP_DIR=tests/integration/app;

# function to be called on exit
# and ensure cleanup is called before the script exits
function cleanup {
    pushd "${INTEGRATION_APP_DIR}" > /dev/null;
    npm stop;
    popd > /dev/null;
}

trap cleanup EXIT;

# ===========================================================
echo "Starting integration test server...";
pushd "${INTEGRATION_APP_DIR}" > /dev/null;

if [ "${CI}" = true ]; then
    echo
    echo "travis_fold:start:integration.npm.install";
fi;
if [ ! -d 'node_modules' ]; then
	npm install -d;
else
	if [ -d 'node_modules/sails-mysql-transactions' ]; then
		rm -rf 'node_modules/sails-mysql-transactions';
	fi
	npm run postinstall;
fi
if [ "${CI}" = true ]; then
    echo
    echo "travis_fold:end:integration.npm.install";
fi;

npm start;
popd > /dev/null;
# ===========================================================

# Do other tests while giving time for server to start
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

# ===========================================================
echo
echo "Running integration tests...";

# execute newman
# server should be up and running on localhost:1337
newman run https://www.getpostman.com/collections/273a69585877f3d2b67a \
       -e tests/integration/sails-transactions-experiment.postman_environment;

# ===========================================================
