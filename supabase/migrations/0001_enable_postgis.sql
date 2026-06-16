-- 0001_enable_postgis.sql
-- Foundation (build order step 1): enable the PostGIS extension so later
-- migrations can use geography(Point) columns and run "posts near me" /
-- notification-radius distance queries (PRD §6.4, §7).
--
-- Run via the Supabase CLI (`supabase db push`) or paste into the Supabase
-- dashboard SQL editor. Tables, indexes, and RLS policies arrive in step 2.

create extension if not exists postgis with schema extensions;
