#!/usr/bin/env bash

INFO="sails-mysql-transactions:"; # for console logs

MOD_DIR="../../node_modules";

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
if [ ! -d "${MOD_DIR}/sails" ]; then
    echo -e "\033[1;31m";
    echo "${INFO} Sails installation not found!";
    echo "${INFO} Ensure your package.json, which has sails-mysql-transaction, also includes sails.";
    echo -e "\033[0m\n";
    exit 1;
fi

if [ -d "${MOD_DIR}/sails-mysql" ]; then
    echo -e "\033[1;31m";
    echo "${INFO} WARNING - detected sails-mysql.";
    echo "${INFO} You may face unexpected behaviour.";
    echo "${INFO} Preferably remove sails-mysql from packages before using this in production.";
    echo -e "\033[0m\n";
fi

echo "${INFO} Injecting waterline...";

pushd "${MOD_DIR}" > /dev/null;
if [ ! -d "waterline" ]; then
    pushd "sails" > /dev/null;
    npm remove waterline;
    npm install "${MOD_DIR}/sails-mysql-transactions/waterline";
    popd > /dev/null;
else
    npm remove waterline;
    npm install "${MOD_DIR}/sails-mysql-transactions/waterline";    
fi
popd > /dev/null;

echo
echo "${INFO} Installation successful.";
echo
