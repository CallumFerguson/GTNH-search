import pgPromise from 'pg-promise';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const allowFetch = true;
const OPENAI_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100;  // Updated to 100 embeddings per API request.

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Helper function to split an array into batches.
function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

async function processBatch(batch) {
    console.log(`Generating embeddings for batch with chunk ids: [${batch.map(chunk => chunk.id).join(', ')}]`);

    // For each chunk, combine the video title with the transcript chunk text.
    const inputs = batch.map(chunk => `${chunk.title}: ${chunk.chunk_text}`);

    // Make a single API request for the entire batch.
    const response = await openai.embeddings.create({
        model: OPENAI_MODEL,
        input: inputs,
    });

    // Verify that the response contains the expected number of embeddings.
    if (!response.data || response.data.length !== batch.length) {
        throw new Error(`Embedding generation failed: expected ${batch.length} embeddings but received ${response.data ? response.data.length : 0}`);
    }

    console.log(`Generated embeddings for batch with chunk ids: [${batch.map(chunk => chunk.id).join(', ')}]`);

    // Insert each embedding into the database sequentially.
    for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        const embedding = response.data[i].embedding;
        if (!embedding) {
            throw new Error(`No embedding returned for chunk id ${chunk.id}`);
        }
        await db.none(
            'INSERT INTO chunk_embedding (chunk_id, embedding_source, embedding_model, embedding_vector) VALUES ($1, $2, $3, $4::vector)',
            [chunk.id, 'openai', OPENAI_MODEL, embedding]
        );
        console.log(`Inserted embedding for chunk id ${chunk.id} into the database.`);
    }
}

async function main() {
    try {
        // Retrieve transcript chunks missing embeddings and include the video title.
        const chunks = await db.any(
            `SELECT tc.id, tc.chunk_text, v.title
             FROM transcript_chunk tc
             JOIN transcript t ON t.id = tc.transcript_id
             JOIN video v ON v.id = t.video_id
             WHERE NOT EXISTS (
                SELECT 1 FROM chunk_embedding ce
                WHERE ce.chunk_id = tc.id AND ce.embedding_model = $1
             )`,
            [OPENAI_MODEL]
        );

        if (chunks.length === 0) {
            console.log('All transcript chunks already have embeddings.');
            process.exit(0);
        }

        console.log(`Found ${chunks.length} transcript chunks missing embeddings.`);

        if (!allowFetch) {
            console.error('Some transcript chunks are missing embeddings and allowFetch is false. Exiting.');
            process.exit(1);
        }

        // Process the chunks in batches sequentially.
        const batches = chunkArray(chunks, BATCH_SIZE);
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`Processing batch ${batchIndex + 1} of ${batches.length} with ${batch.length} chunks...`);
            await processBatch(batch);
        }

        console.log('All missing embeddings have been generated and inserted into the database.');
    } catch (error) {
        console.error('Error processing transcript chunks:', error);
        process.exit(1);
    } finally {
        pgp.end();
    }
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

main();
