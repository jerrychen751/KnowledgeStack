-- Runs after 01_schema.sql: GRANT SELECT ON ALL TABLES only reaches tables that already exist.
-- This local fixture password is not for a deployed environment.

CREATE ROLE agent_readonly LOGIN PASSWORD 'agent_readonly_local';

-- current_database() keeps this file independent of the POSTGRES_DB value in .env.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO agent_readonly', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO agent_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_readonly;

-- The role can change these defaults during a session.
-- The table grants above enforce read-only table access.
ALTER ROLE agent_readonly SET default_transaction_read_only = on;
ALTER ROLE agent_readonly SET statement_timeout = '60s';
