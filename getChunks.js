import OpenAI from "openai";
import dotenv from "dotenv";
import pgPromise from "pg-promise";

dotenv.config();

const allowFetch = true;

// Initialize pg-promise
const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Initialize the OpenAI client
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Print chunks for a transcript record using its transcript_id and raw_transcript.
// Note: Since the transcript was split with 1-indexed line numbers,
// we subtract 1 when indexing the transcript array.
async function printChunks(transcriptRecord) {
    const chunks = await db.any(
        "SELECT chunk_text, line_number FROM transcript_chunk WHERE transcript_id = $1",
        [transcriptRecord.transcript_id]
    );
    for (const chunk of chunks) {
        console.log("chunk:");
        console.log(chunk.chunk_text);
        // Adjust the index since line numbers are 1-indexed.
        const transcriptLine = transcriptRecord.raw_transcript[chunk.line_number - 1];
        const start = transcriptLine?.start || 0;
        console.log(`https://www.youtube.com/watch?v=${transcriptRecord.video_id}&t=${Math.floor(start)}\n`);
    }
}

async function main() {
    // Query for all videos that have a transcript (using the transcript table)
    // and where the transcript does not yet have any chunks.
    const videosToProcess = await db.any(
        `SELECT 
        v.id AS video_pk, 
        v.video_id, 
        v.title, 
        t.id AS transcript_id, 
        t.raw_transcript 
     FROM video v
     JOIN transcript t ON t.video_id = v.id
     WHERE NOT EXISTS (
         SELECT 1 FROM transcript_chunk tc WHERE tc.transcript_id = t.id
     )
     ORDER BY v.id`
    );

    if (!videosToProcess || videosToProcess.length === 0) {
        console.log("No videos found that require chunking.");
        process.exit(0);
    }

    console.log(`Found ${videosToProcess.length} videos that have transcripts but no chunks.`);

    for (const record of videosToProcess) {
        try {
            console.log(`\nProcessing video: ${record.video_id}`);
            console.log(`Title: ${record.title}`);

            // Verify that raw_transcript is in the expected format (an array)
            if (!Array.isArray(record.raw_transcript)) {
                console.error("Transcript is not in the expected format for video", record.video_id);
                process.exit(1);
            }

            // Build a transcript string with line numbers (lines are 1-indexed)
            const videoTranscript = record.raw_transcript
                .map((item, index) => `${index + 1}: ${item.text}`)
                .join("\n");

            const videoTitle = record.title || "";

            // Build the prompt to generate chunks
            const prompt = `I’m building an app that allows users to ask questions about the Minecraft modpack Gregtech New Horizons (GTNH). Many of the best insights about GTNH come from YouTube videos. I’m creating a vector database by embedding information from video transcripts, but these transcripts are often lengthy and filled with casual commentary.

Your task is to analyze the provided video transcript and extract concise, self-contained informational chunks specifically related to GTNH. These chunks should include actionable tips, technical details, and key facts—such as how to automate a machine, effective strategies, or other useful gameplay insights. Do not simply summarize the video; instead, extract discrete pieces of information.

Each chunk should also link back to the relevant part of the transcript with a line number. This line number will be used to create a YouTube link with a timestamp so the users of the app can go directly to the part in a video where the information came from.

Guidelines:
- Each chunk should be clear and self-contained.
- Limit each chunk to no more than 150 words.
- Ignore filler content, off-topic chatter, or generic commentary.
- Return the chunks as a JSON array of objects like this [{"text": "chunk text", "line": 25}]
- Only output the JSON array, with no additional text.

Video Title: “${videoTitle}”

Video transcript with line numbers:
${videoTranscript}`;

            if (!allowFetch) {
                console.log("Transcript needs chunks, but allowFetch is false");
                process.exit(0);
            }

            console.log("Generating chunks...");

            // Request completion from OpenAI
            const completion = await client.chat.completions.create({
                model: "o3-mini",
                messages: [{ role: "user", content: prompt }],
            });

            const result = completion.choices[0].message.content;

            // Validate that the result is valid JSON in the expected format
            let chunks;
            try {
                chunks = JSON.parse(result);
            } catch (err) {
                console.error("Invalid JSON returned from LLM for video", record.video_id);
                console.log(result);
                process.exit(1);
            }

            if (
                !Array.isArray(chunks) ||
                !chunks.every(
                    (chunk) =>
                        chunk &&
                        typeof chunk === "object" &&
                        !Array.isArray(chunk) &&
                        typeof chunk.text === "string" &&
                        typeof chunk.line === "number"
                )
            ) {
                console.error(
                    "JSON format is incorrect for video",
                    record.video_id,
                    ": expected an array of objects with properties 'text' (string) and 'line' (number)"
                );
                console.log(chunks);
                process.exit(1);
            }

            // Insert each chunk into the transcript_chunk table in a transaction
            await db.tx(async (t) => {
                for (const chunk of chunks) {
                    await t.none(
                        "INSERT INTO transcript_chunk (transcript_id, chunk_text, line_number) VALUES ($1, $2, $3)",
                        [record.transcript_id, chunk.text, chunk.line]
                    );
                }
            });

            console.log("Chunks inserted successfully.");
            await printChunks({ ...record, transcript_id: record.transcript_id });
        } catch (error) {
            console.error("Error processing video", record.video_id, ":", error);
            process.exit(1);
        }
    }

    pgp.end();
}

main().catch((error) => {
    console.error("Error occurred:", error);
    process.exit(1);
});
