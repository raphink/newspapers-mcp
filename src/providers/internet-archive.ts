import axios from "axios";

export async function searchInternetArchiveFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  // Build Solr query for newspapers collection
  let q = `collection:newspapers AND (${query})`;
  if (date_from || date_to) {
    const from = date_from || "*";
    const to = date_to || "*";
    q += ` AND date:[${from} TO ${to}]`;
  }

  const params = new URLSearchParams({
    q,
    output: "json",
    rows: rows.toString(),
    page: page.toString(),
    fl: "identifier,title,date,description,subject,collection,publisher,language",
  });

  const response = await axios.get(`https://archive.org/advancedsearch.php?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
    timeout: 15000,
  });

  const data = response.data?.response;
  const totalResults = data?.numFound || 0;
  const docs = data?.docs || [];

  const results = docs.map((doc: any, i: number) => {
    const title = doc.title || "Untitled";
    const date = doc.date || "";
    const publisher = doc.publisher || "";
    const description = (doc.description || "").substring(0, 300);
    const identifier = doc.identifier || "";
    const link = identifier ? `https://archive.org/details/${identifier}` : "";

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (publisher) entry += ` — ${publisher}`;
    if (link) entry += `\n   Link: ${link}`;
    if (description) entry += `\n   ${description}`;
    return entry;
  });

  return `Internet Archive (Newspapers) — ${totalResults} results for "${query}" (2.9M+ digitised newspapers)\nPage ${page}, showing ${docs.length} results:\n\n${results.join("\n\n") || "No results found."}`;
}
