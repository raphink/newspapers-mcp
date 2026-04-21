import axios from "axios";

export async function searchEuropeanaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const apiKey = process.env.EUROPEANA_API_KEY || "api2demo";
  const params = new URLSearchParams({
    query: `"${query}" AND (type:"TEXT")`,
    profile: "rich",
    rows: rows.toString(),
    start: ((page - 1) * rows + 1).toString(),
    wskey: apiKey,
    qf: 'contentTier:"*"',
  });

  if (date_from || date_to) {
    const dateFacet = `${date_from || "*"}/${date_to || "*"}`;
    params.append("qf", `issued:[${dateFacet}]`);
  }

  const response = await axios.get(`https://api.europeana.eu/record/v2/search.json?${params}`);
  const totalResults = response.data.totalResults || 0;
  const items = response.data.items || [];

  const results = items.map((item: any) => {
    const title = item.title?.[0] || item.dcTitleLangAware?.def?.[0] || "Untitled";
    const description = item.dcDescription?.[0] || item.dcDescriptionLangAware?.def?.[0] || "";
    const date = item.year?.[0] || "";
    const provider = item.dataProvider?.[0] || "";
    const url = item.guid || item.edmIsShownAt?.[0] || "";
    const imageUrl = item.edmIsShownBy?.[0] || "";
    return { title, description, date, provider, url, imageUrl };
  });

  const resultText = results.map((r: any, i: number) => {
    let entry = `${i + 1}. ${r.title}`;
    if (r.date) entry += ` (${r.date})`;
    if (r.provider) entry += ` — ${r.provider}`;
    if (r.description) entry += `\n   ${r.description.substring(0, 300)}`;
    if (r.url) entry += `\n   Link: ${r.url}`;
    if (r.imageUrl) entry += `\n   → newspapers_get_snippet(source: "europeana", document_id: "${r.imageUrl}")`;
    return entry;
  }).join("\n\n");

  return `Europeana — ${totalResults} total results for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText || "No results found."}`;
}
