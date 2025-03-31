import OpenAI from "openai";
import dotenv from "dotenv";
import pgPromise from "pg-promise";
// import * as fs from 'fs'

dotenv.config();

const allowFetch = false;

// Define the video id to process
const videoId = 'N_0ay7YLcdI';

// Initialize pg-promise
const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Initialize the OpenAI client
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function printChunks(transcriptRecord) {
    const chunks = await db.any(
        "SELECT chunk_text, line_number FROM transcript_chunk WHERE transcript_id = $1",
        [transcriptRecord.id]
    );
    for (const chunk of chunks) {
        console.log("chunk:")
        console.log(chunk.chunk_text);
        const start = transcriptRecord.raw_transcript[chunk.line_number].start;
        console.log(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}\n`);
    }

}

async function main() {
    // Check if the video exists in the database
    const videoRecord = await db.oneOrNone(
        "SELECT id, video_id, title FROM video WHERE video_id = $1",
        [videoId]
    );
    if (!videoRecord) {
        console.error("Video not found in the database");
        process.exit(1);
    }

    console.log(`video with id ${videoId} exists in database`);
    console.log(`title: ${videoRecord.title}`);

    // Check if there's at least one transcript for this video (get the latest one)
    const transcriptRecord = await db.oneOrNone(
        "SELECT id, raw_transcript FROM transcript WHERE video_id = $1 ORDER BY id DESC LIMIT 1",
        [videoRecord.id]
    );
    if (!transcriptRecord) {
        console.error("Transcript not found for the video");
        process.exit(1);
    }

    console.log("video has transcript");

    // Check if the transcript already has chunks; if so, retrieve them from the database and exit early
    const existingChunks = await db.any(
        "SELECT chunk_text FROM transcript_chunk WHERE transcript_id = $1",
        [transcriptRecord.id]
    );
    if (existingChunks && existingChunks.length > 0) {
        console.log("Transcript already has chunks:");
        await printChunks(transcriptRecord);
        process.exit(0);
    }

    // Verify that raw_transcript is in the expected format and extract the text
    const transcriptArray = transcriptRecord.raw_transcript;
    if (!Array.isArray(transcriptArray)) {
        console.error("Transcript is not in the expected format");
        process.exit(1);
    }
    // Combine all text segments into one transcript string
    const videoTranscript = transcriptArray
        .map((item, index) => `${index + 1}: ${item.text}`)
        .join("\n");


    // Use the video title from the video record (or fallback to an empty string)
    const videoTitle = videoRecord.title || "";

    //     const prompt = `I’m trying to make an app where users can ask questions about the minecraft modpack gregtech new horizons (GTNH). A lot of the best information about GTNH is found in youtube videos. I’m making a vector database that uses the transcripts of videos. The problem is the transcripts are often from long lets play style videos, and are not very information dense. Your job is to look at the video transcript, and create chunks of data from it. These chunks should contain useful bits of information about GTNH that can be embedded and searched in a vector database. The chunks can be things like facts, tips and tricks, details about how to automate a machine, the best way to do certain things in GTNH, etc. The chunks should be things you learned about GTNH from watching the video, not a summary of the video.

    // Format the chunks of data as a json array where each item is just a string, not an object. Only return the json, do not include any additional text in your response.

    // The title of the video is “${videoTitle}”

    // And here is the video transcript:

    // ${videoTranscript}`;

    const prompt = `I’m building an app that allows users to ask questions about the Minecraft modpack Gregtech New Horizons (GTNH). Many of the best insights about GTNH come from YouTube videos. I’m creating a vector database by embedding information from video transcripts, but these transcripts are often lengthy and filled with casual commentary.

Your task is to analyze the provided video transcript and extract concise, self-contained informational chunks specifically related to GTNH. These chunks should include actionable tips, technical details, and key facts—such as how to automate a machine, effective strategies, or other useful gameplay insights. Do not simply summarize the video; instead, extract discrete pieces of information.

Each chunk should also link back to the relavent part of the transcript with a line number. This line number will be used to create a youtube link with a timestamp so the users of the app can go directly to the part in a video where the information came from.

Guidelines:
- Each chunk should be clear and self-contained.
- Limit each chunk to no more than 150 words.
- Ignore filler content, off-topic chatter, or generic commentary.
- Return the chunks as a JSON array of objects like this [{"text": "chunk text", "line": 25}]
- Only output the JSON array, with no additional text.

Video Title: “${videoTitle}”

Video transcript with line numbers:
${videoTranscript}`;

    // fs.writeFileSync("prompt.txt", prompt);

    if (!allowFetch) {
        console.log("transcript needs chunks, but allowFetch is false");
        process.exit(1);
    }

    console.log("generating chunks...");

    // Request completion from OpenAI
    const completion = await client.chat.completions.create({
        model: 'o3-mini',
        messages: [{ role: 'user', content: prompt }],
    });

    const result = completion.choices[0].message.content;

    // Validate that the result is valid JSON and in the expected format:
    // An array of objects with properties "text" (a string) and "line" (a number)
    let chunks;
    try {
        chunks = JSON.parse(result);
    } catch (err) {
        console.error("Invalid JSON returned from LLM");
        console.log(result);
        process.exit(1);
    }

    if (
        !Array.isArray(chunks) ||
        !chunks.every(chunk =>
            chunk &&
            typeof chunk === 'object' &&
            !Array.isArray(chunk) &&
            typeof chunk.text === 'string' &&
            typeof chunk.line === 'number'
        )
    ) {
        console.error("JSON format is incorrect: expected an array of objects with properties 'text' (string) and 'line' (number)");
        console.log(chunks);
        process.exit(1);
    }

    // Insert each chunk into the transcript_chunk table
    await db.tx(async t => {
        for (const chunk of chunks) {
            await t.none(
                "INSERT INTO transcript_chunk (transcript_id, chunk_text, line_number) VALUES ($1, $2, $3)",
                [transcriptRecord.id, chunk.text, chunk.line]
            );
        }
    });

    console.log("Chunks inserted successfully.");

    await printChunks(transcriptRecord);

    pgp.end();
}

main().catch(error => {
    console.error("Error occurred:", error);
    process.exit(1);
});
