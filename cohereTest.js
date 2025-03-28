import { CohereClient } from 'cohere-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.COHERE_API_KEY;
if (!apiKey) {
    console.error("Please define the COHERE_API_KEY environment variable in the .env file.");
    process.exit(1);
}

const cohere = new CohereClient({
    token: apiKey,
});

async function run() {
    const texts = [
        "Hello, world!",
        "This is a sample text for embedding."
    ];

    try {
        const embed = await cohere.v2.embed({
            texts,
            model: 'embed-english-v3.0',
            inputType: 'search_document',
            embeddingTypes: ['float'],
        });
        console.log(embed);
        console.log(JSON.stringify(embed, null, 2));
        console.log(embed.embeddings.float[0]);
        console.log(embed.embeddings.float[1]);
    } catch (error) {
        console.error("Error creating embeddings:", error);
    }
}

run();
