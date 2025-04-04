import { readFile } from 'fs/promises';
import { parseStringPromise } from 'xml2js';

async function convertXMLToReadable(xmlContent) {
    try {
        const parsed = await parseStringPromise(xmlContent);
        let output = '';

        // Extract and output site info
        const siteinfo = parsed.mediawiki.siteinfo[0];
        output += '--- Site Information ---\n';
        output += `Sitename: ${siteinfo.sitename[0]}\n`;
        output += `Database Name: ${siteinfo.dbname[0]}\n`;
        output += `Base URL: ${siteinfo.base[0]}\n`;
        output += `Generator: ${siteinfo.generator[0]}\n\n`;

        // Process pages (for this example, there's one page)
        if (parsed.mediawiki.page) {
            for (const page of parsed.mediawiki.page) {
                output += '--- Page ---\n';
                output += `Title: ${page.title[0]}\n`;
                output += `Namespace: ${page.ns[0]}\n`;
                output += `Page ID: ${page.id[0]}\n`;

                // Process the revision section
                const revision = page.revision[0];
                output += `Revision ID: ${revision.id[0]}\n`;
                output += `Parent Revision ID: ${revision.parentid ? revision.parentid[0] : 'N/A'}\n`;
                output += `Timestamp: ${revision.timestamp[0]}\n`;

                if (revision.contributor) {
                    const contributor = revision.contributor[0];
                    output += `Contributor: ${contributor.username ? contributor.username[0] : 'Anonymous'} (ID: ${contributor.id ? contributor.id[0] : 'N/A'})\n`;
                }
                output += `Comment: ${revision.comment ? revision.comment[0] : 'None'}\n\n`;

                // Include a preview of the page content (first 500 characters)
                if (revision.text && revision.text[0]._) {
                    const textContent = revision.text[0]._;
                    output += `Content (first 500 chars):\n${textContent.substring(0, 500)}\n`;
                }
                output += '\n';
            }
        }
        return output;
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
        const readableOutput = await convertXMLToReadable(xmlContent);
        console.log(readableOutput);
    } catch (error) {
        console.error('Error reading the file:', error);
    }
}

main();
