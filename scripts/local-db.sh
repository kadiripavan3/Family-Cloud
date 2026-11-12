#!/usr/bin/env bash
# Creates Homeport's databases on a PostgreSQL you run yourself (instead of the Docker one).
# Usage: ./scripts/local-db.sh            (uses: psql postgres)
#        PSQL="sudo -u postgres psql" ./scripts/local-db.sh      (Linux, where PostgreSQL has its own user)
set -euo pipefail
PSQL="${PSQL:-psql postgres}"

# Text is sorted the way English sorts it ("cusco" next to "Cusco"), as on the Docker database and in CI, also
# where the server's own default is the bare "C" order (many Linux installs). A test that passes here then
# passes there.
ENGLISH=""
if [ "$($PSQL -Atc "select count(*) from pg_collation where collname = 'en-US-x-icu'" 2>/dev/null || echo 0)" = "1" ]; then
  ENGLISH=" template template0 locale_provider icu icu_locale 'en-US'"
fi

$PSQL -v ON_ERROR_STOP=1 -v english="$ENGLISH" <<'SQL'
do $$ begin
  if not exists (select from pg_roles where rolname = 'homeport') then
    create role homeport login password 'homeport' createdb;
  end if;
end $$;
select 'create database homeport owner homeport' || :'english' where not exists (select from pg_database where datname = 'homeport') \gexec
select 'create database homeport_test owner homeport' || :'english' where not exists (select from pg_database where datname = 'homeport_test') \gexec
SQL
echo "Databases 'homeport' and 'homeport_test' are ready (user: homeport, password: homeport)."
