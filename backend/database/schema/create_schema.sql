 /*
 * file: create_schema.sql
 * description: Create schemas for the database.
 * This script creates the necessary schemas.
 * It includes schemas for authentication, metadata, raw data, 
 * clean data, reference data, and analytics.
 * Date: 26-06-2025
*/

-- 1. é¦–å…ˆç¡®ä¿�postgresè§’è‰²å­˜åœ¨å¹¶è®¾ç½®æ­£ç¡®çš„å¯†ç �
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD 'password123';
        RAISE NOTICE 'âœ… Created postgres user with superuser privileges';
    ELSE
        -- æ›´æ–°çŽ°æœ‰postgresè§’è‰²çš„å¯†ç �å’Œæ�ƒé™�
        ALTER ROLE postgres WITH LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD 'password123';
        RAISE NOTICE 'âœ… Updated postgres user attributes and password';
    END IF;
END $$;

-- 2. å�¯ç”¨å¿…è¦�çš„æ‰©å±•
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 3. åˆ›å»ºæ‰€æœ‰å¿…è¦�çš„schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS metadata;
CREATE SCHEMA IF NOT EXISTS raw_data;
CREATE SCHEMA IF NOT EXISTS clean_data;
CREATE SCHEMA IF NOT EXISTS reference;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS payments;
