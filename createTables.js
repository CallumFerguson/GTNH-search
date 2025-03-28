import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp({
  user: 'postgres',      // replace with your database username
  host: 'localhost',     // replace with your database host
  database: 'postgres',  // replace with your database name
  password: 'password',  // replace with your database password
  port: 5432,            // replace with your database port if different
});

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
  title VARCHAR(255)
);
`;

// the transcript JSONB is the unedited transcript in the form:
/*
[
  {
    text: 'example text',
    start: 0.16,
    duration: 4.719
  },
  {
    text: 'example text',
    start: 5.72,
    duration: 3.526
  },
  ...
]
*/
const transcript = `
CREATE TABLE IF NOT EXISTS transcript (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES video(id),
  raw_transcript JSONB
);
`;

// transcript chunks are useful bits of information that can be embedded and searched in a vector database. The chunks can be things like facts, tips and tricks, etc.
// chunks are extracted from the transcript by an LLM
const transcript_chunk = `
CREATE TABLE IF NOT EXISTS transcript_chunk (
  id SERIAL PRIMARY KEY,
  transcript_id INTEGER NOT NULL REFERENCES transcript(id),
  chunk_text TEXT
);
`;

// most of the time each transcript_chunk will have just one chunk_embedding, but there could be multiple if multiple different embedding models were tested
const chunk_embedding = `
CREATE TABLE IF NOT EXISTS chunk_embedding (
  id SERIAL PRIMARY KEY,
  chunk_id INTEGER NOT NULL REFERENCES transcript_chunk(id),
  embedding_source VARCHAR(255),
  embedding_model VARCHAR(255),
  embedding_vector vector(1536)
);
`;

const createTables = async () => {
  try {
    // Create channel table
    await db.none(channel);
    console.log('Created table: channel');

    // Create video table
    await db.none(video);
    console.log('Created table: video');

    // Create transcript table
    await db.none(transcript);
    console.log('Created table: transcript');

    // Create transcript_chunk table
    await db.none(transcript_chunk);
    console.log('Created table: transcript_chunk');

    // Create chunk_embedding table
    await db.none(chunk_embedding);
    console.log('Created table: chunk_embedding');

  } catch (err) {
    console.error('Error creating tables:', err);
  } finally {
    pgp.end();
    console.log('Disconnected from the database.');
  }
};

createTables();
