import axios from "axios";

export async function searchNorwegianFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    q: query,
    mediatype: "aviser",
    size: rows.toString(),
    from: ((page - 1) * rows).toString(),
    searchType: "FULL_TEXT_SEARCH",
  });

  if (date_from || date_to) {
    const from = date_from ? date_from.replace(/-/g, "") : "18000101";
    const to = date_to ? date_to.replace(/-/g, "") : "21001231";
    params.set("filter", `date:[${from} TO ${to}]`);
  }

  const response = await axios.get(`https://api.nb.no/catalog/v1/items?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
    timeout: 15000,
  });

  const embedded = response.data?._embedded;
  const totalResults = response.data?.page?.totalElements || 0;
  const items = embedded?.items || [];

  const results = items.map((item: any, i: number) => {
    const metadata = item.metadata || {};
    const title = metadata.title || "Untitled";
    const issued = metadata.originInfo?.issued || "";
    const publisher = metadata.originInfo?.publisher || "";
    const city = metadata.geographic?.city || "";
    const lang = metadata.language || "";
    const id = item.id || "";
    const link = id ? `https://www.nb.no/items/${id}` : "";

    let entry = `${i + 1}. ${title}`;
    if (issued) entry += ` (${issued})`;
    if (publisher) entry += ` — ${publisher}`;
    if (city) entry += `, ${city}`;
    if (lang) entry += ` [${lang}]`;
    if (link) entry += `\n   Link: ${link}`;
    return entry;
  });

  return `Norwegian National Library (nb.no) — ${totalResults} results for "${query}" (newspapers, full-text search)\nPage ${page}, showing ${items.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
