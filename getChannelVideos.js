import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import pgPromise from 'pg-promise';

dotenv.config();

// Configuration constants
const API_VERSION = "v3";
const DEVELOPER_KEY = process.env.YOUTUBE_DEVELOPER_KEY;

const pgp = pgPromise();
const db = pgp({
    user: 'postgres',      // replace with your database username
    host: 'localhost',     // replace with your database host
    database: 'postgres',  // replace with your database name
    password: 'password',  // replace with your database password
    port: 5432,            // replace with your database port if different
});

const getChannelDataByName = async (channelName) => {
    try {
        // Updated query to select the primary key "id" and the YouTube channel id "channel_id"
        const query = `
      SELECT c.id, c.channel_id, COUNT(v.id) AS video_count
      FROM channel c
      LEFT JOIN video v ON v.channel_id = c.id
      WHERE c.channel_name = $1
      GROUP BY c.id, c.channel_id;
    `;
        const result = await db.oneOrNone(query, [channelName]);

        if (result) {
            console.log(`Channel: ${channelName} - YouTube Channel ID: ${result.channel_id}`);
            console.log(`Number of videos in DB: ${result.video_count}`);
            return result;
        } else {
            console.log(`Channel with name "${channelName}" not found.`);
            process.exit(1);
        }
    } catch (err) {
        console.error('Error fetching channel data:', err);
        process.exit(1);
    }
};

async function main() {
    const channelName = "AverageGregTechPlayer";

    const channelData = await getChannelDataByName(channelName);

    // If videos already exist in the DB, exit the process
    if (channelData.video_count > 0) {
        console.log(
            `Channel with YouTube ID ${channelData.channel_id} already has videos in the database`
        );
        process.exit(1);
    }

    // Build the YouTube API client
    const youtube = google.youtube({ version: API_VERSION, auth: DEVELOPER_KEY });

    // Retrieve the channel's content details to get the uploads playlist ID
    const channelResponse = await youtube.channels.list({
        part: "contentDetails",
        id: channelData.channel_id
    });

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        console.error("No channel details found");
        process.exit(1);
    }
    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

    // Retrieve video IDs, titles, and published dates from the uploads playlist
    let videos = [];
    let nextPageToken = undefined;
    do {
        const playlistResponse = await youtube.playlistItems.list({
            part: "snippet",
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken: nextPageToken,
        });
        playlistResponse.data.items.forEach(item => {
            const videoId = item.snippet.resourceId.videoId;
            const title = item.snippet.title;
            const publishedAt = item.snippet.publishedAt;
            videos.push({ video_id: videoId, title: title, published_at: publishedAt });
        });
        nextPageToken = playlistResponse.data.nextPageToken;
    } while (nextPageToken);

    console.log(`Fetched ${videos.length} videos from YouTube.`);

    // Insert videos into the database using a transaction
    try {
        await db.tx(async t => {
            const queries = videos.map(video =>
                t.none(
                    `INSERT INTO video(video_id, channel_id, title, published_at) VALUES ($1, $2, $3, $4)
                        ON CONFLICT (video_id) DO NOTHING`,
                    [video.video_id, channelData.id, video.title, video.published_at]
                )
            );
            await t.batch(queries);
        });
        console.log('Videos inserted successfully into the database.');
    } catch (err) {
        console.error('Error inserting videos:', err);
    } finally {
        pgp.end();
        console.log('Disconnected from the database.');
    }
}

main();
