#!/usr/bin/env bash

set -e;

# get into the integration app
pushd tests/integration/app;

npm install .;
rm -rf node_modules/sails-mysql-transactions;
rm -rf node_modules/sails/node_modules/waterline;

popd;

# create symlinks
ln -s "$PWD" "$PWD/tests/integration/app/node_modules/sails-mysql-transactions";
ln -s "$PWD/waterline" "$PWD/tests/integration/app/node_modules/sails/node_modules/waterline";