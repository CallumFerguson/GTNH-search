import pgPromise from 'pg-promise';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const question = "how do I automate titanium";

const OPENAI_MODEL = 'text-embedding-3-small';

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

// Initialize the OpenAI client.
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
    try {
        console.log(`Generating embedding for the question: "${question}" ...`);
        const embeddingResponse = await openai.embeddings.create({
            model: OPENAI_MODEL,
            input: question,
        });
        if (
            !embeddingResponse.data ||
            !embeddingResponse.data[0] ||
            !embeddingResponse.data[0].embedding
        ) {
            console.error('Failed to generate embedding for the question.');
            process.exit(1);
        }
        const questionEmbedding = embeddingResponse.data[0].embedding;
        console.log('Embedding generated for the question.');

        // Query the database for the top 5 relevant transcript chunks using cosine similarity.
        console.log('Querying database for relevant transcript chunks using cosine similarity...');
        const results = await db.any(
            `SELECT
         t.raw_transcript,
         tc.chunk_text,
         tc.line_number,
         video.video_id,
         video.title,
         'https://youtube.com/watch?v=' || video.video_id AS youtube_url,
         1 - (ce.embedding_vector <=> $1::vector) AS relevance
       FROM chunk_embedding ce
       JOIN transcript_chunk tc ON tc.id = ce.chunk_id
       JOIN transcript t ON t.id = tc.transcript_id
       JOIN video ON video.id = t.video_id
       WHERE ce.embedding_model = $2
       ORDER BY ce.embedding_vector <=> $1::vector
       LIMIT 5`,
            [questionEmbedding, OPENAI_MODEL]
        );

        if (results.length === 0) {
            console.error('No relevant transcript chunks found.');
            process.exit(1);
        }

        console.log(`Found ${results.length} relevant transcript chunk(s):`);
        for (const row of results) {
            console.log('----------------------------------------');
            const start = row.raw_transcript[row.line_number].start;
            const youtube_url = `https://www.youtube.com/watch?v=${row.video_id}&t=${Math.floor(start)}`;
            console.log(`YouTube URL   : ${youtube_url}`);
            console.log(`Video Title   : ${row.title}`);
            console.log(`Chunk text    : ${row.chunk_text}`);
            console.log(`Relevance Score (1 is best): ${row.relevance.toFixed(4)}`);
        }
    } catch (error) {
        console.error('Error during query execution:', error);
        process.exit(1);
    } finally {
        pgp.end();
    }
}

main();
