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
const chunkingMethod = "basic-1";

app.get('/api/query', async (req, res) => {
    // Use provided question or default to a sample question.
    const question = req.query.question || "how do I automate titanium";

    try {
        let questionEmbedding;
        // Check if the query embedding is cached in the query_embedding table.
        const cachedEmbedding = await db.oneOrNone(
            `SELECT embedding_vector FROM query_embedding WHERE query_text = $1`,
            [question]
        );

        if (cachedEmbedding) {
            console.log(`Using cached embedding for question: "${question}"`);
            questionEmbedding = cachedEmbedding.embedding_vector;
        } else {
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

            questionEmbedding = embeddingResponse.data[0].embedding;
            console.log('Embedding generated for the question.');

            // Insert the new query embedding into the cache table.
            await db.none(
                `INSERT INTO query_embedding (query_text, embedding_source, embedding_model, embedding_vector)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (query_text) DO NOTHING`,
                [question, 'openai', OPENAI_MODEL, questionEmbedding]
            );
        }

        console.log('Querying database for relevant transcript chunks using cosine similarity...');
        const transcriptResults = await db.any(
            `SELECT
               tc.chunk_text,
               tc.line_number,
               tc.video_timestamp,
               video.video_id,
               video.title,
               ('https://youtube.com/watch?v=' || video.video_id) AS youtube_url,
               1 - (ce.embedding_vector <=> $1::vector) AS relevance
             FROM chunk_embedding ce
             JOIN transcript_chunk tc ON tc.id = ce.chunk_id
             JOIN transcript t ON t.id = tc.transcript_id
             JOIN video ON video.id = t.video_id
             WHERE ce.embedding_model = $2
               AND tc.chunking_method = $3
             ORDER BY ce.embedding_vector <=> $1::vector ASC
             LIMIT 20`,
            [questionEmbedding, OPENAI_MODEL, chunkingMethod]
        );

        console.log('Querying database for relevant wiki page chunks using cosine similarity...');
        const wikiResults = await db.any(
            `SELECT
               wpc.chunk_text,
               wpc.chunk_index,
               wp.title,
               wp.page_id,
               1 - (wpe.embedding_vector <=> $1::vector) AS relevance,
               wp.timestamp
             FROM wiki_page_chunk_embedding wpe
             JOIN wiki_page_chunk wpc ON wpc.id = wpe.wiki_page_chunk_id
             JOIN wiki_page wp ON wp.id = wpc.wiki_page_id
             WHERE wpe.embedding_model = $2
               AND wpc.chunking_method = $3
             ORDER BY wpe.embedding_vector <=> $1::vector ASC
             LIMIT 20`,
            [questionEmbedding, OPENAI_MODEL, chunkingMethod]
        );

        if (transcriptResults.length === 0 && wikiResults.length === 0) {
            console.error('No relevant transcript or wiki page chunks found.');
            return res.status(404).json({ error: 'No relevant transcript or wiki page chunks found.' });
        }

        // Enhance transcript results with youtube link adjustments.
        const enhancedTranscriptResults = transcriptResults.map(row => {
            const start = row.video_timestamp;
            const youtubeUrlWithTime = start
                ? `https://www.youtube.com/watch?v=${row.video_id}&t=${Math.floor(start)}`
                : row.youtube_url;
            return {
                ...row,
                youtube_url: youtubeUrlWithTime,
                relevance: row.relevance,
            };
        });

        // Enhance wiki results with a link to the Wikipedia page using the page_id.
        const enhancedWikiResults = wikiResults.map(row => {
            const wikiUrl = row.page_id ? `https://en.wikipedia.org/?curid=${row.page_id}` : null;
            return {
                ...row,
                wiki_url: wikiUrl,
                relevance: row.relevance,
            };
        });

        return res.json({ transcriptResults: enhancedTranscriptResults, wikiResults: enhancedWikiResults });
    } catch (error) {
        console.error('Error during query execution:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
