import axios from "axios";

export async function searchDelpherFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  // Build CQL query for KB JSRU SRU endpoint
  let cqlQuery = query;
  if (date_from || date_to) {
    const yearFrom = date_from ? date_from.substring(0, 4) : "1618";
    const yearTo = date_to ? date_to.substring(0, 4) : "1995";
    cqlQuery += ` AND date within "${yearFrom} ${yearTo}"`;
  }

  const params = new URLSearchParams({
    version: "1.2",
    operation: "searchRetrieve",
    query: cqlQuery,
    recordSchema: "ddd",
    maximumRecords: rows.toString(),
    startRecord: ((page - 1) * rows + 1).toString(),
    "x-collection": "DDD_artikel",
  });

  const response = await axios.get(`https://jsru.kb.nl/sru/sru?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
  });
  const xml: string = response.data;

  const totalMatch = xml.match(/<srw:numberOfRecords>(\d+)<\/srw:numberOfRecords>/);
  const totalResults = totalMatch ? totalMatch[1] : "unknown";

  // Parse SRU records
  const articles: Array<{
    title: string; date: string; type: string; newspaper: string;
    metadataKey: string; pageurl: string; pageNum: string;
    publisher: string; place: string; edition: string; link: string;
  }> = [];

  const recordRegex = /<srw:record>([\s\S]*?)<\/srw:record>/g;
  let match;
  while ((match = recordRegex.exec(xml)) !== null && articles.length < rows) {
    const rec = match[1];
    const get = (tag: string) => {
      const m = rec.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return m ? m[1] : "";
    };

    const metadataKey = get("ddd:metadataKey");
    if (!metadataKey) continue;

    articles.push({
      title: get("dc:title") || "Untitled",
      date: get("dc:date").split(" ")[0].replace(/\//g, "-") || "",
      type: get("dc:type"),
      newspaper: get("ddd:papertitle"),
      metadataKey,
      pageurl: get("ddd:pageurl"),
      pageNum: get("ddd:page"),
      publisher: get("ddd:publisher"),
      place: get("ddd:spatialCreation"),
      edition: get("ddd:edition"),
      link: `https://www.delpher.nl/nl/kranten/view?coll=ddd&identifier=${encodeURIComponent(metadataKey)}`,
    });
  }

  // Enrich top results with OCR text
  const maxOcrFetches = Math.min(articles.length, 5);
  const enrichedResults: string[] = [];

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    let entry = `${i + 1}. ${art.title}`;
    if (art.date) entry += ` (${art.date})`;
    if (art.newspaper) entry += ` — ${art.newspaper}`;
    if (art.edition) entry += ` [${art.edition}]`;
    if (art.place) entry += `, ${art.place}`;
    if (art.type) entry += ` (${art.type})`;
    entry += `\n   Link: ${art.link}`;
    if (art.pageNum) entry += ` (page ${art.pageNum})`;

    if (i < maxOcrFetches) {
      try {
        const ocrResp = await axios.get(`https://resolver.kb.nl/resolve?urn=${art.metadataKey}:ocr`, {
          headers: { "User-Agent": "newspapers-mcp/1.0" },
          timeout: 10000,
        });
        const ocrXml: string = ocrResp.data;
        // Extract text from <p> tags
        const paragraphs: string[] = [];
        const pRegex = /<p>([\s\S]*?)<\/p>/g;
        let pMatch;
        while ((pMatch = pRegex.exec(ocrXml)) !== null) {
          const text = pMatch[1].trim();
          if (text) paragraphs.push(text);
        }
        const ocrText = paragraphs.join(" ").substring(0, 400);
        if (ocrText) entry += `\n   OCR: ${ocrText}`;
      } catch {
        // OCR fetch failed, show basic result
      }
    }

    if (art.pageurl) {
      entry += `\n   → newspapers_get_snippet(source: "delpher", document_id: "${art.pageurl}")`;
    }

    enrichedResults.push(entry);
  }

  return `Delpher (KB Netherlands) — ${totalResults} results for "${query}" (2M+ newspapers, 1618–1995)\nPage ${page}, showing ${articles.length} results:\n\n${enrichedResults.join("\n\n") || "No results found."}`;
}
