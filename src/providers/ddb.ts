import axios from "axios";

export async function searchDdbFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const start = (page - 1) * rows;
  const params = new URLSearchParams({
    q: query,
    rows: rows.toString(),
    start: start.toString(),
  });

  if (date_from || date_to) {
    const from = date_from ? `${date_from}T00:00:00Z` : "*";
    const to = date_to ? `${date_to}T23:59:59Z` : "*";
    params.append("fq", `publication_date:[${from} TO ${to}]`);
  }

  const response = await axios.get(
    `https://api.deutsche-digitale-bibliothek.de/search/index/newspaper-issues/newspaper-search?${params}`,
    {
      headers: { Accept: "application/json", "User-Agent": "newspapers-mcp/1.0" },
      timeout: 15000,
    }
  );
  const data = response.data;
  const totalResults = data.response?.numFound || 0;
  const docs = data.response?.docs || [];

  const results = docs.map((doc: any, i: number) => {
    const title = doc.paper_title || "Untitled";
    const date = doc.publication_date ? doc.publication_date.split("T")[0] : "";
    const provider = doc.provider || "";
    const places = (doc.place_of_distribution || []).join(", ");
    const id = doc.id || "";
    const link = `https://www.deutsche-digitale-bibliothek.de/newspaper/item/${id}`;
    const thumbnailId = doc.thumbnail || "";

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (provider) entry += ` — ${provider}`;
    if (places) entry += `\n   Places: ${places}`;
    entry += `\n   Link: ${link}`;
    if (thumbnailId) entry += `\n   → newspapers_get_snippet(source: "ddb", document_id: "${thumbnailId}")`;
    return entry;
  });

  return `Deutsche Digitale Bibliothek — ${totalResults} newspaper issues for "${query}"\nPage ${page}, showing ${docs.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
