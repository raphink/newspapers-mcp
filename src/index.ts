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
import {
  searchEuropeanaFull,
  searchGallicaFull,
  searchDdbFull,
  searchDigipressFull,
  searchBritishLibraryFull,
  searchAnnoFull,
  searchChroniclingAmericaFull,
  searchSouthAfricanFull,
  searchDelpherFull,
} from "./providers/index.js";

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
    "delpher",
    "chronicling_america",
    "south_african",
  ]).default("all").describe("Which newspaper archive to search. Use 'all' to search all archives simultaneously."),
  query: z.string().describe("Search query (keywords, names, dates)"),
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD format)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD format)"),
  page: z.number().optional().default(1).describe("Page number for results"),
  rows: z.number().optional().default(20).describe("Number of results per page"),
});

function registerTools(server: McpServer) {

// ========== UNIFIED NEWSPAPER SEARCH ==========
server.registerTool(
  "search_newspapers",
  {
    title: "Search Newspaper Archives",
    description: "Search historical newspaper archives across multiple countries. Sources: europeana (Europe-wide), gallica (France/BnF, full-text OCR with page-level results & IIIF images), ddb (Germany/DDB, 180K+ newspaper issues with thumbnails), digipress (Germany/BSB, ~866 titles with OCR snippets & IIIF images), british_library (UK catalogue), anno (Austria/ANNO, 28M+ pages, 1600+ titles with OCR snippets & images), delpher (Netherlands/KB, 2M+ newspapers 1618–1995 with OCR), chronicling_america (USA/Library of Congress with OCR & images), south_african (links only). Use source='all' to search all simultaneously.",
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
          { name: "Delpher", fn: () => searchDelpherFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "DDB", fn: () => searchDdbFull(query, date_from, date_to, page, Math.min(rows, 5)) },
          { name: "British Library", fn: () => searchBritishLibraryFull(query, date_from, date_to, page, rows) },
        ];

        const settled = await Promise.allSettled(archives.map(a => a.fn()));
        const sections = settled.map((r, i) =>
          r.status === "fulfilled" ? r.value : `${archives[i].name}: Error — ${r.reason instanceof Error ? r.reason.message : "Unknown error"}`
        );

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
        case "delpher":
          result = await searchDelpherFull(query, date_from, date_to, page, rows);
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
    description: "Fetch a newspaper snippet image and return it as base64. Use with snippet coordinates from search results. Supported sources: digipress, chronicling_america, gallica, europeana, anno, delpher, ddb.",
    inputSchema: z.object({
      source: z.enum(["digipress", "chronicling_america", "gallica", "europeana", "anno", "delpher", "ddb"])
        .describe("The archive source (digipress, chronicling_america, gallica, europeana, anno, delpher, ddb)"),
      document_id: z.string()
        .describe("Document/page identifier from the archive (e.g. 'bsb10001591_00035' for digiPress, 'service:ndnp:...:0003' for Chronicling America, 'bpt6k5460422k/f173' for Gallica, full imageURL for ANNO, 'ddd:...:mpeg21:p010' for Delpher, UUID for DDB)"),
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
        case "anno": {
          // ANNO snippet imageURLs are complete URLs from the snippet API — validate domain
          const annoUrl = new URL(document_id);
          if (annoUrl.hostname !== "anno.onb.ac.at") {
            throw new Error("Invalid ANNO image URL: must be from anno.onb.ac.at");
          }
          imageUrl = document_id;
          break;
        }
        case "delpher":
          // KB Netherlands resolver returns JP2 page images
          imageUrl = `https://resolver.kb.nl/resolve?urn=${encodeURIComponent(document_id)}:image`;
          break;
        case "ddb":
          // DDB binary endpoint returns thumbnails/images by UUID
          imageUrl = `https://api.deutsche-digitale-bibliothek.de/binary/${encodeURIComponent(document_id)}`;
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
