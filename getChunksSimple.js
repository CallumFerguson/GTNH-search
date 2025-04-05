import dotenv from "dotenv";
import pgPromise from "pg-promise";

dotenv.config();

// Initialize pg-promise
const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Print chunks for a transcript record using its transcript_id and raw_transcript.
// Note: Since the transcript was split with 1-indexed line numbers,
// we subtract 1 when indexing the transcript array.
async function printChunks(transcriptRecord) {
    const chunks = await db.any(
        "SELECT chunk_text, video_timestamp FROM transcript_chunk WHERE transcript_id = $1",
        [transcriptRecord.transcript_id]
    );
    for (const chunk of chunks) {
        console.log("chunk:");
        console.log(chunk.chunk_text);
        // Adjust the index since line numbers are 1-indexed.
        // const transcriptLine = transcriptRecord.raw_transcript[chunk.line_number - 1];
        // const start = transcriptLine?.start || 0;
        console.log(`https://www.youtube.com/watch?v=${transcriptRecord.video_id}&t=${chunk.video_timestamp}\n`);
    }
}

async function main() {
    // Query for all videos that have a transcript (using the transcript table)
    // and where the transcript does not yet have any chunks made with basic-1 method
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
             SELECT 1 
             FROM transcript_chunk tc 
             WHERE tc.transcript_id = t.id 
               AND tc.chunking_method = 'basic-1'
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

            // Create overlapping chunks from the transcript
            const raw_transcript = record.raw_transcript;
            const transcriptWordsWithTimeStamps = [];
            for (let i = 0; i < raw_transcript.length; i++) {
                const words = raw_transcript[i].text.split(" ");
                for (let n = 0; n < words.length; n++) {
                    transcriptWordsWithTimeStamps.push({ word: words[n], timestamp: Math.floor(raw_transcript[i].start) });
                }
            }

            const SEGMENT_SIZE = 250;
            const OVERLAP = 50;
            const STEP = SEGMENT_SIZE - OVERLAP;

            const chunks = [];
            for (let i = 0; i < transcriptWordsWithTimeStamps.length; i += STEP) {
                const chunksPieces = transcriptWordsWithTimeStamps.slice(i, i + SEGMENT_SIZE);
                if (chunksPieces.length === 0) break;
                chunks.push({ text: chunksPieces.map(value => value.word).join(" "), timestamp: chunksPieces[0].timestamp });
            }

            // Insert each chunk into the transcript_chunk table in a transaction
            await db.tx(async (t) => {
                for (const chunk of chunks) {
                    await t.none(
                        "INSERT INTO transcript_chunk (transcript_id, chunk_text, line_number, chunking_method, video_timestamp) VALUES ($1, $2, $3, $4, $5)",
                        [record.transcript_id, chunk.text, 0, "basic-1", chunk.timestamp]
                    );
                }
            });

            console.log("Chunks inserted successfully.");
            // await printChunks({ ...record, transcript_id: record.transcript_id });
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
