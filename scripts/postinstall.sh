#!/usr/bin/env bash

INFO="sails-mysql-transactions:"; # for console logs

SAILS_DIR="../../node_modules/sails";
TRANS_DIR="../../node_modules/sails-mysql-transactions";

set -e;

# If this is an NPM installation, we do not expect `.gitmodules` in the directory
# since it is ignored by `.npmignore`. This is a fairly robust check to test whether
# this script has been run as part of npm install or as part of self install.
if [ -f ".gitmodules" ]; then
    echo "${INFO} Not an NPM install, exiting waterline injection.";
    exit 0;
fi;

# Check whether sails has been already installed or not. If not, this is an
# error and we should not proceed.
if [ ! -d "${SAILS_DIR}" ]; then
    echo "${INFO} Sails installation not found!";
    echo "${INFO} Ensure your package.json, which has sails-mysql-transaction, also includes sails.";
    exit 1;
fi

echo "${INFO} Injecting waterline...";

pushd "${SAILS_DIR}" > /dev/null;
npm remove waterline;
npm install "${TRANS_DIR}/waterline";
popd > /dev/null;

echo
echo "${INFO} Installation successful.";
echo