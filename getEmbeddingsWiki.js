import pgPromise from "pg-promise";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const allowFetch = true;
const OPENAI_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 10;

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Initialize the OpenAI client using the official package.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to split an array into batches.
function chunkArray(array, size) {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

async function processChunk(chunk) {
    // console.log(`Generating embedding for wiki page chunk id ${chunk.id}`);
    const response = await openai.embeddings.create({
        model: OPENAI_MODEL,
        input: chunk.chunk_text,
    });
    if (
        !response.data ||
        !response.data[0] ||
        !response.data[0].embedding
    ) {
        throw new Error(`Embedding generation failed for wiki page chunk id ${chunk.id}`);
    }
    // console.log(`Generated embedding for wiki page chunk id ${chunk.id}`);

    // Immediately insert the embedding into the database.
    await db.none(
        "INSERT INTO wiki_page_chunk_embedding (wiki_page_chunk_id, embedding_source, embedding_model, embedding_vector) VALUES ($1, $2, $3, $4::vector)",
        [chunk.id, "openai", OPENAI_MODEL, response.data[0].embedding]
    );
    // console.log(`Inserted embedding for wiki page chunk id ${chunk.id} into the database.`);
}

async function main() {
    try {
        // 1. Retrieve all wiki page chunks that are missing an embedding for the given model.
        const chunks = await db.any(
            `SELECT wpc.id, wpc.chunk_text
             FROM wiki_page_chunk wpc
             WHERE NOT EXISTS (
                SELECT 1 FROM wiki_page_chunk_embedding wpce
                WHERE wpce.wiki_page_chunk_id = wpc.id AND wpce.embedding_model = $1
             )`,
            [OPENAI_MODEL]
        );

        if (chunks.length === 0) {
            console.log("All wiki page chunks already have embeddings.");
            process.exit(0);
        }

        console.log(`Found ${chunks.length} wiki page chunks missing embeddings.`);

        if (!allowFetch) {
            console.error("Some wiki page chunks are missing embeddings and allowFetch is false. Exiting.");
            process.exit(1);
        }

        // 2. Process the chunks in batches.
        const batches = chunkArray(chunks, BATCH_SIZE);
        for (const [batchIndex, batch] of batches.entries()) {
            console.log(`Processing batch ${batchIndex + 1} of ${batches.length} with ${batch.length} chunks...`);
            await Promise.all(batch.map(chunk => processChunk(chunk)));
        }

        console.log("All missing embeddings have been generated and inserted into the database.");
    } catch (error) {
        console.error("Error processing wiki page chunks:", error);
        process.exit(1);
    } finally {
        pgp.end();
    }
}

main();
