import axios from "axios";

export async function searchDdbFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    query: query,
    rows: rows.toString(),
    offset: ((page - 1) * rows).toString(),
    facets: "type_fct",
  });

  if (date_from || date_to) {
    params.append("dateRange", `${date_from || "1700"},${date_to || "2024"}`);
  }
  params.append("filter", "type:Periodical");

  await axios.get(`https://www.deutsche-digitale-bibliothek.de/search?${params.toString()}`);
  return `Deutsche Digitale Bibliothek — searched for "${query}"`;
}
