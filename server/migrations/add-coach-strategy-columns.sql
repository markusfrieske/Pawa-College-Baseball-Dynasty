-- Migration: Add strategy columns to coaches table
-- Applied: 2026-05-23 via direct SQL (columns already exist in database)
-- Task: #420 Commissioner sim shortcuts + Coach Strategy system

ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS roster_strategy TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS recruiting_geography_strategy TEXT NOT NULL DEFAULT 'national',
  ADD COLUMN IF NOT EXISTS recruiting_style_strategy TEXT NOT NULL DEFAULT 'best_available',
  ADD COLUMN IF NOT EXISTS game_philosophy_strategy TEXT NOT NULL DEFAULT 'balanced';
