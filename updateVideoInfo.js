import pgPromise from 'pg-promise';
import { google } from 'googleapis';
import fs from "fs";

const pgp = pgPromise();
const db = pgp({
    user: 'postgres',      // replace with your database username
    host: 'localhost',     // replace with your database host
    database: 'postgres',  // replace with your database name
    password: 'password',  // replace with your database password
    port: 5432,            // replace with your database port if different
});

/**
 * Retrieve all videos where live_stream is null or published_at is null.
 */
async function getVideosWithNullLiveStreamOrPublishedAt() {
    try {
        return await db.any('SELECT * FROM video WHERE live_stream IS NULL OR published_at IS NULL');
    } catch (error) {
        console.error('Error fetching videos:', error);
        throw error;
    }
}

/**
 * Update the live_stream and published_at fields for a given video.
 * @param {string} videoId - The video_id from the video table.
 * @param {boolean} isLive - The boolean value to update for live_stream.
 * @param {string|null} publishedAt - The published date to update for published_at.
 */
async function updateVideoData(videoId, isLive, publishedAt) {
    try {
        await db.none(
            'UPDATE video SET live_stream = $1, published_at = $2 WHERE video_id = $3',
            [isLive, publishedAt, videoId]
        );
    } catch (error) {
        console.error(`Error updating video ${videoId}:`, error);
    }
}

/**
 * Processes an array of video objects in batches.
 * For each batch, calls the YouTube API to retrieve liveStreamingDetails and snippet data,
 * then updates each video in the database accordingly.
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
            // Request both liveStreamingDetails and snippet data
            const response = await youtube.videos.list({
                part: 'liveStreamingDetails,snippet',
                id: videoIds,
            });

            // Create a map from videoId to an object with isLive and publishedAt values.
            const videoDataMap = new Map();
            if (response.data.items) {
                for (const item of response.data.items) {
                    const details = item.liveStreamingDetails;
                    const isLive = details ? Object.keys(details).length > 0 : false;
                    const publishedAt = item.snippet && item.snippet.publishedAt ? item.snippet.publishedAt : null;
                    videoDataMap.set(item.id, { isLive, publishedAt });
                }
            }

            // Update each video in the batch
            for (const video of batch) {
                // If the video isn't returned by the API, assume live_stream is false and publishedAt remains null.
                const videoData = videoDataMap.get(video.video_id) || { isLive: false, publishedAt: null };
                await updateVideoData(video.video_id, videoData.isLive, videoData.publishedAt);
                console.log(`Updated video ${video.video_id}: live_stream = ${videoData.isLive}, published_at = ${videoData.publishedAt}`);
            }
        } catch (error) {
            console.error(`Error processing batch starting at index ${i}:`, error);
            process.exit(1);
        }
    }
}

/**
 * Main function to process all videos with null live_stream or published_at.
 */
async function main() {
    try {
        const videos = await getVideosWithNullLiveStreamOrPublishedAt();
        console.log(`Found ${videos.length} videos with live_stream or published_at null.`);

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
