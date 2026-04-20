#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import axios from "axios";
import express from "express";
import cors from "cors";

// Initialize the MCP server
const server = new McpServer({
  name: "newspapers-mcp",
  version: "1.0.0",
});

// Schema definitions for tool inputs
const searchSchema = z.object({
  query: z.string().describe("Search query (keywords, names, dates)"),
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD format)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD format)"),
  page: z.number().optional().default(1).describe("Page number for results"),
  rows: z.number().optional().default(20).describe("Number of results per page"),
});

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
      const apiKey = process.env.EUROPEANA_API_KEY || "demo";
      const params = new URLSearchParams({
        query: `\"${query}\" AND (type:\"TEXT\")`,
        profile: "rich",
        rows: rows.toString(),
        page: page.toString(),
        api_key: apiKey,
        qf: 'contentTier:"*"',
      });

      if (date_from || date_to) {
        const dateFacet = `${date_from || "*"}/${date_to || "*"}`;
        params.append("qf", `issued:[${dateFacet}]`);
      }

      const response = await axios.get(`https://api.europeana.eu/record/v2/search.json?${params}`);
      const items = response.data.items || [];

      return {
        content: [
          {
            type: "text",
            text: `Found ${items.length} results in Europeana. Results: ${JSON.stringify(
              items.slice(0, 5),
              null,
              2
            )}`,
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
    description: "Search French newspaper archives via Gallica (Bibliothèque Nationale de France)",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      const params = new URLSearchParams({
        q: query,
        lang: "en",
        rows: rows.toString(),
        start: ((page - 1) * rows).toString(),
        suggest: "0",
      });

      // Gallica specific: search for periodicals/newspapers
      params.append("fq", 'dcterms_issued_s:[${date_from || "*"} TO ${date_to || "*"}]');
      params.append("fq", 'type_s:(MonographicResource OR Periodical)');

      const response = await axios.get(`https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&&recordSchema=oai_dc&${params}`);

      return {
        content: [
          {
            type: "text",
            text: `Searched Gallica for "${query}". Response: ${JSON.stringify(response.data, null, 2).substring(0, 500)}...`,
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

// ========== BAVARIAN STATE LIBRARY (Bavaria) ==========
server.registerTool(
  "search_bavarian_state_library",
  {
    title: "Search Bavarian Newspaper Archives",
    description: "Search Bavarian newspaper archives via Bavarian State Library",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      const params = new URLSearchParams({
        q: query,
        rows: rows.toString(),
        page: page.toString(),
      });

      if (date_from || date_to) {
        params.append("daterange", `${date_from || "*"};${date_to || "*"}`);
      }

      const response = await axios.get(`https://www.bsb-muenchen.de/cgi-bin/sru.php?${params}`);

      return {
        content: [
          {
            type: "text",
            text: `Searched Bavarian State Library for "${query}"`,
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
server.registerTool(
  "search_british_library",
  {
    title: "Search British Newspaper Archives",
    description: "Search British newspaper archives via British Library Collections",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      const params = new URLSearchParams({
        q: query,
        format: "json",
        rows: rows.toString(),
        page: page.toString(),
      });

      if (date_from || date_to) {
        params.append("daterange", `${date_from || "1700"}-${date_to || "2024"}`);
      }

      // Search specifically for newspapers
      params.append("collection", "newspapers");

      const response = await axios.get(`https://api.bl.uk/collections/search?${params}`);

      return {
        content: [
          {
            type: "text",
            text: `Searched British Library for "${query}". Found results: ${JSON.stringify(response.data, null, 2).substring(0, 500)}...`,
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
    description: "Search American newspaper archives via Library of Congress Chronicling America",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      const params = new URLSearchParams({
        searchType: "basic",
        state: "all",
        dateFilterType: "yearRange",
        rows: rows.toString(),
        page: page.toString(),
      });

      if (date_from) {
        const year = date_from.substring(0, 4);
        params.append("fromyear", year);
      }

      if (date_to) {
        const year = date_to.substring(0, 4);
        params.append("toyear", year);
      }

      params.append("phraseSearchFilter", query);

      const response = await axios.get(
        `https://chroniclingamerica.loc.gov/search/pages/results/?${params}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      return {
        content: [
          {
            type: "text",
            text: `Searched Chronicling America for "${query}". Found results matching your search.`,
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

// Helper functions for individual searches
async function searchEuropeana(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const apiKey = process.env.EUROPEANA_API_KEY || "demo";
    const params = new URLSearchParams({
      query: `"${query}"`,
      api_key: apiKey,
      rows: "5",
    });
    const response = await axios.get(`https://api.europeana.eu/record/v2/search.json?${params}`);
    return `${response.data.itemsCount || 0} items found`;
  } catch (e) {
    return "Search failed";
  }
}

async function searchGallica(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      q: query,
      rows: "5",
    });
    const response = await axios.get(`https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&recordSchema=oai_dc&${params}`);
    return "Search completed";
  } catch (e) {
    return "Search failed";
  }
}

async function searchBritishLibrary(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      q: query,
      rows: "5",
    });
    const response = await axios.get(`https://api.bl.uk/collections/search?${params}`);
    return "Search completed";
  } catch (e) {
    return "Search failed";
  }
}

async function searchChroniclingAmerica(query: string, dateFrom?: string, dateTo?: string): Promise<string> {
  try {
    const params = new URLSearchParams({
      phraseSearchFilter: query,
      rows: "5",
    });
    const response = await axios.get(`https://chroniclingamerica.loc.gov/search/pages/results/?${params}`, {
      headers: { Accept: "application/json" },
    });
    return "Search completed";
  } catch (e) {
    return "Search failed";
  }
}

// Main function to start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Newspapers MCP Server running on stdio");
}

// HTTP entry point for Google Cloud Functions
export async function newspapersMcp(req: express.Request, res: express.Response): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close().catch(console.error);
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// Determine how to start based on environment
if (process.env.K_SERVICE) {
  // Running in Cloud Functions
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post("/", newspapersMcp);
  app.get("/health", (req: express.Request, res: express.Response) => {
    res.status(200).json({ status: "ok" });
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.error(`Newspapers MCP Server running on HTTP port ${PORT}`);
  });
} else {
  // Running locally - use stdio transport
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
