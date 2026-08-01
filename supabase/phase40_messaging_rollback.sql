-- ============================================================
-- PHASE 40 ROLLBACK — Messaging removed
-- The Messages feature (MessagesPage.jsx, message_threads/messages
-- tables, phase40_messaging.sql) has been removed from the app as
-- unneeded. This drops the schema it left behind.
--
-- Run in Supabase SQL Editor. THIS DELETES ALL EXISTING MESSAGE DATA —
-- back up the `messages` table first if you want to keep a copy.
-- ============================================================

-- Dropping the table also removes it from supabase_realtime automatically.
drop table if exists public.messages;
drop table if exists public.message_threads;
