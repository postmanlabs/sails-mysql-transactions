#!/usr/bin/env bash

INFO="sails-mysql-transactions:"; # for console logs

MOD_DIR="../../";

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
if [ ! -d "../../node_modules/sails" ] && [ ! -d "../../node_modules/waterline" ]; then
    echo -e "\033[1;31m";
    echo "${INFO} Sails and waterline installation not found!";
    echo "${INFO} Ensure your package.json, which has sails-mysql-transaction, also includes sails.";
    echo -e "\033[0m\n";
    exit 1;
fi

if [ ! -d "../../node_modules/waterline" ] && [ -d "../../node_modules/sails-mysql" ]; then
    echo -e "\033[1;31m";
    echo "${INFO} WARNING - detected sails-mysql.";
    echo "${INFO} You may face unexpected behaviour.";
    echo "${INFO} Preferably remove sails-mysql from packages before using this in production.";
    echo -e "\033[0m\n";
fi


if [ -d "../../node_modules/waterline" ]; then
    echo "${INFO} Injecting waterline into sails...";
    pushd "../../" > /dev/null;
    npm remove waterline;
    npm install "node_modules/sails-mysql-transactions/waterline";
    popd > /dev/null;
    
    echo
    echo "${INFO} Installation successful.";
    echo
    exit 0;
fi

if [ -d "../../node_modules/sails" ]; then
    echo "${INFO} Injecting waterline into sails...";
    pushd "../../node_modules/sails" > /dev/null;
    npm remove waterline;
    npm install "../sails-mysql-transactions/waterline";
    popd > /dev/null;
    
    echo
    echo "${INFO} Installation successful.";
    echo
    exit 0;
fi
