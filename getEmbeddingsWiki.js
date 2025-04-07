import pgPromise from "pg-promise";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const allowFetch = true;
const OPENAI_MODEL = "text-embedding-3-small";
// Update batch size to 100 embeddings per API request.
const BATCH_SIZE = 100;

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Initialize OpenAI client
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

// Process a batch of chunks sequentially using one OpenAI API request.
async function processBatch(batch) {
    console.log(`Generating embeddings for ${batch.length} wiki page chunks...`);
    // Include the title along with the chunk text in the input.
    const inputs = batch.map((chunk) => `${chunk.title}: ${chunk.chunk_text}`);

    const response = await openai.embeddings.create({
        model: OPENAI_MODEL,
        input: inputs,
    });

    // Validate that we have an embedding for each input.
    if (!response.data || response.data.length !== batch.length) {
        throw new Error(
            `Expected ${batch.length} embeddings, but received ${response.data ? response.data.length : 0}`
        );
    }

    // Iterate over the batch and insert each embedding into the database.
    for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        const embeddingData = response.data[i];
        if (!embeddingData || !embeddingData.embedding) {
            throw new Error(`Embedding generation failed for wiki page chunk id ${chunk.id}`);
        }

        await db.none(
            "INSERT INTO wiki_page_chunk_embedding (wiki_page_chunk_id, embedding_source, embedding_model, embedding_vector) VALUES ($1, $2, $3, $4::vector)",
            [chunk.id, "openai", OPENAI_MODEL, embeddingData.embedding]
        );
        console.log(`Inserted embedding for wiki page chunk id ${chunk.id}.`);
    }
}

async function main() {
    try {
        // Retrieve all wiki page chunks missing embeddings and include the page title by joining with wiki_page.
        const chunks = await db.any(
            `SELECT wpc.id, wpc.chunk_text, wp.title
       FROM wiki_page_chunk wpc
       JOIN wiki_page wp ON wpc.wiki_page_id = wp.id
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

        // Split the chunks into batches (each with up to BATCH_SIZE entries).
        const batches = chunkArray(chunks, BATCH_SIZE);

        // Process each batch sequentially (one API call per batch).
        for (const [batchIndex, batch] of batches.entries()) {
            console.log(`Processing batch ${batchIndex + 1} of ${batches.length}...`);
            await processBatch(batch);
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
