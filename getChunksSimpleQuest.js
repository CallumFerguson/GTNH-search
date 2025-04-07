import dotenv from "dotenv";
import pgPromise from "pg-promise";

dotenv.config();

// Initialize pg-promise
const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Optional: Print chunks for a quest record.
async function printChunks(questRecord) {
    const chunks = await db.any(
        "SELECT chunk_text, chunk_index FROM quest_chunk WHERE quest_id = $1",
        [questRecord.id]
    );
    for (const chunk of chunks) {
        console.log("chunk:");
        console.log(chunk.chunk_text);
        console.log(`Quest: ${questRecord.title} - Chunk index: ${chunk.chunk_index}\n`);
    }
}

async function main() {
    // Query for all quests that have a non-empty description and do not yet have any chunks made with basic-1 method
    const questsToProcess = await db.any(
        `SELECT *
         FROM quest
         WHERE description IS NOT NULL 
           AND description <> ''
           AND NOT EXISTS (
             SELECT 1
             FROM quest_chunk
             WHERE quest_chunk.quest_id = quest.id
               AND quest_chunk.chunking_method = 'basic-1'
         )
         ORDER BY id`
    );

    if (!questsToProcess || questsToProcess.length === 0) {
        console.log("No quests found that require chunking.");
        process.exit(0);
    }

    console.log(`Found ${questsToProcess.length} quests that require chunking.`);

    // Define the chunking parameters: total characters per chunk and overlap count.
    const CHUNK_SIZE = 1000;
    const OVERLAP = 250;
    const STEP = CHUNK_SIZE - OVERLAP;

    for (const record of questsToProcess) {
        try {
            console.log(`\nProcessing quest: ${record.title} (ID: ${record.id})`);

            // Verify that description is a string
            if (typeof record.description !== "string") {
                console.error("Description is not a string for quest:", record.title);
                continue;
            }

            const content = record.description;
            const chunks = [];
            let index = 0;
            let chunkIndex = 0;

            // Create overlapping chunks from the description string
            while (index < content.length) {
                const chunkText = content.slice(index, index + CHUNK_SIZE);
                chunks.push({ text: chunkText, chunk_index: chunkIndex });
                chunkIndex++;
                index += STEP;
            }

            // Insert each chunk into the quest_chunk table in a transaction
            await db.tx(async (t) => {
                for (const chunk of chunks) {
                    await t.none(
                        "INSERT INTO quest_chunk (quest_id, chunk_text, chunk_index, chunking_method) VALUES ($1, $2, $3, $4)",
                        [record.id, chunk.text, chunk.chunk_index, "basic-1"]
                    );
                }
            });

            console.log("Chunks inserted successfully for quest:", record.title);
            // Uncomment the following line if you want to print the chunks
            // await printChunks(record);
        } catch (error) {
            console.error("Error processing quest", record.title, ":", error);
        }
    }

    pgp.end();
}

main().catch((error) => {
    console.error("Error occurred:", error);
    process.exit(1);
});
