#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -e .env ]; then
    admin=$(openssl rand -hex 32)
    app=$(openssl rand -hex 32)
    (umask 077; set -C; printf 'ADMIN_DB_PASSWORD=%s\nDB_PASSWORD=%s\n' "$admin" "$app" > .env)
fi
docker compose up -d --build web worker
printf '%s\n' 'Откройте http://localhost:8080'
