export async function searchBritishLibraryFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const encodedQuery = encodeURIComponent(query);
  const offset = (page - 1) * rows;
  const catalogueUrl = `https://catalogue.bl.uk/nde/search?vid=44BL_MAIN:BLL01_NDE&query=any,contains,${encodedQuery}&tab=Everything&search_scope=BL_LOCAL&offset=${offset}`;

  // BNA date-scoped search URL
  const bnaParams = new URLSearchParams({ BasicSearchText: query });
  if (date_from) bnaParams.set("DateFrom", date_from.slice(0, 4));
  if (date_to) bnaParams.set("DateTo", date_to.slice(0, 4));
  const bnaUrl = `https://www.britishnewspaperarchive.co.uk/search/results?${bnaParams.toString()}`;

  return `British Library Newspaper Archives — search for "${query}"${date_from || date_to ? ` (${date_from ?? ""}–${date_to ?? ""})` : ""}

Note: The BL Primo VE catalogue API requires an institutional API key and cannot be queried programmatically without one. Digitised newspaper content is held by the British Newspaper Archive (subscription service, partnership with findmypast).

Suggested resources:
1. BL Catalogue (metadata): ${catalogueUrl}
   — Browse holdings records in the British Library catalogue
2. British Newspaper Archive (subscription): ${bnaUrl}
   — 40M+ digitised pages from 1,600+ British & Irish newspaper titles
3. BL Newspapers reading rooms: https://www.bl.uk/collection-guides/newspapers
   — Guide to accessing BL newspaper collections on-site`;
}
