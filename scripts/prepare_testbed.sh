#!/usr/bin/env bash

set -e;

pushd tests/integration/app;
# ensure installation has been run once for the testbed app
[ -d node_modules ] && [ -d node_modules/sails ] && [ -d node_modules/sails-mysql-transactions ] || npm install;

# symlink codebase
pushd node_modules/sails-mysql-transactions;
if [ -d lib ] && [ ! -L lib ]; then
	[ ! -d _lib ] && mv lib _lib;
	[ -d lib ] && rm -rf lib;
fi
[ ! -L lib ] && ln -fs ../../../../../lib;
popd;

# symlink waterline submodule
pushd node_modules/sails/node_modules;
if [ -d waterline ] && [ ! -L waterline ]; then
	[ ! -d _waterline ] && mv waterline _waterline;
	[ -d waterline ] && rm -rf waterline;
fi
[ ! -L waterline ] && ln -fs ../../../../../../waterline;
popd;

popd;