import axios from "axios";

export async function searchAnnoFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const from = (page - 1) * rows + 1;
  const params = new URLSearchParams({
    query,
    from: from.toString(),
    facets: "false",
  });

  if (date_from || date_to) {
    const yearFrom = date_from ? date_from.substring(0, 4) : "1689";
    const yearTo = date_to ? date_to.substring(0, 4) : "2025";
    params.append("selectedFilters", `date:[${yearFrom} TO ${yearTo}]`);
  }

  const response = await axios.get(`https://anno.onb.ac.at/anno-suche/rest/search/simple?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0", "Accept": "application/json" },
  });
  const data = response.data;
  const totalHits = data.totalHits || 0;
  const documents = data.documents || [];

  // Enrich top results with OCR snippets
  const maxSnippetFetches = Math.min(documents.length, 5);
  const enrichedResults: string[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const docId = doc.docId || "";
    const title = doc.displayTitle || "Untitled";
    const date = doc.uid?.annoDate?.date || (doc.uid?.year ? String(doc.uid.year) : "");
    const places = (doc.places || []).join(", ");
    const type = doc.type || "";
    const hitsInDoc = doc.totalHitsInDoc || 0;
    const openUrl = doc.openUrl || "";

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (places) entry += ` — ${places}`;
    if (type) entry += ` [${type}]`;
    entry += ` (${hitsInDoc} hits)`;
    if (openUrl) entry += `\n   Link: ${openUrl}`;

    if (i < maxSnippetFetches && docId) {
      try {
        const snippetResp = await axios.get(`https://anno.onb.ac.at/anno-suche/rest/search/snippet`, {
          params: { documentId: docId, query },
          headers: { "User-Agent": "newspapers-mcp/1.0", "Accept": "application/json" },
          timeout: 10000,
        });
        const snippetData = snippetResp.data;
        const snippetPages = snippetData.snippetPages || [];

        for (let sp = 0; sp < Math.min(snippetPages.length, 2); sp++) {
          const page = snippetPages[sp];
          const pageLabel = page.pageLabel || page.page;
          const snippets = page.snippets || [];
          for (let s = 0; s < Math.min(snippets.length, 1); s++) {
            const snippet = snippets[s];
            let text = snippet.text || "";
            text = text.replace(/<span class="snp_txt_hl">/g, "**").replace(/<\/span>/g, "**")
              .replace(/<br\/>/g, " ").replace(/&amp;/g, "&").replace(/&ouml;/g, "ö")
              .replace(/&auml;/g, "ä").replace(/&uuml;/g, "ü").replace(/&szlig;/g, "ß")
              .replace(/&#\d+;/g, "").replace(/&apos;/g, "'");
            if (text) entry += `\n   Page ${pageLabel}: ${text.substring(0, 300)}`;
            if (snippet.imageURL) entry += `\n   → newspapers_get_snippet(source: "anno", document_id: "${snippet.imageURL}")`;
          }
        }
      } catch {
        // Snippet fetch failed, show basic result
      }
    }

    enrichedResults.push(entry);
  }

  return `ANNO (Austrian Newspapers Online) — ${totalHits} results for "${query}" (28M+ pages, 1600+ titles)\nPage ${page}, showing ${documents.length} results:\n\n${enrichedResults.join("\n\n") || "No results found."}`;
}
