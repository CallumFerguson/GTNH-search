import pgPromise from 'pg-promise';
import { google } from 'googleapis';
import fs from "fs"

const pgp = pgPromise();
const db = pgp({
    user: 'postgres',      // replace with your database username
    host: 'localhost',     // replace with your database host
    database: 'postgres',  // replace with your database name
    password: 'password',  // replace with your database password
    port: 5432,            // replace with your database port if different
});

/**
 * Retrieve all videos where live_stream is null.
 */
async function getVideosWithNullLiveStream() {
    try {
        return await db.any('SELECT * FROM video WHERE live_stream IS NULL');
    } catch (error) {
        console.error('Error fetching videos:', error);
        throw error;
    }
}

/**
 * Update the live_stream field for a given video.
 * @param {string} videoId - The video_id from the video table.
 * @param {boolean} isLive - The boolean value to update.
 */
async function updateVideoLiveStream(videoId, isLive) {
    try {
        await db.none('UPDATE video SET live_stream = $1 WHERE video_id = $2', [isLive, videoId]);
    } catch (error) {
        console.error(`Error updating video ${videoId}:`, error);
    }
}

/**
 * Processes an array of video objects in batches.
 * For each batch, calls the YouTube API to retrieve liveStreamingDetails
 * and then updates each video in the database accordingly.
 * @param {Array<Object>} videos - An array of video objects from the database.
 */
async function checkVideosLiveStatus(videos) {
    const youtubeApiKey = process.env.YOUTUBE_DEVELOPER_KEY;
    if (!youtubeApiKey) {
        console.error('Missing YouTube API key. Set the YOUTUBE_API_KEY environment variable.');
        process.exit(1);
    }

    const youtube = google.youtube({
        version: 'v3',
        auth: youtubeApiKey,
    });

    const BATCH_SIZE = 50;
    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
        const batch = videos.slice(i, i + BATCH_SIZE);
        const videoIds = batch.map(video => video.video_id).join(',');

        try {
            const response = await youtube.videos.list({
                part: 'liveStreamingDetails',
                id: videoIds,
            });

            // Create a map from videoId to live status (true if liveStreamingDetails exists and is non-empty)
            const liveStatusMap = new Map();
            if (response.data.items) {
                for (const item of response.data.items) {
                    const details = item.liveStreamingDetails;
                    const isLive = details ? Object.keys(details).length > 0 : false;
                    liveStatusMap.set(item.id, isLive);
                }
            }

            // Update each video in the batch
            for (const video of batch) {
                // If the video isn't returned by the API, assume live_stream is false.
                const isLive = liveStatusMap.has(video.video_id) ? liveStatusMap.get(video.video_id) : false;
                await updateVideoLiveStream(video.video_id, isLive);
                console.log(`Updated video ${video.video_id}: live_stream = ${isLive}`);
            }
        } catch (error) {
            console.error(`Error processing batch starting at index ${i}:`, error);
            process.exit(1);
        }
    }
}

/**
 * Main function to process all videos with null live_stream.
 */
async function main() {
    try {
        const videos = await getVideosWithNullLiveStream();
        console.log(`Found ${videos.length} videos with live_stream null.`);

        if (videos.length > 0) {
            await checkVideosLiveStatus(videos);
            console.log('All videos processed.');
        } else {
            console.log('No videos to process.');
        }
    } catch (error) {
        console.error('Error in main processing:', error);
        process.exit(1);
    } finally {
        pgp.end(); // Close the connection pool.
    }
}

main();
