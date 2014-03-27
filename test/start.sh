#!/bin/sh

CWD=$(pwd)
PATH='../node_modules/.bin':$PATH
TESTDIR=$(dirname $0)
cd $TESTDIR
mocha -A ./functional 
mocha ./unit
TESTRES=$?
cd $CWD
exit $TESTRES
