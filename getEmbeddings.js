import pgPromise from 'pg-promise';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const allowFetch = false;

const videoId = 'N_0ay7YLcdI';

const OPENAI_MODEL = 'text-embedding-3-small';

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Initialize the OpenAI client using the official package.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
    try {
        // 1. Verify that the video exists.
        const video = await db.oneOrNone(
            'SELECT id, title FROM video WHERE video_id = $1',
            [videoId]
        );
        if (!video) {
            console.error(`Video with id "${videoId}" not found.`);
            process.exit(1);
        }
        console.log(`Video found: id ${video.id}, title "${video.title}"`);

        // 2. Check that a transcript exists for this video.
        const transcript = await db.oneOrNone(
            'SELECT id FROM transcript WHERE video_id = $1',
            [video.id]
        );
        if (!transcript) {
            console.error(`Transcript for video "${videoId}" not found.`);
            process.exit(1);
        }
        console.log(`Transcript found for video id ${video.id}`);

        // 3. Retrieve transcript chunks.
        const chunks = await db.any(
            'SELECT id, chunk_text FROM transcript_chunk WHERE transcript_id = $1',
            [transcript.id]
        );
        if (chunks.length === 0) {
            console.error(`No transcript chunks found for video "${videoId}".`);
            process.exit(1);
        }
        console.log(`Found ${chunks.length} transcript chunks for video id ${video.id}`);

        // 4. Check for existing embeddings for each chunk.
        const chunkIds = chunks.map(chunk => chunk.id);
        const existingEmbeddings = await db.any(
            'SELECT chunk_id, embedding_vector FROM chunk_embedding WHERE chunk_id IN ($1:csv) AND embedding_model = $2',
            [chunkIds, OPENAI_MODEL]
        );
        console.log(`Found ${existingEmbeddings.length} existing embeddings for the chunks.`);
        // Map of chunk_id to embedding vector.
        const embeddingsMap = new Map();
        for (const row of existingEmbeddings) {
            let parsedEmbedding;
            if (typeof row.embedding_vector === 'string') {
                // Convert string representation to an array of numbers.
                parsedEmbedding = row.embedding_vector
                    .replace(/[\[\]]/g, '')
                    .split(',')
                    .map(Number);
            } else {
                parsedEmbedding = row.embedding_vector;
            }
            embeddingsMap.set(row.chunk_id, parsedEmbedding);
        }

        // Determine which chunks are missing embeddings.
        const chunksToFetch = chunks.filter(chunk => !embeddingsMap.has(chunk.id));
        if (chunksToFetch.length > 0) {
            console.log(`${chunksToFetch.length} chunks are missing embeddings.`);
        } else {
            console.log(`All chunks already have embeddings.`);
        }

        if (chunksToFetch.length > 0 && !allowFetch) {
            console.error('Some chunks are missing embeddings and allowFetch is false. Exiting.');
            process.exit(1);
        }

        // 5. For chunks missing embeddings, generate embeddings concurrently.
        let generatedEmbeddings = [];
        if (chunksToFetch.length > 0) {
            console.log(`Generating embeddings for missing chunks...`);
            try {
                generatedEmbeddings = await Promise.all(
                    chunksToFetch.map(async (chunk) => {
                        console.log(`Generating embedding for chunk id ${chunk.id}`);
                        const response = await openai.embeddings.create({
                            model: OPENAI_MODEL,
                            input: chunk.chunk_text,
                        });
                        if (
                            !response.data ||
                            !response.data[0] ||
                            !response.data[0].embedding
                        ) {
                            throw new Error(`Embedding generation failed for chunk id ${chunk.id}`);
                        }
                        console.log(`Generated embedding for chunk id ${chunk.id}`);
                        return { chunkId: chunk.id, embedding: response.data[0].embedding };
                    })
                );
            } catch (err) {
                console.error('Error generating embeddings:', err);
                process.exit(1);
            }
            console.log(`Generated embeddings for all missing chunks.`);
        }

        // 6. Insert newly generated embeddings in a transaction only if all succeed.
        if (generatedEmbeddings.length > 0) {
            console.log(`Inserting generated embeddings into the database...`);
            await db.tx(async t => {
                for (const item of generatedEmbeddings) {
                    await t.none(
                        'INSERT INTO chunk_embedding (chunk_id, embedding_source, embedding_model, embedding_vector) VALUES ($1, $2, $3, $4::vector)',
                        [item.chunkId, 'openai', OPENAI_MODEL, item.embedding]
                    );
                    // Update our embeddings map.
                    embeddingsMap.set(item.chunkId, item.embedding);
                }
            });
            console.log(`Inserted generated embeddings into the database successfully.`);
        }

        // 7. Print all embeddings.
        console.log('Final embeddings:');
        console.log(`number of embeddings: ${chunks.length}`);
        console.log("first embedding:");
        const embedding = embeddingsMap.get(chunks[0].id);
        console.log(`${JSON.stringify(embedding).substring(0, 50)}...`);
    } catch (error) {
        console.error('Error processing video:', error);
        process.exit(1);
    } finally {
        pgp.end();
    }
}

main();
