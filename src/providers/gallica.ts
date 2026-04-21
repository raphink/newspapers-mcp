import axios from "axios";

export async function searchGallicaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  // Full-text OCR search in newspaper issues using SRU text index + collapsing=false
  let sruQuery = `(text all "${query}") and (dc.type all "fascicule")`;
  if (date_from) sruQuery += ` and dc.date >= "${date_from}"`;
  if (date_to) sruQuery += ` and dc.date <= "${date_to}"`;

  const params = new URLSearchParams({
    operation: "searchRetrieve",
    version: "1.2",
    query: sruQuery,
    maximumRecords: rows.toString(),
    startRecord: ((page - 1) * rows + 1).toString(),
    collapsing: "false",
  });

  const response = await axios.get(`https://gallica.bnf.fr/SRU?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
  });
  const xml: string = response.data;

  const totalMatch = xml.match(/<srw:numberOfRecords>(\d+)<\/srw:numberOfRecords>/);
  const totalResults = totalMatch ? totalMatch[1] : "unknown";

  // Parse SRU results to get ark IDs and metadata
  const issues: Array<{title: string; date: string; ark: string; link: string}> = [];
  const recordRegex = /<srw:record>([\s\S]*?)<\/srw:record>/g;
  let match;
  while ((match = recordRegex.exec(xml)) !== null && issues.length < rows) {
    const rec = match[1];
    const titleMatch = rec.match(/<dc:title>([^<]+)<\/dc:title>/);
    const dateMatch = rec.match(/<dc:date>([^<]+)<\/dc:date>/);
    const idMatch = rec.match(/<dc:identifier>https?:\/\/gallica\.bnf\.fr\/ark:\/12148\/([^<]+)<\/dc:identifier>/);

    if (idMatch) {
      issues.push({
        title: titleMatch ? titleMatch[1] : "Untitled",
        date: dateMatch ? dateMatch[1] : "",
        ark: idMatch[1],
        link: `https://gallica.bnf.fr/ark:/12148/${idMatch[1]}`,
      });
    }
  }

  // ContentSearch on top results to get page-level OCR text excerpts
  const maxContentSearches = Math.min(issues.length, 5);
  const enrichedResults: string[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    let entry = `${i + 1}. ${issue.title}`;
    if (issue.date) entry += ` (${issue.date})`;
    entry += `\n   Link: ${issue.link}`;

    if (i < maxContentSearches) {
      try {
        const csResponse = await axios.get(`https://gallica.bnf.fr/services/ContentSearch`, {
          params: { ark: issue.ark, query },
          headers: { "User-Agent": "newspapers-mcp/1.0" },
          timeout: 10000,
        });
        const csXml: string = csResponse.data;

        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let itemMatch;
        let pageCount = 0;
        while ((itemMatch = itemRegex.exec(csXml)) !== null && pageCount < 3) {
          const item = itemMatch[1];
          const pidMatch = item.match(/<p_id>PAG_(\d+)<\/p_id>/);
          const contentMatch = item.match(/<content>([\s\S]*?)<\/content>/);

          if (pidMatch) {
            const pageNum = pidMatch[1];
            let ocrText = "";
            if (contentMatch && contentMatch[1]) {
              ocrText = contentMatch[1]
                .replace(/&lt;span class='highlight'&gt;/g, "**")
                .replace(/&lt;\/span&gt;/g, "**")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");
            }

            if (ocrText) entry += `\n   Page ${pageNum}: ${ocrText.substring(0, 300)}`;
            entry += `\n   → newspapers_get_snippet(source: "gallica", document_id: "${issue.ark}/f${pageNum}")`;
            pageCount++;
          }
        }
      } catch {
        // ContentSearch failed, show basic result without OCR excerpts
      }
    }

    enrichedResults.push(entry);
  }

  return `Gallica (BnF) — ${totalResults} results for "${query}" (full-text OCR search in newspapers)\nPage ${page}, showing ${issues.length} results:\n\n${enrichedResults.join("\n\n") || "No results found."}`;
}
