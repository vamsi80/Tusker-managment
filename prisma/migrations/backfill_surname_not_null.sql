-- Backfill: for every user without a surname, take the first word of their name column.
-- SPLIT_PART('John Doe', ' ', 1) → 'John'
-- SPLIT_PART('Alice', ' ', 1) → 'Alice'  (single-word name stays as-is)
UPDATE "User"
SET surname = SPLIT_PART(name, ' ', 1)
WHERE surname IS NULL OR TRIM(surname) = '';

-- Now that every row has a value, make the column mandatory.
ALTER TABLE "User"
ALTER COLUMN surname SET NOT NULL;
