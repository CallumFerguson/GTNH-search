import pgPromise from 'pg-promise';
import { readFile } from 'fs/promises';
import { parseStringPromise } from 'xml2js';

const pgp = pgPromise();
const db = pgp({
    user: 'postgres',      // replace with your database username
    host: 'localhost',     // replace with your database host
    database: 'postgres',  // replace with your database name
    password: 'password',  // replace with your database password
    port: 5432,            // replace with your database port if different
});

// Helper function to insert a wiki page into the database
async function insertWikiPage(pageData) {
    const query = `
    INSERT INTO wiki_page (
      title,
      namespace,
      page_id,
      revision_id,
      parent_revision_id,
      timestamp,
      contributor_username,
      contributor_id,
      comment,
      content
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    )
    ON CONFLICT (page_id) DO NOTHING;
  `;
    await db.none(query, [
        pageData.title,
        pageData.namespace,
        pageData.page_id,
        pageData.revision_id,
        pageData.parent_revision_id,
        pageData.timestamp,
        pageData.contributor_username,
        pageData.contributor_id,
        pageData.comment,
        pageData.content,
    ]);
}

// Function to parse the XML and insert each page into the wiki_page table
async function convertXMLAndInsert(xmlContent) {
    try {
        const parsed = await parseStringPromise(xmlContent);

        // Global site info (if needed later)
        const siteinfo = parsed.mediawiki.siteinfo[0];
        // Example: siteinfo.sitename, siteinfo.dbname, etc.

        if (parsed.mediawiki.page) {
            for (const page of parsed.mediawiki.page) {
                const title = page.title[0];
                const namespace = page.ns ? parseInt(page.ns[0], 10) : null;
                const page_id = page.id ? parseInt(page.id[0], 10) : null;

                const revision = page.revision[0];
                const revision_id = revision.id ? parseInt(revision.id[0], 10) : null;
                const parent_revision_id = revision.parentid ? parseInt(revision.parentid[0], 10) : null;
                const timestamp = revision.timestamp ? new Date(revision.timestamp[0]) : null;

                let contributor_username = 'Anonymous';
                let contributor_id = null;
                if (revision.contributor) {
                    const contributor = revision.contributor[0];
                    if (contributor.username) {
                        contributor_username = contributor.username[0];
                    }
                    if (contributor.id) {
                        contributor_id = parseInt(contributor.id[0], 10);
                    }
                }
                const comment = revision.comment ? revision.comment[0] : null;
                let content = null;
                if (revision.text && revision.text[0]._) {
                    content = revision.text[0]._;
                }

                const pageData = {
                    title,
                    namespace,
                    page_id,
                    revision_id,
                    parent_revision_id,
                    timestamp,
                    contributor_username,
                    contributor_id,
                    comment,
                    content,
                };

                try {
                    await insertWikiPage(pageData);
                    console.log(`Inserted page: ${title}`);
                } catch (err) {
                    console.error(`Error inserting page ${title}:`, err);
                }
            }
        }
    } catch (error) {
        console.error('Error parsing XML:', error);
        throw error;
    }
}

async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Usage: node index.js <path-to-xml-file>');
        process.exit(1);
    }
    try {
        const xmlContent = await readFile(filePath, 'utf-8');
        await convertXMLAndInsert(xmlContent);
    } catch (error) {
        console.error('Error processing the file:', error);
    } finally {
        pgp.end();
        console.log('Disconnected from the database.');
    }
}

main();
