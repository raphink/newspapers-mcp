export async function searchSouthAfricanFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const saMediaUrl = `https://discover.sabinet.co.za/SA-ePublications?type=journal&searchterm=${encodeURIComponent(query)}`;
  const nlsaUrl = `https://www.nlsa.ac.za/`;
  return `South African Newspaper Archives — search for "${query}"

Note: South African digitized newspapers are primarily accessible through commercial services. No free public API is available.

Suggested resources:
1. Sabinet SA Media (subscription): ${saMediaUrl}
   — SA Media archive with 112+ years of South African news coverage
2. National Library of South Africa: ${nlsaUrl}
   — NLSA holds physical and microfilm newspaper collections
3. British Newspaper Archive: https://www.britishnewspaperarchive.co.uk/
   — Includes some South African colonial-era newspapers`;
}
