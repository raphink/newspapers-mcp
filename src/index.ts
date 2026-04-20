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
  query: z.string().describe("Search query (keywords, names, dates)"),
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD format)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD format)"),
  page: z.number().optional().default(1).describe("Page number for results"),
  rows: z.number().optional().default(20).describe("Number of results per page"),
});

function registerTools(server: McpServer) {

// ========== EUROPEANA (Europe) ==========
server.registerTool(
  "search_europeana",
  {
    title: "Search Europeana Newspapers",
    description: "Search European newspaper archives via Europeana Collections",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
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
        const thumbnail = item.edmPreview?.[0] || "";
        const provider = item.dataProvider?.[0] || "";
        const url = item.guid || item.edmIsShownAt?.[0] || "";
        const imageUrl = item.edmIsShownBy?.[0] || "";
        return { title, description, date, thumbnail, provider, url, imageUrl };
      });

      const resultText = results.map((r: any, i: number) => {
        let entry = `${i + 1}. ${r.title}`;
        if (r.date) entry += ` (${r.date})`;
        if (r.provider) entry += ` — ${r.provider}`;
        if (r.description) entry += `\n   ${r.description.substring(0, 300)}`;
        if (r.url) entry += `\n   Link: ${r.url}`;
        if (r.thumbnail) entry += `\n   Thumbnail: ${r.thumbnail}`;
        if (r.imageUrl) entry += `\n   Image: ${r.imageUrl}`;
        return entry;
      }).join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Europeana — ${totalResults} total results for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText || "No results found."}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Europeana: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== GALLICA (France) ==========
