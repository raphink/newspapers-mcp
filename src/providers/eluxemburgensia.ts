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
    const viewerUrl = pid ? `https://viewer.eluxemburgensia.lu/ark:/${pid}` : "";

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (collection) entry += ` — ${collection}`;
    if (authors) entry += ` by ${authors}`;
    if (lang) entry += ` [${lang}]`;
    if (docType) entry += ` (${docType})`;
    if (viewerUrl) entry += `\n   Link: ${viewerUrl}`;
    return entry;
  });

  return `eLuxemburgensia (National Library of Luxembourg) — ${totalResults} results for "${query}"\nPage ${page}, showing ${articles.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
