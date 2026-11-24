-- Türkçe katlanmış arama metni üzerinde trigram araması için (BR-80, DATABASE_SCHEMA §4.4).
-- pg_trgm Neon'da desteklenir ve "trusted" bir extension'dır.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