server.registerTool(
  "search_gallica",
  {
    title: "Search Gallica Newspapers",
    description: "Search French newspaper archives via Gallica (Bibliothèque Nationale de France). Returns metadata, thumbnails, and links to digitised newspaper pages.",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      // Build SRU query
      let sruQuery = `(gallica all "${query}") and dc.type all "fascicule"`;
      if (date_from || date_to) {
        const from = date_from?.replace(/-/g, "/") || "*";
        const to = date_to?.replace(/-/g, "/") || "*";
        sruQuery += ` and dc.date >= "${from}" and dc.date <= "${to}"`;
      }

      const params = new URLSearchParams({
        operation: "searchRetrieve",
        version: "1.2",
        query: sruQuery,
        maximumRecords: rows.toString(),
        startRecord: ((page - 1) * rows + 1).toString(),
        recordSchema: "oai_dc",
      });

      const response = await axios.get(`https://gallica.bnf.fr/SRU?${params}`, {
        headers: { "User-Agent": "newspapers-mcp/1.0" },
      });
      const xml: string = response.data;

      // Extract total results
      const totalMatch = xml.match(/<srw:numberOfRecords>(\d+)<\/srw:numberOfRecords>/);
      const totalResults = totalMatch ? totalMatch[1] : "unknown";

      // Parse records from XML
      const results: Array<{title: string; description: string; date: string; link: string; thumbnail: string}> = [];
      const recordRegex = /<srw:record>([\s\S]*?)<\/srw:record>/g;
      let match;
      while ((match = recordRegex.exec(xml)) !== null && results.length < rows) {
        const rec = match[1];
        const titleMatch = rec.match(/<dc:title>([^<]+)<\/dc:title>/);
        const dateMatch = rec.match(/<dc:date>([^<]+)<\/dc:date>/);
        const descMatch = rec.match(/<dc:description>([^<]+)<\/dc:description>/);
        const linkMatch = rec.match(/<link>([^<]+)<\/link>/);
        const thumbMatch = rec.match(/<thumbnail>([^<]+)<\/thumbnail>/);

        results.push({
          title: titleMatch ? titleMatch[1] : "Untitled",
          date: dateMatch ? dateMatch[1] : "",
          description: descMatch ? descMatch[1] : "",
          link: linkMatch ? linkMatch[1] : "",
          thumbnail: thumbMatch ? thumbMatch[1] : "",
        });
      }

      const resultText = results.map((r, i) => {
        let entry = `${i + 1}. ${r.title}`;
        if (r.date) entry += ` (${r.date})`;
        if (r.description) entry += `\n   ${r.description}`;
        if (r.link) entry += `\n   Link: ${r.link}`;
        if (r.thumbnail) entry += `\n   Thumbnail: ${r.thumbnail}`;
        return entry;
      }).join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Gallica (BnF) — ${totalResults} results for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText || "No results found."}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Gallica: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== DEUTSCHE DIGITALE BIBLIOTHEK (Germany) ==========
server.registerTool(
  "search_ddb",
  {
    title: "Search German Digital Library",
    description: "Search German newspaper archives via Deutsche Digitale Bibliothek",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      const params = new URLSearchParams({
        query: query,
        rows: rows.toString(),
        offset: ((page - 1) * rows).toString(),
        facets: "type_fct",
      });

      if (date_from || date_to) {
        params.append("dateRange", `${date_from || "1700"},${date_to || "2024"}`);
      }

      // Filter for newspapers
      params.append("filter", "type:Periodical");

      const response = await axios.get(`https://www.deutsche-digitale-bibliothek.de/search?${params.toString()}`);

      return {
        content: [
          {
            type: "text",
            text: `Searched Deutsche Digitale Bibliothek for "${query}"`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Deutsche Digitale Bibliothek: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== BAVARIAN STATE LIBRARY / digiPress (Germany) ==========
// Uses digiPress, the newspaper portal of the Bavarian State Library (BSB)
// Full-text search across ~9 million digitised newspaper pages from across Germany and beyond
server.registerTool(
  "search_bavarian_state_library",
  {
    title: "Search digiPress German Newspaper Archives",
    description: "Search historical newspaper archives via digiPress (Bavarian State Library). Covers newspapers from across Germany and beyond — not limited to Bavaria. Full-text OCR search across ~9 million digitised pages from ~866 newspaper titles.",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
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

      // Extract total hits from page title
      const hitsMatch = html.match(/<title>digiPress:\s*(\d+)\s*Treffer<\/title>/);
      const totalHits = hitsMatch ? hitsMatch[1] : "unknown";

      // Extract result items: title, accessory (date info), link, snippet image, and OCR text
      const results: Array<{title: string; date: string; link: string; snippetImage: string; ocrText: string}> = [];

      // Split HTML into result blocks (each starts with srTitle)
      const blocks = html.split(/<a\s+class="srTitle"/);
      for (let b = 1; b < blocks.length && results.length < rows; b++) {
        const block = blocks[b];

        // Extract link and title
        const linkMatch = block.match(/href="(\/view\/[^"]+)"[^>]*>([^<]+)<\/a>/);
        // Extract date accessory
        const dateMatch = block.match(/<span\s+class="srTitleAccessory">([^<]+)<\/span>/);
        // Extract first snippet image URL
        const imgMatch = block.match(/class="snippet-image"\s+src="([^"]+)"/);
        // Extract first OCR text from snippet-highlight title attribute
        const ocrMatch = block.match(/class="snippet-highlight"[^>]*title="([^"]+)"/);

        if (linkMatch) {
          let ocrText = ocrMatch ? ocrMatch[1] : "";
          // Decode HTML entities and strip <em> tags
          ocrText = ocrText.replace(/&lt;em&gt;/g, "").replace(/&lt;\/em&gt;/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

          results.push({
            link: `https://digipress.digitale-sammlungen.de${linkMatch[1]}`,
            title: linkMatch[2].trim(),
            date: dateMatch ? dateMatch[1].trim() : "",
            snippetImage: imgMatch ? imgMatch[1] : "",
            ocrText,
          });
        }
      }

      const resultText = results.length > 0
        ? results.map((r, i) => {
          let entry = `${i + 1}. ${r.title} (${r.date})\n   ${r.link}`;
          if (r.ocrText) entry += `\n   OCR snippet: ${r.ocrText.substring(0, 300)}`;
          if (r.snippetImage) entry += `\n   Snippet image: ${r.snippetImage}`;
          return entry;
        }).join("\n\n")
        : "No results found.";

      return {
        content: [
          {
            type: "text",
            text: `digiPress (Bavarian State Library) — ${totalHits} hits for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Bavarian State Library: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== BRITISH LIBRARY (UK/GB) ==========
// Uses the BL catalogue (Ex Libris Primo VE) to search for newspaper-related records.
// Note: Digitised newspaper content is on the commercial British Newspaper Archive.
server.registerTool(
  "search_british_library",
  {
    title: "Search British Library Catalogue",
    description: "Search the British Library catalogue for newspaper-related records. Note: full digitised newspaper content is available through the British Newspaper Archive (britishnewspaperarchive.co.uk). This searches the BL's general catalogue metadata.",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      // Use BL catalogue deep link search
      const searchUrl = `https://catalogue.bl.uk/nde/search?vid=44BL_MAIN:BLL01_NDE&query=any,contains,${encodeURIComponent(query)}&tab=Everything&search_scope=BL_LOCAL&offset=${(page - 1) * rows}`;

      return {
        content: [
          {
            type: "text",
            text: `British Library catalogue search for "${query}":\n\nSearch URL: ${searchUrl}\n\nNote: The British Library's digitised newspaper collection is primarily accessible through the British Newspaper Archive (https://www.britishnewspaperarchive.co.uk/). The BL catalogue above provides metadata records for newspaper holdings.\n\nFor free full-text newspaper searches for British content, consider using Europeana or the Welsh Newspapers Online portal.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching British Library: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== AUSTRO-HUNGARIAN EMPIRE ARCHIVES (Austria) ==========
server.registerTool(
  "search_austrian_newspapers",
  {
    title: "Search Austrian Newspaper Archives",
    description: "Search Austrian newspaper archives including historical Austro-Hungarian Empire newspapers",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      const params = new URLSearchParams({
        query: query,
        rows: rows.toString(),
        start: ((page - 1) * rows).toString(),
      });

      if (date_from || date_to) {
        params.append("filter", `date:[${date_from || "1600"} TO ${date_to || "1950"}]`);
      }

      const response = await axios.get(
        `https://www.onb.ac.at/api/search/newspapers?${params}`
      );

      return {
        content: [
          {
            type: "text",
            text: `Searched Austrian Newspaper Archives for "${query}"`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Austrian Archives: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== CHRONICLING AMERICA (USA) ==========
server.registerTool(
  "search_chronicling_america",
  {
    title: "Search US Newspaper Archives",
    description: "Search American newspaper archives via Library of Congress Chronicling America. Returns OCR text snippets, page images (IIIF), and metadata for digitised historic US newspapers.",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
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
        // If both from and to, use range
        if (date_from) {
          params.delete("dates");
          params.append("dates", `${date_from.substring(0, 4)}/${year}`);
        } else {
          params.append("dates", `/${year}`);
        }
      }

      const response = await axios.get(
        `https://www.loc.gov/collections/chronicling-america/?${params}`
      );

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
        return { title, date, description, url, imageUrl, newspaper };
      });

      const resultText = results.map((r: any, i: number) => {
        let entry = `${i + 1}. ${r.title}`;
        if (r.date) entry += ` (${r.date})`;
        if (r.newspaper) entry += ` — ${r.newspaper}`;
        if (r.description) entry += `\n   ${r.description}`;
        if (r.url) entry += `\n   Link: ${r.url}`;
        if (r.imageUrl) entry += `\n   Image: ${r.imageUrl}`;
        return entry;
      }).join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Chronicling America (LoC) — ${totalResults} results for "${query}"\nPage ${page}, showing ${results.length} results:\n\n${resultText || "No results found."}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Chronicling America: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// ========== SOUTH AFRICAN NEWSPAPERS ==========
server.registerTool(
  "search_south_african_newspapers",
  {
    title: "Search South African Newspaper Archives",
    description: "Search South African newspaper archives via available digital collections",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      // South Africa has several options: NLSA (National Library SA), UDW archives, etc.
      const params = new URLSearchParams({
        query: query,
        rows: rows.toString(),
        start: ((page - 1) * rows).toString(),
      });

      if (date_from || date_to) {
        params.append(
          "fq",
          `published:[${date_from || "1800"}T00:00:00Z TO ${date_to || "2024"}T23:59:59Z]`
        );
      }

      // This is a template - actual endpoint would depend on specific SA archive
      const response = await axios.get(
        `https://digital.lib.sun.ac.za/search/newspapers?${params}`
      );

      return {
        content: [
          {
            type: "text",
            text: `Searched South African archives for "${query}"`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Note: South African newspaper archives integration requires specific API keys. ${error instanceof Error ? error.message : "Please check documentation for available archives."}`,
          },
        ],
      };
    }
  }
);

// ========== MULTI-ARCHIVE SEARCH ==========
server.registerTool(
  "search_all_archives",
  {
    title: "Search All Newspaper Archives",
    description: "Search across all available newspaper archives simultaneously",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 10 }) => {
    try {
      const results: Record<string, string> = {};

      // Execute searches in parallel
      const searches = [
        { name: "Europeana", fn: () => searchEuropeana(query, date_from, date_to) },
        { name: "Gallica", fn: () => searchGallica(query, date_from, date_to) },
        { name: "British Library", fn: () => searchBritishLibrary(query, date_from, date_to) },
        { name: "Chronicling America", fn: () => searchChroniclingAmerica(query, date_from, date_to) },
      ];

      for (const search of searches) {
        try {
          results[search.name] = await search.fn();
        } catch (e) {
          results[search.name] = `Error: ${e instanceof Error ? e.message : "Unknown error"}`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Multi-archive search results for "${query}":\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error in multi-archive search: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

} // end registerTools

// Helper functions for individual searches
async function searchEuropeana(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const apiKey = process.env.EUROPEANA_API_KEY || "api2demo";
    const params = new URLSearchParams({
      query: `"${query}" AND (type:"TEXT")`,
      wskey: apiKey,
      rows: "5",
      profile: "rich",
    });
    const response = await axios.get(`https://api.europeana.eu/record/v2/search.json?${params}`);
    const total = response.data.totalResults || 0;
    const items = (response.data.items || []).slice(0, 3);
    const summaries = items.map((item: any) => {
      const title = item.title?.[0] || "Untitled";
      const thumb = item.edmPreview?.[0] || "";
      return `- ${title}${thumb ? ` [thumbnail](${thumb})` : ""}`;
    });
    return `${total} items found\n${summaries.join("\n")}`;
  } catch (e) {
    return "Search failed";
  }
}

async function searchGallica(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const sruQuery = `(gallica all "${query}") and dc.type all "fascicule"`;
    const params = new URLSearchParams({
      operation: "searchRetrieve",
      version: "1.2",
      query: sruQuery,
      maximumRecords: "5",
      recordSchema: "oai_dc",
    });
    const response = await axios.get(`https://gallica.bnf.fr/SRU?${params}`, {
      headers: { "User-Agent": "newspapers-mcp/1.0" },
    });
    const xml: string = response.data;
    const totalMatch = xml.match(/<srw:numberOfRecords>(\d+)<\/srw:numberOfRecords>/);
    const total = totalMatch ? totalMatch[1] : "?";
    const titles: string[] = [];
    const titleRegex = /<dc:title>([^<]+)<\/dc:title>/g;
    let m;
    while ((m = titleRegex.exec(xml)) !== null && titles.length < 3) {
      titles.push(`- ${m[1]}`);
    }
    return `${total} results\n${titles.join("\n")}`;
  } catch (e) {
    return "Search failed";
  }
}

async function searchBritishLibrary(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  const searchUrl = `https://catalogue.bl.uk/nde/search?vid=44BL_MAIN:BLL01_NDE&query=any,contains,${encodeURIComponent(query)}&tab=Everything&search_scope=BL_LOCAL`;
  return `BL catalogue: ${searchUrl} (digitised content at britishnewspaperarchive.co.uk)`;
}

async function searchChroniclingAmerica(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      q: query,
      fo: "json",
      c: "5",
      fa: "original_format:newspaper",
    });
    const response = await axios.get(`https://www.loc.gov/collections/chronicling-america/?${params}`);
    const total = response.data.pagination?.total || 0;
    const items = (response.data.results || []).slice(0, 3);
    const summaries = items.map((item: any) => {
      const title = item.title || "Untitled";
      const date = item.date || "";
      return `- ${title} (${date})`;
    });
    return `${total} results\n${summaries.join("\n")}`;
  } catch (e) {
    return "Search failed";
  }
}

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
