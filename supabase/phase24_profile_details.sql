-- Phase 24: Extended profile details (contact, location, physical, equipment)
-- Run this in Supabase SQL Editor AFTER phase23_profile_gender.sql
--
-- Backs the redesigned "grand" profile page — adds the fields shown in the
-- read-only profile view (phone/location/physical attributes/equipment bag)
-- that user_profiles never had a place to store.

alter table public.user_profiles
  add column if not exists phone         text,
  add column if not exists home_court    text,
  add column if not exists nationality   text,
  add column if not exists country       text,
  add column if not exists city          text,
  add column if not exists region        text,
  add column if not exists postal_code   text,
  add column if not exists height        text,   -- free text, e.g. 5'11" or 180 cm
  add column if not exists plays         text,   -- 'R' | 'L'
  add column if not exists backhand      text,   -- '1H' | '2H'

  add column if not exists racquet_brand text,
  add column if not exists racquet_name  text,
  add column if not exists racquet_year  integer,
  add column if not exists string_brand  text,
  add column if not exists string_name   text,
  add column if not exists string_tension text,  -- free text, e.g. 52 lbs
  add column if not exists shoe_brand    text,
  add column if not exists shoe_name     text,
  add column if not exists bag_brand     text,
  add column if not exists bag_name      text,
  add column if not exists grip_brand    text,
  add column if not exists grip_name     text;
