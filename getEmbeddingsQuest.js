import pgPromise from "pg-promise";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const allowFetch = true;
const OPENAI_MODEL = "text-embedding-3-small";
// Set the batch size to 100 so each OpenAI request gets up to 100 embeddings.
const BATCH_SIZE = 100;

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

/**
 * Processes a single batch of chunks.
 * A single API call generates embeddings for all texts in the batch.
 */
async function processBatch(batch) {
    // Combine quest title and chunk text so that each input includes the quest title.
    const texts = batch.map(chunk => `${chunk.quest_title}: ${chunk.chunk_text}`);

    // Generate embeddings for the batch in one request.
    const response = await openai.embeddings.create({
        model: OPENAI_MODEL,
        input: texts,
    });

    // Check that the response is complete and contains the expected number of embeddings.
    if (!response.data || response.data.length !== texts.length) {
        throw new Error(
            `Embedding generation failed: expected ${texts.length} embeddings, but received ${response.data ? response.data.length : 0}`
        );
    }

    // For each embedding in the response, insert it into the database.
    for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        const embedding = response.data[i].embedding;

        // Insert the embedding into the quest_chunk_embedding table.
        await db.none(
            "INSERT INTO quest_chunk_embedding (quest_chunk_id, embedding_source, embedding_model, embedding_vector) VALUES ($1, $2, $3, $4::vector)",
            [chunk.id, "openai", OPENAI_MODEL, embedding]
        );
    }
}

async function main() {
    try {
        // Retrieve all quest chunks missing an embedding for the given model.
        // Note the join with the quest table to also retrieve the quest title.
        const chunks = await db.any(
            `SELECT qc.id, qc.chunk_text, q.title AS quest_title
             FROM quest_chunk qc
             JOIN quest q ON qc.quest_id = q.id
             WHERE NOT EXISTS (
               SELECT 1 FROM quest_chunk_embedding qce
               WHERE qce.quest_chunk_id = qc.id AND qce.embedding_model = $1
             )`,
            [OPENAI_MODEL]
        );

        if (chunks.length === 0) {
            console.log("All quest chunks already have embeddings.");
            process.exit(0);
        }

        console.log(`Found ${chunks.length} quest chunks missing embeddings.`);

        if (!allowFetch) {
            console.error("Some quest chunks are missing embeddings and allowFetch is false. Exiting.");
            process.exit(1);
        }

        // Split the chunks into batches of 100.
        const batches = chunkArray(chunks, BATCH_SIZE);
        // Process each batch sequentially
        for (let i = 0; i < batches.length; i++) {
            console.log(`Processing batch ${i + 1} of ${batches.length} with ${batches[i].length} chunks...`);
            await processBatch(batches[i]);
        }

        console.log("All missing embeddings have been generated and inserted into the database.");
    } catch (error) {
        console.error("Error processing quest chunks:", error);
        process.exit(1);
    } finally {
        pgp.end();
    }
}

main();
