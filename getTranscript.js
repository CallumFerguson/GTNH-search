import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/postgres');

const allowFetch = false;

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

function validateTranscriptFormat(data) {
    // Check if the input is an array.
    if (!Array.isArray(data)) {
        return false;
    }

    // Loop over each item in the array.
    for (const item of data) {
        // Ensure the item is an object.
        if (typeof item !== 'object' || item === null) {
            return false;
        }

        // Validate that the required properties exist and have the correct types.
        if (
            typeof item.duration !== 'number' ||
            typeof item.start !== 'number' ||
            typeof item.text !== 'string'
        ) {
            return false;
        }
    }

    // All checks passed.
    return true;
}

async function main() {
    const videoId = 'ojyN4kTeU_o';

    // Check if the video exists in the database.
    const videoRecord = await db.oneOrNone('SELECT id FROM video WHERE video_id = $1', [videoId]);
    if (!videoRecord) {
        console.error(`Video ${videoId} not found in the database.`);
        process.exit(1);
    }

    // Check if a transcript already exists for this video.
    let transcriptRecord = await db.oneOrNone(
        'SELECT id, transcript FROM transcript WHERE video_id = $1',
        [videoRecord.id]
    );

    if (!transcriptRecord) {
        if (!allowFetch) {
            console.log('Transcript not found in database. but allowFetch is false');
            process.exit(1);
        }
        console.log('Transcript not found in database. Fetching transcript...');
        const transcript = await getTranscript(videoId);
        if (!validateTranscriptFormat(transcript)) {
            console.error("Transcript format is invalid.");
            process.exit(1);
        }
        // Insert the new transcript into the database.
        await db.none(
            'INSERT INTO transcript (video_id, transcript) VALUES ($1, $2:json)',
            [videoRecord.id, transcript]
        );
        transcriptRecord = { transcript };
        console.log('Transcript fetched and stored in the database.');
    } else {
        console.log('Transcript already exists in the database.');
    }

    // Log transcript details.
    const transcriptData = transcriptRecord.transcript;
    console.log("Transcript segment count:", transcriptData.length);
    console.log("First segment:", transcriptData[0]);

    pgp.end();
}

main();
