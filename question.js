import express from 'express';
import pgPromise from 'pg-promise';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS so that the standalone HTML file can access the API
app.use(cors());
app.use(express.json());

const pgp = pgPromise();
const db = pgp(process.env.DATABASE_URL);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const OPENAI_MODEL = 'text-embedding-3-small';

app.get('/api/query', async (req, res) => {
    // Use provided question or default to a sample question.
    const question = req.query.question || "how do I automate titanium";

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
            return res.status(500).json({ error: 'Failed to generate embedding for the question.' });
        }
        const questionEmbedding = embeddingResponse.data[0].embedding;
        console.log('Embedding generated for the question.');

        console.log('Querying database for relevant transcript chunks using cosine similarity...');
        const results = await db.any(
            `SELECT
         t.raw_transcript,
         tc.chunk_text,
         tc.line_number,
         video.video_id,
         video.title,
         ('https://youtube.com/watch?v=' || video.video_id) AS youtube_url,
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
            return res.status(404).json({ error: 'No relevant transcript chunks found.' });
        }

        // Optionally, adjust the YouTube URL with a start time if available from the raw transcript.
        const enhancedResults = results.map(row => {
            const start = row.raw_transcript && row.raw_transcript[row.line_number] && row.raw_transcript[row.line_number].start;
            const youtubeUrlWithTime = start ? `https://www.youtube.com/watch?v=${row.video_id}&t=${Math.floor(start)}` : row.youtube_url;
            return {
                ...row,
                youtube_url: youtubeUrlWithTime,
                relevance: row.relevance
            };
        });

        return res.json({ results: enhancedResults });
    } catch (error) {
        console.error('Error during query execution:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
