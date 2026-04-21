import axios from "axios";

export async function searchDigipressFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const start = (page - 1) * rows;
  const params = new URLSearchParams({
    q: query,
    rows: rows.toString(),
    start: start.toString(),
  });

  if (date_from) {
    const [y, m, d] = date_from.split("-");
    if (y) params.append("fromYear", y);
    if (m) params.append("fromMonth", m);
    if (d) params.append("fromDay", d);
  }
  if (date_to) {
    const [y, m, d] = date_to.split("-");
    if (y) params.append("untilYear", y);
    if (m) params.append("untilMonth", m);
    if (d) params.append("untilDay", d);
  }

  const url = `https://digipress.digitale-sammlungen.de/search/simple?${params}`;
  const response = await axios.get(url, {
    timeout: 15000,
  });
  const html: string = response.data;

  const hitsMatch = html.match(/<title>digiPress:\s*(\d+)\s*Treffer<\/title>/);
  const totalHits = hitsMatch ? hitsMatch[1] : "unknown";

  const results: Array<{title: string; date: string; link: string; snippetDocId: string; snippetCoords: string; ocrText: string}> = [];

  const blocks = html.split(/<a\s+class="srTitle"/);
  for (let b = 1; b < blocks.length && results.length < rows; b++) {
    const block = blocks[b];
    const linkMatch = block.match(/href="(\/view\/[^"]+)"[^>]*>([^<]+)<\/a>/);
    const dateMatch = block.match(/<span\s+class="srTitleAccessory">([^<]+)<\/span>/);
    const imgMatch = block.match(/class="snippet-image"\s+src="https:\/\/api\.digitale-sammlungen\.de\/iiif\/image\/v2\/([^/]+)\/(pct:[^/]+)\/full\/0\/default\.jpg"/);
    const ocrMatch = block.match(/class="snippet-highlight"[^>]*title="([^"]+)"/);

    if (linkMatch) {
      let ocrText = ocrMatch ? ocrMatch[1] : "";
      ocrText = ocrText.replace(/&lt;em&gt;/g, "").replace(/&lt;\/em&gt;/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

      results.push({
        link: `https://digipress.digitale-sammlungen.de${linkMatch[1]}`,
        title: linkMatch[2].trim(),
        date: dateMatch ? dateMatch[1].trim() : "",
        snippetDocId: imgMatch ? imgMatch[1] : "",
        snippetCoords: imgMatch ? imgMatch[2] : "",
        ocrText,
      });
    }
  }

  const resultText = results.length > 0
    ? results.map((r, i) => {
      let entry = `${i + 1}. ${r.title} (${r.date})\n   ${r.link}`;
      if (r.ocrText) entry += `\n   OCR snippet: ${r.ocrText.substring(0, 300)}`;
      if (r.snippetDocId) entry += `\n   → newspapers_get_snippet(source: "digipress", document_id: "${r.snippetDocId}", snippet_coords: "${r.snippetCoords}")`;
      return entry;
    }).join("\n\n")
    : "No results found.";

  return `digiPress (BSB) — ${totalHits} hits for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText}`;
}
