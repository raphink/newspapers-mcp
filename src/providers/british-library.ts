export async function searchBritishLibraryFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const searchUrl = `https://catalogue.bl.uk/nde/search?vid=44BL_MAIN:BLL01_NDE&query=any,contains,${encodeURIComponent(query)}&tab=Everything&search_scope=BL_LOCAL&offset=${(page - 1) * rows}`;
  return `British Library catalogue search for "${query}":\n\nSearch URL: ${searchUrl}\n\nNote: The British Library's digitised newspaper collection is primarily accessible through the British Newspaper Archive (https://www.britishnewspaperarchive.co.uk/). The BL catalogue above provides metadata records for newspaper holdings.`;
}
