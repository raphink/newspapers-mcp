import axios from "axios";

export async function searchSouthAfricanFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    query: query,
    rows: rows.toString(),
    start: ((page - 1) * rows).toString(),
  });

  if (date_from || date_to) {
    params.append("fq", `published:[${date_from || "1800"}T00:00:00Z TO ${date_to || "2024"}T23:59:59Z]`);
  }

  await axios.get(`https://digital.lib.sun.ac.za/search/newspapers?${params}`, {
    timeout: 15000,
  });
  return `South African archives — searched for "${query}"`;
}
