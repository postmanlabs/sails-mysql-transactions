#!/usr/bin/env bash

set -e;

pushd tests/integration > /dev/null;

if [ ! -d 'node_modules' ]; then
	npm install;
else
	if [ -d 'node_modules/sails-mysql-transactions' ]; then
		rm -rf 'node_modules/sails-mysql-transactions';
	fi
	npm install ../../;
fi

node app.js;

popd > /dev/null;