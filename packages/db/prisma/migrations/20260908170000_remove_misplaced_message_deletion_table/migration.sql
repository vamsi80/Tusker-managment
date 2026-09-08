-- The preceding unqualified migration can resolve against `boq` on the direct
-- Supabase connection. The application model is explicitly in `public`; this
-- duplicate was verified empty before this cleanup migration was created.
DROP TABLE IF EXISTS "boq"."DirectMessageDeletion";
