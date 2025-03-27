import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp({
    user: 'postgres',      // replace with your database username
    host: 'localhost',     // replace with your database host
    database: 'postgres',  // replace with your database name
    password: 'password',  // replace with your database password
    port: 5432,            // replace with your database port if different
});

// Array of channels to add or update. Modify as needed.
const channels = [
    {
        channel_id: 'UCv6GlCIlfC9hLW8shg4cRyw',
        channel_name: 'AverageGregTechPlayer',
        channel_url: 'https://www.youtube.com/@AverageGregTechPlayer/videos'
    },
    {
        channel_id: 'UCapAxx_bMPdOEl2SQxg2HAw',
        channel_name: 'Kharax82',
        channel_url: 'https://www.youtube.com/@Kharax82/videos'
    }
];

const upsertChannels = async () => {
    try {
        // Loop through each channel and insert or update using ON CONFLICT
        for (const channel of channels) {
            await db.none(
                `
        INSERT INTO channel (channel_id, channel_name, channel_url)
        VALUES ($1, $2, $3)
        ON CONFLICT (channel_id)
        DO UPDATE SET 
          channel_name = EXCLUDED.channel_name,
          channel_url = EXCLUDED.channel_url;
        `,
                [channel.channel_id, channel.channel_name, channel.channel_url]
            );
        }
        console.log('Channels have been upserted successfully.');
    } catch (err) {
        console.error('Error upserting channels:', err);
    } finally {
        pgp.end();
        console.log('Disconnected from the database.');
    }
};

upsertChannels();
