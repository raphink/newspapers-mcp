#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { z } from "zod";
import axios from "axios";
import express from "express";
import cors from "cors";
import { NoOpOAuthProvider } from "./oauth-provider.js";

// Schema definitions for tool inputs
const searchSchema = z.object({
  source: z.enum([
    "all",
    "europeana",
    "gallica",
    "ddb",
    "digipress",
    "british_library",
    "anno",
    "chronicling_america",
    "south_african",
  ]).default("all").describe("Which newspaper archive to search. Use 'all' to search all archives simultaneously."),
  query: z.string().describe("Search query (keywords, names, dates)"),
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD format)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD format)"),
  page: z.number().optional().default(1).describe("Page number for results"),
  rows: z.number().optional().default(20).describe("Number of results per page"),
});

// ========== Individual archive search implementations ==========

async function searchEuropeanaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const apiKey = process.env.EUROPEANA_API_KEY || "api2demo";
  const params = new URLSearchParams({
    query: `"${query}" AND (type:"TEXT")`,
    profile: "rich",
    rows: rows.toString(),
    start: ((page - 1) * rows + 1).toString(),
    wskey: apiKey,
    qf: 'contentTier:"*"',
  });

  if (date_from || date_to) {
    const dateFacet = `${date_from || "*"}/${date_to || "*"}`;
    params.append("qf", `issued:[${dateFacet}]`);
  }

  const response = await axios.get(`https://api.europeana.eu/record/v2/search.json?${params}`);
  const totalResults = response.data.totalResults || 0;
  const items = response.data.items || [];

  const results = items.map((item: any) => {
    const title = item.title?.[0] || item.dcTitleLangAware?.def?.[0] || "Untitled";
    const description = item.dcDescription?.[0] || item.dcDescriptionLangAware?.def?.[0] || "";
    const date = item.year?.[0] || "";
    const provider = item.dataProvider?.[0] || "";
    const url = item.guid || item.edmIsShownAt?.[0] || "";
    const imageUrl = item.edmIsShownBy?.[0] || "";
    return { title, description, date, provider, url, imageUrl };
  });

  const resultText = results.map((r: any, i: number) => {
    let entry = `${i + 1}. ${r.title}`;
    if (r.date) entry += ` (${r.date})`;
    if (r.provider) entry += ` — ${r.provider}`;
    if (r.description) entry += `\n   ${r.description.substring(0, 300)}`;
    if (r.url) entry += `\n   Link: ${r.url}`;
    if (r.imageUrl) entry += `\n   → newspapers_get_snippet(source: "europeana", document_id: "${r.imageUrl}")`;
    return entry;
  }).join("\n\n");

  return `Europeana — ${totalResults} total results for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText || "No results found."}`;
}

