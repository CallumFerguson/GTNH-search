import pgPromise from 'pg-promise';

const pgp = pgPromise();
const db = pgp({
    user: 'postgres',      // replace with your database username
    host: 'localhost',     // replace with your database host
    database: 'postgres',  // replace with your database name
    password: 'password',  // replace with your database password
    port: 5432,            // replace with your database port if different
});

/**
 * Determines if a YouTube video title is about GTNH.
 * GTNH is typically abbreviated as "GTNH", "GT:NH", or spelled out as "GregTech: New Horizons".
 *
 * @param {string} title - The YouTube video title.
 * @returns {boolean} - True if the title is likely about GTNH, false otherwise.
 */
function isAboutGTNH(title) {
    const patterns = [
        // Matches the abbreviation "GTNH" as a whole word.
        /\bgtnh\b/i,
        // Matches variations like "GT:NH" or "GT-NH"
        /\bgt[:\-]?nh\b/i,
        // Matches the full name "GregTech: New Horizons" (colon optional)
        /\bgregtech\s*:?\s*new\s+horizons\b/i,
    ];

    return patterns.some((pattern) => pattern.test(title));
}

const updateVideosRelatedToGTNH = async () => {
    try {
        // Fetch all videos (id and title)
        const videos = await db.any('SELECT id, title FROM video');
        console.log(`Found ${videos.length} videos in the database.`);

        // Update each video's related_to_GTNH field based on its title
        for (const video of videos) {
            const related = isAboutGTNH(video.title);
            await db.none(
                'UPDATE video SET related_to_GTNH = $1 WHERE id = $2',
                [related, video.id]
            );
            console.log(`Updated video id ${video.id} ("${video.title}") with related_to_GTNH = ${related}`);
        }
    } catch (err) {
        console.error('Error updating videos:', err);
    } finally {
        pgp.end();
        console.log('Disconnected from the database.');
    }
};

updateVideosRelatedToGTNH();
