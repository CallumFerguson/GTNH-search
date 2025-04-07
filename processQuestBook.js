import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import pgPromise from 'pg-promise';

dotenv.config();

// Setup PostgreSQL connection using pg-promise
const pgp = pgPromise();
const db = pgp({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
});

// Get the path from the environment variable for the input JSON file.
const filePath = process.env.QUEST_DATABASE_JSON_PATH;
if (!filePath) {
    console.error('Error: QUEST_DATABASE_JSON_PATH environment variable is not set.');
    process.exit(1);
}

async function processQuests() {
    try {
        const data = await fs.readFile(path.resolve(filePath), 'utf-8');
        const questDatabaseJSON = JSON.parse(data);
        const mainQuestDatabase = questDatabaseJSON["questDatabase:9"];

        for (const key in mainQuestDatabase) {
            if (Object.hasOwnProperty.call(mainQuestDatabase, key)) {
                const quest = mainQuestDatabase[key]["properties:10"]["betterquesting:10"];
                const title = quest["name:8"];
                const desc = quest["desc:8"];

                // Insert quest into the database; on duplicate title, update the description.
                await db.none(
                    'INSERT INTO quest (title, description) VALUES ($1, $2) ON CONFLICT (title) DO UPDATE SET description = EXCLUDED.description',
                    [title, desc]
                );
                console.log(`Inserted/Updated quest: ${title}`);
            }
        }
        console.log('All quests have been processed and inserted/updated.');
    } catch (error) {
        console.error('Failed to process quests:', error);
        process.exit(1);
    } finally {
        pgp.end();
    }
}

processQuests();
