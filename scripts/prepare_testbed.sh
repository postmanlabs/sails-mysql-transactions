#!/usr/bin/env bash

set -e;

pushd tests/integration/app;
# ensure installation has been run once for the testbed app
[ -d node_modules ] && [ -d node_modules/sails ] && [ -d node_modules/sails-mysql-transactions ] || npm install;

# symlink codebase
pushd node_modules/sails-mysql-transactions;
[ -d lib ] && [ ! -L lib ] && [ ! -d _lib ] && mv lib _lib;
[ ! -L lib ] && ln -fs ../../../../../lib;
popd;

# symlink waterline submodule
pushd node_modules/sails/node_modules;
[ -d waterline ] && [ ! -L waterline ] && [ ! -d _waterline ] && mv waterline _waterline;
[ ! -L waterline ] && ln -fs ../../../../../../waterline;
popd;

popd;