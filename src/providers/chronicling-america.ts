import axios from "axios";

export async function searchChroniclingAmericaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    q: query,
    fo: "json",
    c: rows.toString(),
    sp: page.toString(),
    fa: "original_format:newspaper",
  });

  if (date_from) {
    const year = date_from.substring(0, 4);
    params.append("dates", `${year}/`);
  }
  if (date_to) {
    const year = date_to.substring(0, 4);
    if (date_from) {
      params.delete("dates");
      params.append("dates", `${date_from.substring(0, 4)}/${year}`);
    } else {
      params.append("dates", `/${year}`);
    }
  }

  const response = await axios.get(`https://www.loc.gov/collections/chronicling-america/?${params}`, {
    timeout: 15000,
  });
  const data = response.data;
  const totalResults = data.pagination?.total || 0;
  const items = data.results || [];

  const results = items.map((item: any) => {
    const title = item.title || "Untitled";
    const date = item.date || "";
    const description = (item.description || []).join(" ").substring(0, 400);
    const url = item.url || "";
    const imageUrl = (item.image_url || [])[0] || "";
    const newspaper = (item.partof_title || [])[0] || "";
    let snippetDocId = "";
    const iiifMatch = imageUrl.match(/\/iiif\/([^/]+(?:\/[^/]+)*?)\/full\//);
    if (iiifMatch) snippetDocId = iiifMatch[1];
    return { title, date, description, url, newspaper, snippetDocId };
  });

  const resultText = results.map((r: any, i: number) => {
    let entry = `${i + 1}. ${r.title}`;
    if (r.date) entry += ` (${r.date})`;
    if (r.newspaper) entry += ` — ${r.newspaper}`;
    if (r.description) entry += `\n   ${r.description}`;
    if (r.url) entry += `\n   Link: ${r.url}`;
    if (r.snippetDocId) entry += `\n   → newspapers_get_snippet(source: "chronicling_america", document_id: "${r.snippetDocId}")`;
    return entry;
  }).join("\n\n");

  return `Chronicling America (LoC) — ${totalResults} results for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText || "No results found."}`;
}
