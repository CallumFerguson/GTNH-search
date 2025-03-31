import fs from 'fs';
import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

const allowFetch = true;

async function getTranscript(videoId) {
    try {
        const response = await fetch(`http://localhost:5000/transcript?video_id=${videoId}`);
        if (!response.ok) {
            throw new Error(`Error: ${response.status} ${response.statusText}`);
        }
        const transcript = await response.json();
        return transcript;
    } catch (error) {
        console.error('Failed to fetch transcript:', error.message);
        process.exit(1);
    }
}

function validateResponse(data) {
    if (!("snippets" in data)) {
        return false;
    }

    const snippets = data.snippets;

    // Check if the input is an array.
    if (!Array.isArray(snippets)) {
        return false;
    }

    // Validate each item in the array.
    for (const item of snippets) {
        if (typeof item !== 'object' || item === null) {
            return false;
        }
        if (
            typeof item.duration !== 'number' ||
            typeof item.start !== 'number' ||
            typeof item.text !== 'string'
        ) {
            return false;
        }
    }
    return true;
}

async function main() {
    // Retrieve all videos that are related to GTNH, are not live streams, and lack a transcript.
    // const videos = await db.any(`
    //     SELECT v.id, v.video_id
    //     FROM video v
    //     LEFT JOIN transcript t ON v.id = t.video_id
    //     WHERE v.related_to_GTNH = true AND v.live_stream = false AND t.id IS NULL
    // `);

    const channelName = 'AverageGregTechPlayer';

    const videos = await db.any(`
        SELECT v.*
        FROM video v
        JOIN channel c ON c.id = v.channel_id
        LEFT JOIN transcript t ON t.video_id = v.id
        WHERE c.channel_name = $1
            AND v.related_to_GTNH = true
            AND v.live_stream = false
            AND t.id IS NULL;
    `, [channelName]);


    if (videos.length === 0) {
        console.log("No videos found that require transcript fetching.");
        process.exit(0);
    }

    console.log(`Found ${videos.length} videos that require transcripts to be fetched.`);

    // const batchSize = 5;
    // const videosSlice = videos.slice(0, batchSize);
    // console.log(`getting the transcripts for the first ${batchSize} vidoes`);

    for (const videoRecord of videos) {
        if (!allowFetch) {
            console.log(`Transcript not found for video ${videoRecord.video_id}, but allowFetch is false.`);
            process.exit(1);
        }

        console.log(`Transcript not found for video ${videoRecord.video_id}. Fetching transcript...`);
        const response = await getTranscript(videoRecord.video_id);
        if (!validateResponse(response)) {
            fs.writeFileSync("failed_transcript.txt", JSON.stringify(response));
            console.log(response);
            console.error(`Transcript format is invalid for video ${videoRecord.video_id}.`);
            process.exit(1);
        }
        const raw_transcript = response.snippets;
        await db.none(
            'INSERT INTO transcript (video_id, raw_transcript) VALUES ($1, $2:json)',
            [videoRecord.id, raw_transcript]
        );
        console.log(`Transcript fetched and stored in the database for video ${videoRecord.video_id}.`);
        console.log("Transcript segment count:", raw_transcript.length);
        console.log("First segment:", raw_transcript[0]);
    }

    pgp.end();
}

main();
