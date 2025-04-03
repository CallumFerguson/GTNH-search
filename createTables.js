import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp({
  user: 'postgres',      // replace with your database username
  host: 'localhost',     // replace with your database host
  database: 'postgres',  // replace with your database name
  password: 'password',  // replace with your database password
  port: 5432,            // replace with your database port if different
});

// Initial table creation queries
const channel = `
CREATE TABLE IF NOT EXISTS channel (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) UNIQUE NOT NULL,
  channel_name VARCHAR(255),
  channel_url VARCHAR(255)
);
`;

const video = `
CREATE TABLE IF NOT EXISTS video (
  id SERIAL PRIMARY KEY,
  video_id VARCHAR(255) UNIQUE NOT NULL,
  channel_id INTEGER NOT NULL REFERENCES channel(id),
  title VARCHAR(255),
  related_to_GTNH BOOLEAN,
  live_stream BOOLEAN,
  published_at TIMESTAMPTZ,
  has_subtitles BOOLEAN
);
`;

const transcript = `
CREATE TABLE IF NOT EXISTS transcript (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES video(id),
  raw_transcript JSONB
);
`;

const transcript_chunk = `
CREATE TABLE IF NOT EXISTS transcript_chunk (
  id SERIAL PRIMARY KEY,
  transcript_id INTEGER NOT NULL REFERENCES transcript(id),
  chunk_text TEXT,
  line_number INTEGER NOT NULL DEFAULT 0,
  chunking_method VARCHAR(255),
  video_timestamp INTEGER
);
`;

const chunk_embedding = `
CREATE TABLE IF NOT EXISTS chunk_embedding (
  id SERIAL PRIMARY KEY,
  chunk_id INTEGER NOT NULL REFERENCES transcript_chunk(id),
  embedding_source VARCHAR(255),
  embedding_model VARCHAR(255),
  embedding_vector vector(1536)
);
`;

// New table for caching query embeddings
const query_embedding = `
CREATE TABLE IF NOT EXISTS query_embedding (
  id SERIAL PRIMARY KEY,
  query_text TEXT UNIQUE NOT NULL,
  embedding_source VARCHAR(255),
  embedding_model VARCHAR(255),
  embedding_vector vector(1536),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`;

// Function to create initial tables
const createTables = async () => {
  try {
    await db.none(channel);
    console.log('Created table if not exists: channel');

    await db.none(video);
    console.log('Created table if not exists: video');

    await db.none(transcript);
    console.log('Created table if not exists: transcript');

    await db.none(transcript_chunk);
    console.log('Created table if not exists: transcript_chunk');

    await db.none(chunk_embedding);
    console.log('Created table if not exists: chunk_embedding');

    await db.none(query_embedding);
    console.log('Created table if not exists: query_embedding');
  } catch (err) {
    console.error('Error creating tables:', err);
    throw err;
  }
};

// Basic migration runner
const runMigrations = async () => {
  try {
    // Create the migrations tracking table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Ensured migrations table exists.');

    // Define your migrations here
    const migrations = [
      {
        name: 'add-related_to_GTNH-to-video',
        sql: `ALTER TABLE video ADD COLUMN IF NOT EXISTS related_to_GTNH BOOLEAN;`
      },
      {
        name: 'update-line_number-to-transcript_chunk',
        sql: `
          ALTER TABLE transcript_chunk ADD COLUMN IF NOT EXISTS line_number INTEGER;
          ALTER TABLE transcript_chunk ALTER COLUMN line_number SET DEFAULT 0;
          UPDATE transcript_chunk SET line_number = 0 WHERE line_number IS NULL;
          ALTER TABLE transcript_chunk ALTER COLUMN line_number SET NOT NULL;
        `
      },
      {
        name: 'add-live_stream-to-video',
        sql: `ALTER TABLE video ADD COLUMN IF NOT EXISTS live_stream BOOLEAN;`
      },
      {
        name: 'add-published_at-to-video',
        sql: `ALTER TABLE video ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;`
      },
      {
        name: 'add-has_subtitles-to-video',
        sql: `ALTER TABLE video ADD COLUMN IF NOT EXISTS has_subtitles BOOLEAN;`
      },
      {
        name: 'add-chunking_method-to-transcript_chunk',
        sql: `ALTER TABLE transcript_chunk ADD COLUMN IF NOT EXISTS chunking_method VARCHAR(255);`
      },
      {
        name: 'add-video_timestamp-to-transcript_chunk',
        sql: `ALTER TABLE transcript_chunk ADD COLUMN IF NOT EXISTS video_timestamp INTEGER;`
      }
    ];

    // Run each migration if it hasn't been applied yet
    for (const migration of migrations) {
      const applied = await db.oneOrNone(
        'SELECT id FROM migrations WHERE name = $1',
        [migration.name]
      );

      if (!applied) {
        console.log(`Applying migration: ${migration.name}`);
        await db.none(migration.sql);
        await db.none('INSERT INTO migrations(name) VALUES($1)', [migration.name]);
        console.log(`Migration applied: ${migration.name}`);
      } else {
        console.log(`Migration already applied: ${migration.name}`);
      }
    }
  } catch (err) {
    console.error('Error during migrations:', err);
    throw err;
  }
};

// Main function to create tables and run migrations
const run = async () => {
  try {
    await createTables();
    await runMigrations();
  } catch (err) {
    console.error('Error in run:', err);
  } finally {
    pgp.end();
    console.log('Disconnected from the database.');
  }
};

run();