async function searchGallicaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  // Full-text OCR search in newspaper issues using SRU text index + collapsing=false
  let sruQuery = `(text all "${query}") and (dc.type all "fascicule")`;
  if (date_from) sruQuery += ` and dc.date >= "${date_from}"`;
  if (date_to) sruQuery += ` and dc.date <= "${date_to}"`;

  const params = new URLSearchParams({
    operation: "searchRetrieve",
    version: "1.2",
    query: sruQuery,
    maximumRecords: rows.toString(),
    startRecord: ((page - 1) * rows + 1).toString(),
    collapsing: "false",
  });

  const response = await axios.get(`https://gallica.bnf.fr/SRU?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0" },
  });
  const xml: string = response.data;

  const totalMatch = xml.match(/<srw:numberOfRecords>(\d+)<\/srw:numberOfRecords>/);
  const totalResults = totalMatch ? totalMatch[1] : "unknown";

  // Parse SRU results to get ark IDs and metadata
  const issues: Array<{title: string; date: string; ark: string; link: string}> = [];
  const recordRegex = /<srw:record>([\s\S]*?)<\/srw:record>/g;
  let match;
  while ((match = recordRegex.exec(xml)) !== null && issues.length < rows) {
    const rec = match[1];
    const titleMatch = rec.match(/<dc:title>([^<]+)<\/dc:title>/);
    const dateMatch = rec.match(/<dc:date>([^<]+)<\/dc:date>/);
    const idMatch = rec.match(/<dc:identifier>https?:\/\/gallica\.bnf\.fr\/ark:\/12148\/([^<]+)<\/dc:identifier>/);

    if (idMatch) {
      issues.push({
        title: titleMatch ? titleMatch[1] : "Untitled",
        date: dateMatch ? dateMatch[1] : "",
        ark: idMatch[1],
        link: `https://gallica.bnf.fr/ark:/12148/${idMatch[1]}`,
      });
    }
  }

  // ContentSearch on top results to get page-level OCR text excerpts
  const maxContentSearches = Math.min(issues.length, 5);
  const enrichedResults: string[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    let entry = `${i + 1}. ${issue.title}`;
    if (issue.date) entry += ` (${issue.date})`;
    entry += `\n   Link: ${issue.link}`;

    if (i < maxContentSearches) {
      try {
        const csResponse = await axios.get(`https://gallica.bnf.fr/services/ContentSearch`, {
          params: { ark: issue.ark, query },
          headers: { "User-Agent": "newspapers-mcp/1.0" },
          timeout: 10000,
        });
        const csXml: string = csResponse.data;

        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let itemMatch;
        let pageCount = 0;
        while ((itemMatch = itemRegex.exec(csXml)) !== null && pageCount < 3) {
          const item = itemMatch[1];
          const pidMatch = item.match(/<p_id>PAG_(\d+)<\/p_id>/);
          const contentMatch = item.match(/<content>([\s\S]*?)<\/content>/);

          if (pidMatch) {
            const pageNum = pidMatch[1];
            let ocrText = "";
            if (contentMatch && contentMatch[1]) {
              ocrText = contentMatch[1]
                .replace(/&lt;span class='highlight'&gt;/g, "**")
                .replace(/&lt;\/span&gt;/g, "**")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");
            }

            if (ocrText) entry += `\n   Page ${pageNum}: ${ocrText.substring(0, 300)}`;
            entry += `\n   → newspapers_get_snippet(source: "gallica", document_id: "${issue.ark}/f${pageNum}")`;
            pageCount++;
          }
        }
      } catch {
        // ContentSearch failed, show basic result without OCR excerpts
      }
    }

    enrichedResults.push(entry);
  }

  return `Gallica (BnF) — ${totalResults} results for "${query}" (full-text OCR search in newspapers)\nPage ${page}, showing ${issues.length} results:\n\n${enrichedResults.join("\n\n") || "No results found."}`;
}

async function searchDdbFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
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

async function searchDigipressFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
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
  const response = await axios.get(url);
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

async function searchBritishLibraryFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const searchUrl = `https://catalogue.bl.uk/nde/search?vid=44BL_MAIN:BLL01_NDE&query=any,contains,${encodeURIComponent(query)}&tab=Everything&search_scope=BL_LOCAL&offset=${(page - 1) * rows}`;
  return `British Library catalogue search for "${query}":\n\nSearch URL: ${searchUrl}\n\nNote: The British Library's digitised newspaper collection is primarily accessible through the British Newspaper Archive (https://www.britishnewspaperarchive.co.uk/). The BL catalogue above provides metadata records for newspaper holdings.`;
}

async function searchAnnoFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const from = (page - 1) * rows + 1;
  const params = new URLSearchParams({
    query,
    from: from.toString(),
    facets: "false",
  });

  if (date_from || date_to) {
    const yearFrom = date_from ? date_from.substring(0, 4) : "1689";
    const yearTo = date_to ? date_to.substring(0, 4) : "2025";
    params.append("selectedFilters", `date:[${yearFrom} TO ${yearTo}]`);
  }

  const response = await axios.get(`https://anno.onb.ac.at/anno-suche/rest/search/simple?${params}`, {
    headers: { "User-Agent": "newspapers-mcp/1.0", "Accept": "application/json" },
  });
  const data = response.data;
  const totalHits = data.totalHits || 0;
  const documents = data.documents || [];

  // Enrich top results with OCR snippets
  const maxSnippetFetches = Math.min(documents.length, 5);
  const enrichedResults: string[] = [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const docId = doc.docId || "";
    const title = doc.displayTitle || "Untitled";
    const date = doc.uid?.annoDate?.date || (doc.uid?.year ? String(doc.uid.year) : "");
    const places = (doc.places || []).join(", ");
    const type = doc.type || "";
    const hitsInDoc = doc.totalHitsInDoc || 0;
    const openUrl = doc.openUrl || "";

    let entry = `${i + 1}. ${title}`;
    if (date) entry += ` (${date})`;
    if (places) entry += ` — ${places}`;
    if (type) entry += ` [${type}]`;
    entry += ` (${hitsInDoc} hits)`;
    if (openUrl) entry += `\n   Link: ${openUrl}`;

    if (i < maxSnippetFetches && docId) {
      try {
        const snippetResp = await axios.get(`https://anno.onb.ac.at/anno-suche/rest/search/snippet`, {
          params: { documentId: docId, query },
          headers: { "User-Agent": "newspapers-mcp/1.0", "Accept": "application/json" },
          timeout: 10000,
        });
        const snippetData = snippetResp.data;
        const snippetPages = snippetData.snippetPages || [];

        for (let sp = 0; sp < Math.min(snippetPages.length, 2); sp++) {
          const page = snippetPages[sp];
          const pageLabel = page.pageLabel || page.page;
          const snippets = page.snippets || [];
          for (let s = 0; s < Math.min(snippets.length, 1); s++) {
            const snippet = snippets[s];
            let text = snippet.text || "";
            text = text.replace(/<span class="snp_txt_hl">/g, "**").replace(/<\/span>/g, "**")
              .replace(/<br\/>/g, " ").replace(/&amp;/g, "&").replace(/&ouml;/g, "ö")
              .replace(/&auml;/g, "ä").replace(/&uuml;/g, "ü").replace(/&szlig;/g, "ß")
              .replace(/&#\d+;/g, "").replace(/&apos;/g, "'");
            if (text) entry += `\n   Page ${pageLabel}: ${text.substring(0, 300)}`;
            if (snippet.imageURL) entry += `\n   → newspapers_get_snippet(source: "anno", document_id: "${snippet.imageURL}")`;
          }
        }
      } catch {
        // Snippet fetch failed, show basic result
      }
    }

    enrichedResults.push(entry);
  }

  return `ANNO (Austrian Newspapers Online) — ${totalHits} results for "${query}" (28M+ pages, 1600+ titles)\nPage ${page}, showing ${documents.length} results:\n\n${enrichedResults.join("\n\n") || "No results found."}`;
}

