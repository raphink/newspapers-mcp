import axios from "axios";

export async function searchTroveFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const apiKey = process.env.TROVE_API_KEY;
  if (!apiKey) {
    return `Trove (National Library of Australia) — API key required.\n\nTo enable Trove search, set the TROVE_API_KEY environment variable.\nGet a free key at: https://trove.nla.gov.au/about/create-something/using-api`;
  }

  // Build query with date range using Trove's date index syntax
  let q = query;
  if (date_from || date_to) {
    const yearFrom = date_from ? date_from.substring(0, 4) : "*";
    const yearTo = date_to ? date_to.substring(0, 4) : "*";
    q += ` date:[${yearFrom} TO ${yearTo}]`;
  }

  const params = new URLSearchParams({
    key: apiKey,
    category: "newspaper",
    q,
    encoding: "json",
    n: rows.toString(),
    reclevel: "full",
    include: "articletext",
    sortby: "relevance",
  });

  // Trove uses cursor-based pagination via 's' param; for page 1, omit it
  // For subsequent pages we'd need the nextStart token, but we approximate with offset
  if (page > 1) {
    params.set("s", ((page - 1) * rows).toString());
  }

  const response = await axios.get(`https://api.trove.nla.gov.au/v3/result?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
    timeout: 15000,
  });

  const category = response.data?.category?.[0];
  const totalResults = category?.records?.total || 0;
  const articles = category?.records?.article || [];

  const results = articles.map((art: any, i: number) => {
    const title = art.heading || "Untitled";
    const date = art.date || "";
    const newspaper = art.title?.title || "";
    const pageNum = art.page || "";
    const troveUrl = art.troveUrl || "";
    const snippet = (art.snippet || "").substring(0, 400);
    const articleText = (art.articleText || "").substring(0, 400);
    const text = articleText || snippet;

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (newspaper) entry += ` — ${newspaper}`;
    if (pageNum) entry += `, p.${pageNum}`;
    if (troveUrl) entry += `\n   Link: ${troveUrl}`;
    if (text) entry += `\n   OCR: ${text}`;
    return entry;
  });

  return `Trove (National Library of Australia) — ${totalResults} results for "${query}" (25M+ digitised newspaper articles)\nPage ${page}, showing ${articles.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
