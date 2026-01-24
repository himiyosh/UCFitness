
import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('No DATABASE_URL or POSTGRES_URL found in .env.local');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Supabase requires SSL, usually
});

async function runMigration() {
    console.log('Connecting to database...');
    const client = await pool.connect();

    try {
        const migrationPath = path.resolve(process.cwd(), 'migrations/009_seed_title_badges.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Executing migration 009...');
        await client.query(sql);
        console.log('Migration executed successfully!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
