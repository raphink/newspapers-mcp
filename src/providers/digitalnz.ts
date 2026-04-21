import axios from "axios";

export async function searchDigitalNZFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    text: query,
    "and[category][]": "Newspapers",
    per_page: rows.toString(),
    page: page.toString(),
  });

  if (date_from) params.set("and[year][min]", date_from.substring(0, 4));
  if (date_to) params.set("and[year][max]", date_to.substring(0, 4));

  const response = await axios.get(`https://api.digitalnz.org/v3/records.json?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
    timeout: 15000,
  });

  const search = response.data?.search;
  const totalResults = search?.result_count || 0;
  const records = search?.results || [];

  const results = records.map((rec: any, i: number) => {
    const title = rec.title || "Untitled";
    const date = rec.date || rec.display_date || "";
    const source = rec.display_content_partner || rec.content_partner?.[0] || "";
    const collection = rec.primary_collection?.[0] || "";
    const landingUrl = rec.landing_url || rec.source_url || "";
    const fulltext = (rec.fulltext || "").substring(0, 400);

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${Array.isArray(date) ? date[0] : date})`;
    if (source) entry += ` — ${source}`;
    if (collection) entry += ` [${collection}]`;
    if (landingUrl) entry += `\n   Link: ${landingUrl}`;
    if (fulltext) entry += `\n   OCR: ${fulltext}`;
    return entry;
  });

  return `DigitalNZ / Papers Past (New Zealand) — ${totalResults} results for "${query}"\nPage ${page}, showing ${records.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
