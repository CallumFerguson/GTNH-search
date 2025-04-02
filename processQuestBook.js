import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Get the path from the environment variable for the input JSON file.
const filePath = process.env.QUEST_DATABASE_JSON_PATH;
if (!filePath) {
    console.error('Error: QUEST_DATABASE_JSON_PATH environment variable is not set.');
    process.exit(1);
}

async function readJsonFile() {
    try {
        const data = await fs.readFile(path.resolve(filePath), 'utf-8');
        const questDatabaseJSON = JSON.parse(data);
        const mainQuestDatabase = questDatabaseJSON["questDatabase:9"];

        let output = '';
        for (const key in mainQuestDatabase) {
            if (Object.hasOwnProperty.call(mainQuestDatabase, key)) {
                const quest = mainQuestDatabase[key]["properties:10"]["betterquesting:10"];
                const title = quest["name:8"];
                const desc = quest["desc:8"];
                output += `${title}\n${desc}\n\n`;
            }
        }

        // Write the output to a file named "output.txt" in the current directory.
        const outputPath = path.resolve('output.txt');
        await fs.writeFile(outputPath, output, 'utf-8');
        console.log(`Data successfully written to ${outputPath}`);
    } catch (error) {
        console.error('Failed to read or parse JSON file:', error);
        process.exit(1);
    }
}

readJsonFile();
