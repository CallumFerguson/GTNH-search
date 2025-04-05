import dotenv from "dotenv";
import pgPromise from "pg-promise";

dotenv.config();

// Initialize pg-promise
const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Optional: Print chunks for a wiki page record.
async function printChunks(wikiPageRecord) {
    const chunks = await db.any(
        "SELECT chunk_text, chunk_index FROM wiki_page_chunk WHERE wiki_page_id = $1",
        [wikiPageRecord.id]
    );
    for (const chunk of chunks) {
        console.log("chunk:");
        console.log(chunk.chunk_text);
        console.log(`Wiki page: ${wikiPageRecord.title} - Chunk index: ${chunk.chunk_index}\n`);
    }
}

async function main() {
    // Query for all wiki pages that do not yet have any chunks made with basic-1 method
    const pagesToProcess = await db.any(
        `SELECT *
         FROM wiki_page
         WHERE NOT EXISTS (
             SELECT 1
             FROM wiki_page_chunk
             WHERE wiki_page_chunk.wiki_page_id = wiki_page.id
               AND wiki_page_chunk.chunking_method = 'basic-1'
         )
         ORDER BY id`
    );

    if (!pagesToProcess || pagesToProcess.length === 0) {
        console.log("No wiki pages found that require chunking.");
        process.exit(0);
    }

    console.log(`Found ${pagesToProcess.length} wiki pages that require chunking.`);

    // Define the chunking parameters: total characters per chunk and overlap count.
    const CHUNK_SIZE = 1000;
    const OVERLAP = 250;
    const STEP = CHUNK_SIZE - OVERLAP;

    for (const record of pagesToProcess) {
        try {
            console.log(`\nProcessing wiki page: ${record.title} (ID: ${record.id})`);

            // Verify that content is a string
            if (typeof record.content !== "string") {
                console.error("Content is not a string for wiki page:", record.title);
                continue;
            }

            const content = record.content;
            const chunks = [];
            let index = 0;
            let chunkIndex = 0;

            // Create overlapping chunks from the content string
            while (index < content.length) {
                const chunkText = content.slice(index, index + CHUNK_SIZE);
                chunks.push({ text: chunkText, chunk_index: chunkIndex });
                chunkIndex++;
                index += STEP;
            }

            // Insert each chunk into the wiki_page_chunk table in a transaction
            await db.tx(async (t) => {
                for (const chunk of chunks) {
                    await t.none(
                        "INSERT INTO wiki_page_chunk (wiki_page_id, chunk_text, chunk_index, chunking_method) VALUES ($1, $2, $3, $4)",
                        [record.id, chunk.text, chunk.chunk_index, "basic-1"]
                    );
                }
            });

            console.log("Chunks inserted successfully for wiki page:", record.title);
            // Uncomment the following line if you want to print the chunks
            // await printChunks(record);
        } catch (error) {
            console.error("Error processing wiki page", record.title, ":", error);
        }
    }

    pgp.end();
}

main().catch((error) => {
    console.error("Error occurred:", error);
    process.exit(1);
});