async function searchChroniclingAmericaFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
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

  const response = await axios.get(`https://www.loc.gov/collections/chronicling-america/?${params}`);
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

async function searchSouthAfricanFull(query: string, date_from?: string, date_to?: string, page = 1, rows = 20): Promise<string> {
  const params = new URLSearchParams({
    query: query,
    rows: rows.toString(),
    start: ((page - 1) * rows).toString(),
  });

  if (date_from || date_to) {
    params.append("fq", `published:[${date_from || "1800"}T00:00:00Z TO ${date_to || "2024"}T23:59:59Z]`);
  }

  await axios.get(`https://digital.lib.sun.ac.za/search/newspapers?${params}`);
  return `South African archives — searched for "${query}"`;
}

function registerTools(server: McpServer) {

// ========== UNIFIED NEWSPAPER SEARCH ==========
server.registerTool(
  "search_newspapers",
  {
    title: "Search Newspaper Archives",
    description: "Search historical newspaper archives across multiple countries. Sources: europeana (Europe-wide), gallica (France/BnF, full-text OCR with page-level results & IIIF images), ddb (Germany/DDB), digipress (Germany/BSB, ~866 titles with OCR snippets & IIIF images), british_library (UK catalogue), anno (Austria/ANNO, 28M+ pages, 1600+ titles with OCR snippets & images), chronicling_america (USA/Library of Congress with OCR & images), south_african. Use source='all' to search all simultaneously.",
    inputSchema: searchSchema,
  },
  async ({ source, query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      if (source === "all") {
        const archives = [
          { name: "Europeana", fn: () => searchEuropeanaFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "Gallica", fn: () => searchGallicaFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "digiPress", fn: () => searchDigipressFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "Chronicling America", fn: () => searchChroniclingAmericaFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "ANNO", fn: () => searchAnnoFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "British Library", fn: () => searchBritishLibraryFull(query, date_from, date_to, page, rows) },
        ];

        const sections: string[] = [];
        for (const archive of archives) {
          try {
            sections.push(await archive.fn());
          } catch (e) {
            sections.push(`${archive.name}: Error — ${e instanceof Error ? e.message : "Unknown error"}`);
          }
        }

        return {
          content: [{ type: "text", text: sections.join("\n\n---\n\n") }],
        };
      }

      // Single-source search
      let result: string;
      switch (source) {
        case "europeana":
          result = await searchEuropeanaFull(query, date_from, date_to, page, rows);
          break;
        case "gallica":
          result = await searchGallicaFull(query, date_from, date_to, page, rows);
          break;
        case "ddb":
          result = await searchDdbFull(query, date_from, date_to, page, rows);
          break;
        case "digipress":
          result = await searchDigipressFull(query, date_from, date_to, page, rows);
          break;
        case "british_library":
          result = await searchBritishLibraryFull(query, date_from, date_to, page, rows);
          break;
        case "anno":
          result = await searchAnnoFull(query, date_from, date_to, page, rows);
          break;
        case "chronicling_america":
          result = await searchChroniclingAmericaFull(query, date_from, date_to, page, rows);
          break;
        case "south_african":
          result = await searchSouthAfricanFull(query, date_from, date_to, page, rows);
          break;
      }

      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching newspapers: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== SNIPPET IMAGE PROXY ==========
server.registerTool(
  "newspapers_get_snippet",
  {
    title: "Get Newspaper Snippet Image",
    description: "Fetch a newspaper snippet image and return it as base64. Use with snippet coordinates from search results. Supported sources: digipress, chronicling_america, gallica, europeana, anno.",
    inputSchema: z.object({
      source: z.enum(["digipress", "chronicling_america", "gallica", "europeana", "anno"])
        .describe("The archive source (digipress, chronicling_america, gallica, europeana, anno)"),
      document_id: z.string()
        .describe("Document/page identifier from the archive (e.g. 'bsb10001591_00035' for digiPress, 'service:ndnp:...:0003' for Chronicling America, 'bpt6k5460422k/f173' for Gallica, full imageURL for ANNO)"),
      snippet_coords: z.string().optional()
        .describe("IIIF region coordinates for the snippet crop (e.g. 'pct:0,11.5,100,3.6' for digiPress, 'x,y,w,h' pixel coords for Gallica). Not used for ANNO (imageURL already contains crop). If omitted, returns the full page."),
    }),
  },
  async ({ source, document_id, snippet_coords }) => {
    try {
      let imageUrl: string;
      const region = snippet_coords || "full";

      switch (source) {
        case "digipress":
          imageUrl = `https://api.digitale-sammlungen.de/iiif/image/v2/${encodeURI(document_id)}/${region}/full/0/default.jpg`;
          break;
        case "chronicling_america":
          imageUrl = `https://tile.loc.gov/image-services/iiif/${encodeURI(document_id)}/${region}/pct:25/0/default.jpg`;
          break;
        case "gallica":
          // Use ,1000 max height for full pages, full size for cropped regions
          const gallicaSize = snippet_coords ? "full" : ",1000";
          imageUrl = `https://gallica.bnf.fr/iiif/ark:/12148/${encodeURI(document_id)}/${region}/${gallicaSize}/0/default.jpg`;
          break;
        case "europeana":
          imageUrl = `https://api.europeana.eu/thumbnail/v2/url.json?uri=${encodeURIComponent(document_id)}&type=TEXT`;
          break;
        case "anno":
          // ANNO snippet imageURLs are complete URLs from the snippet API
          imageUrl = document_id;
          break;
      }

      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "newspapers-mcp/1.0" },
        timeout: 30000,
      });

      const contentType = String(response.headers["content-type"] || "image/jpeg");
      const mimeType = contentType.split(";")[0].trim();
      const base64 = Buffer.from(response.data).toString("base64");

      return {
        content: [
          {
            type: "image",
            data: base64,
            mimeType,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching snippet image: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

} // end registerTools

// Main function to start the server (stdio)
async function main() {
  const server = new McpServer({
    name: "newspapers-mcp",
    version: "1.0.0",
  });
  registerTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Newspapers MCP Server running on stdio");
}

// HTTP entry point for Google Cloud Functions
const app = express();
app.set("trust proxy", 1);
app.use(cors());

// Lazily initialize OAuth auth router on first request
let authHandler: express.RequestHandler | null = null;

app.use((req, res, next) => {
  if (!authHandler) {
    const serverUrl = `${req.protocol}://${req.get("host")}`;
    console.log(`[init] OAuth provider serverUrl=${serverUrl}`);
    const provider = new NoOpOAuthProvider();
    authHandler = mcpAuthRouter({
      provider,
      issuerUrl: new URL(serverUrl),
      resourceName: "Newspapers MCP",
      scopesSupported: [],
    });
  }
  authHandler(req, res, next);
});

// MCP StreamableHTTP endpoint
app.post("/mcp", express.json({ limit: "1mb" }), async (req, res) => {
  const mcpServer = new McpServer({
    name: "newspapers-mcp",
    version: "1.0.0",
  });
  registerTools(mcpServer);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close().catch(() => {});
    mcpServer.close().catch(() => {});
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body ?? {});
  } catch (err) {
    console.error("[mcp] error:", err);
    if (!res.headersSent) res.status(500).json({ error: String(err) });
  }
});

// Health check
app.get(["/", "/health"], (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", server: "newspapers-mcp", version: "1.0.0" });
});

// Named export for GCP Cloud Functions
export const newspapersMcp = app;

// When running locally, use stdio transport instead
if (!process.env.K_SERVICE) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
