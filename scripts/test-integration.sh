#!/usr/bin/env bash

set -e;

pushd tests/integration/app > /dev/null;

if [ ! -d 'node_modules' ]; then
	npm install -d;
else
	if [ -d 'node_modules/sails-mysql-transactions' ]; then
		rm -rf 'node_modules/sails-mysql-transactions';
	fi
	npm install ../../../;
fi

node app.js;

popd > /dev/null;