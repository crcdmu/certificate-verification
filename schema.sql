-- ==============================================================================
-- Certificate Verification Portal - Database Schema & Security Functions
-- Campus Recruitment & Placement Cell (CR&PC), Dhanamanjuri University
-- ==============================================================================

-- 1. Certificates Table
CREATE TABLE IF NOT EXISTS public.certificates (
    id TEXT PRIMARY KEY,                 -- PBKDF2-SHA-256 derived hash (hex)
    name TEXT NOT NULL,                  -- Candidate full name
    programme TEXT NOT NULL,             -- Training / Internship programme
    issued_on TEXT NOT NULL,             -- Issue date string (e.g. 'June 2026')
    status TEXT NOT NULL DEFAULT 'Valid' -- 'Valid', 'Revoked', 'Expired', etc.
);

-- 2. Lightweight Keep-Alive Ping Function
-- Used by /api/keep-alive to ping the database without querying sensitive tables
CREATE OR REPLACE FUNCTION public.ping()
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$ 
  SELECT now(); 
$$;

GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;

-- 3. Secure Atomic Certificate Lookup by Hash
-- Returns at most 1 certificate matching the exact PBKDF2 hash.
-- Prevents bulk enumeration or direct SELECT * table dumps by public anon role.
CREATE OR REPLACE FUNCTION public.get_certificate_by_hash(p_hash text)
RETURNS TABLE (
    name text,
    programme text,
    issued_on text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT c.name, c.programme, c.issued_on, c.status
    FROM public.certificates c
    WHERE c.id = p_hash
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_certificate_by_hash(text) TO anon, authenticated;

-- 4. Rate Limiting Table & Atomic Increment RPC
CREATE TABLE IF NOT EXISTS public.rate_limits (
    ip TEXT PRIMARY KEY,
    count INT NOT NULL DEFAULT 1,
    first_request TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
    client_ip TEXT, 
    max_reqs INT, 
    window_seconds INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    now_ts TIMESTAMPTZ := now();
    time_diff INTERVAL;
BEGIN
    -- Opportunistic cleanup: purge stale IP records older than 1 hour to prevent table bloat
    DELETE FROM public.rate_limits WHERE first_request < (now_ts - INTERVAL '1 hour');

    -- Atomic row lock to serialize concurrent queries for the same client_ip
    SELECT * INTO rec FROM public.rate_limits WHERE ip = client_ip FOR UPDATE;

    IF rec IS NULL THEN
        INSERT INTO public.rate_limits (ip, count, first_request)
        VALUES (client_ip, 1, now_ts)
        ON CONFLICT (ip) DO UPDATE
        SET count = public.rate_limits.count + 1
        RETURNING * INTO rec;

        IF rec.count > 1 THEN
            -- Row was concurrently inserted; evaluate against existing count
            time_diff := now_ts - rec.first_request;
            IF time_diff > (window_seconds || ' seconds')::INTERVAL THEN
                UPDATE public.rate_limits 
                SET count = 1, first_request = now_ts 
                WHERE ip = client_ip;
                RETURN json_build_object('allowed', true, 'remaining', max_reqs - 1);
            ELSE
                IF rec.count > max_reqs THEN
                    RETURN json_build_object('allowed', false, 'remaining', 0);
                ELSE
                    RETURN json_build_object('allowed', true, 'remaining', max_reqs - rec.count);
                END IF;
            END IF;
        ELSE
            RETURN json_build_object('allowed', true, 'remaining', max_reqs - 1);
        END IF;
    ELSE
        time_diff := now_ts - rec.first_request;
        IF time_diff > (window_seconds || ' seconds')::INTERVAL THEN
            UPDATE public.rate_limits 
            SET count = 1, first_request = now_ts 
            WHERE ip = client_ip;
            RETURN json_build_object('allowed', true, 'remaining', max_reqs - 1);
        ELSE
            IF rec.count >= max_reqs THEN
                RETURN json_build_object('allowed', false, 'remaining', 0);
            ELSE
                UPDATE public.rate_limits 
                SET count = count + 1 
                WHERE ip = client_ip;
                RETURN json_build_object('allowed', true, 'remaining', max_reqs - (rec.count + 1));
            END IF;
        END IF;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, int, int) TO anon, authenticated;

-- 5. Row Level Security (RLS) Configuration
-- Lock down direct public table reading. All client lookups must go through get_certificate_by_hash().
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Revoke direct table access from public anon role
REVOKE ALL ON TABLE public.certificates FROM anon;
REVOKE ALL ON TABLE public.rate_limits FROM anon;

-- Ensure execute permissions on security definer RPC functions
GRANT EXECUTE ON FUNCTION public.get_certificate_by_hash(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, int, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ping() TO anon, authenticated;
