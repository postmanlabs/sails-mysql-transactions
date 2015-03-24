#!/usr/bin/env bash

set -e;

APP_DIR=tests/integration/app;

# Start server
# ============
pushd "${APP_DIR}" > /dev/null;

if [ ! -d 'node_modules' ]; then
	npm install -d;
else
	if [ -d 'node_modules/sails-mysql-transactions' ]; then
		rm -rf 'node_modules/sails-mysql-transactions';
	fi
	npm run postinstall;
fi

npm start;
SLEEP 5;
popd > /dev/null;

# Begin Test
# ==========

newman -c tests/integration/sanity.json.postman_collection -e tests/integration/sails-transactions-experiment.postman_environment


# Stop Server
# ===========

pushd "${APP_DIR}" > /dev/null;

SLEEP 2;
npm stop;

popd > /dev/null;