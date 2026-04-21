import axios from "axios";

export async function searchEluxemburgensiaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    query,
    page: (page - 1).toString(), // 0-based
    size: rows.toString(),
  });

  if (date_from) params.set("startDate", date_from);
  if (date_to) params.set("endDate", date_to);

  const response = await axios.get(`https://viewer.eluxemburgensia.lu/api/viewer2/search?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
    timeout: 15000,
  });

  const data = response.data?.data;
  const totalResults = data?.numFound || 0;
  const articles = data?.articles || [];

  const results = articles.map((art: any, i: number) => {
    const title = art.title || "Untitled";
    const date = art.date || "";
    const collection = art.collection || "";
    const lang = art.language || "";
    const authors = (art.authors || []).join(", ");
    const docType = art.type || "";
    const pid = art.pid || "";
    const articleId = art.article || "";
    const pageId = art.begin || "";
    const viewerUrl = pid ? `https://viewer.eluxemburgensia.lu/ark:${pid}/pages/1` : "";

    // Build snippet coordinates from wordCoordinateSnippets
    const snippets = art.wordCoordinateSnippets || [];
    let snippetHint = "";
    if (pid && snippets.length > 0) {
      const coords = snippets[0].coordinates || [];
      if (coords.length > 0) {
        // Calculate bounding box of first snippet
        let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
        const page = coords[0].page || "ALTO00001";
        for (const c of coords) {
          if (c.x < minX) minX = c.x;
          if (c.y < minY) minY = c.y;
          if (c.x + c.w > maxX) maxX = c.x + c.w;
          if (c.y + c.h > maxY) maxY = c.y + c.h;
        }
        // Add padding
        const pad = 50;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX += pad;
        maxY += pad;
        const pageNum = page.replace(/\D/g, "") || "1";
        const region = `${minX},${minY},${maxX - minX},${maxY - minY}`;
        snippetHint = `\n   → newspapers_get_snippet(source: "eluxemburgensia", document_id: "${pid}/pages/${parseInt(pageNum)}", snippet_coords: "${region}")`;
      }
    }

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (collection) entry += ` — ${collection}`;
    if (authors) entry += ` by ${authors}`;
    if (lang) entry += ` [${lang}]`;
    if (docType) entry += ` (${docType})`;
    if (viewerUrl) entry += `\n   Link: ${viewerUrl}`;
    entry += snippetHint;
    return entry;
  });

  return `eLuxemburgensia (National Library of Luxembourg) — ${totalResults} results for "${query}"\nPage ${page}, showing ${articles.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
