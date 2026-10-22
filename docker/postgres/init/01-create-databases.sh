#!/bin/sh
# Runs once, on an empty data volume. POSTGRES_DB creates the workspace
# database; GoTrue gets its own, with the `auth` schema it expects to exist.
set -e

GOTRUE_DB="${GOTRUE_DB_NAME:-gotrue}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    create database "${GOTRUE_DB}";
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$GOTRUE_DB" <<-EOSQL
    create schema if not exists auth authorization "${POSTGRES_USER}";
EOSQL
