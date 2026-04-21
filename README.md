# Newspapers MCP Server

An MCP (Model Context Protocol) server for searching online newspaper archives across multiple countries and regions. This server provides unified access to newspaper collections from around the world through a single, standardized interface.

## Supported Archives

| Archive | Region | Source key | Full-text search | OCR text | Snippet images | API key |
|---|---|---|---|---|---|---|
| Europeana Collections | Europe (multi-country) | `europeana` | ✅ | ✅ | ✅ | Optional ([get key](https://pro.europeana.eu/pages/get-api)) |
| Gallica (BnF) | France | `gallica` | ✅ | ✅ | ✅ | None |
| Deutsche Digitale Bibliothek | Germany | `ddb` | ✅ | — | ✅ | None |
| digiPress (BSB) | Germany / Bavaria | `digipress` | ✅ | ✅ | ✅ | None |
| ANNO (Austrian NL) | Austria / Austro-Hungarian Empire | `anno` | ✅ | ✅ | ✅ | None |
| Delpher (KB) | Netherlands | `delpher` | ✅ | ✅ | ✅ | None |
| Chronicling America (LoC) | United States | `chronicling_america` | ✅ | ✅ | ✅ | None |
| eLuxemburgensia (BnL) | Luxembourg | `eluxemburgensia` | ✅ | ✅ | ✅ | None |
| Trove (NLA) | Australia | `trove` | ✅ | ✅ | — | Required (free — [get key](https://trove.nla.gov.au/about/create-something/using-api)) |
| Norwegian NL (nb.no) | Norway | `norwegian` | ✅ | — | — | None |
| DigitalNZ / Papers Past | New Zealand | `digitalnz` | ✅ | ✅ | — | None |
| Internet Archive | Worldwide | `internet_archive` | ✅ | — | — | None |
| British Library | United Kingdom | `british_library` | Links only | — | — | None |
| South African Collections | South Africa | `south_african` | Links only | — | — | None |

## Features

- 🌍 **Multi-region support** - Search across 7+ different newspaper archive systems
- 🔍 **Advanced filtering** - Filter by date range, keywords, and other metadata
- 📄 **Unified interface** - Same API for all supported archives
- ⚡ **Batch search** - Search all archives simultaneously with `search_all_archives`
- 🔐 **Secure** - API keys stored in environment variables

## Installation

### Prerequisites
- Node.js 16 or higher
- npm

### Setup

1. Clone the repository:
```bash
git clone https://github.com/raphink/newspapers-mcp.git
cd newspapers-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env and add your API keys
```

## Configuration

### Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Europeana API Key (https://pro.europeana.eu/pages/get-api)
EUROPEANA_API_KEY=your_api_key_here
```

### Getting API Keys

**Europeana:**
1. Visit https://pro.europeana.eu/pages/get-api
2. Register and apply for an API key
3. Add to `.env` file

Other archives (Gallica, British Library, etc.) are accessible without API keys for basic searches.

## Usage

### Starting the Server

For development:
```bash
npm run dev
```

For production:
```bash
npm run build
node build/index.js
```

### Available Tools

#### 1. Search Europeana
```
search_europeana(query, date_from?, date_to?, page?, rows?)
```
Search European newspaper archives via Europeana Collections.

#### 2. Search Gallica
```
search_gallica(query, date_from?, date_to?, page?, rows?)
```
Search French newspaper archives via Gallica.

#### 3. Search Deutsche Digitale Bibliothek
```
search_ddb(query, date_from?, date_to?, page?, rows?)
```
Search German newspaper archives.

#### 4. Search Bavarian State Library
```
search_bavarian_state_library(query, date_from?, date_to?, page?, rows?)
```
Search Bavarian newspaper archives including regional collections.

#### 5. Search British Library
```
search_british_library(query, date_from?, date_to?, page?, rows?)
```
Search British newspaper archives.

#### 6. Search Austrian Archives
```
search_austrian_newspapers(query, date_from?, date_to?, page?, rows?)
```
Search Austrian newspaper archives including Austro-Hungarian Empire collections.

#### 7. Search Chronicling America
```
search_chronicling_america(query, date_from?, date_to?, page?, rows?)
```
Search American newspaper archives via Library of Congress.

#### 8. Search South African Archives
```
search_south_african_newspapers(query, date_from?, date_to?, page?, rows?)
```
Search South African newspaper archives.

#### 9. Search All Archives
```
search_all_archives(query, date_from?, date_to?, page?, rows?)
```
Simultaneously search across all available newspaper archives.

### Parameters

- **query** (required): Search query (keywords, names, dates, etc.)
- **date_from** (optional): Start date in YYYY-MM-DD format
- **date_to** (optional): End date in YYYY-MM-DD format
- **page** (optional): Page number for paginated results (default: 1)
- **rows** (optional): Number of results per page (default: 20)

## Integration with Claude Desktop

To use this MCP server with Claude for Desktop:

1. Build the server:
```bash
npm run build
```

2. Edit your Claude Desktop configuration file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

3. Add the server configuration:
```json
{
  "mcpServers": {
    "newspapers-mcp": {
      "command": "node",
      "args": ["/path/to/newspapers-mcp/build/index.js"]
    }
  }
}
```

4. Restart Claude for Desktop

5. The server should now appear as an available tool in Claude

## Development

### Watch Mode
```bash
npm run watch
```

### Project Structure
```
newspapers-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript (generated)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .env.example          # Environment variables template
└── README.md             # This file
```

## API Reference

### Request Format

All tools follow the standard MCP format:
```json
{
  "tool": "search_europeana",
  "input": {
    "query": "Napoleon",
    "date_from": "1800-01-01",
    "date_to": "1850-12-31"
  }
}
```

### Response Format

Success response:
```json
{
  "type": "text",
  "text": "Found results: ..."
}
```

Error response:
```json
{
  "type": "text",
  "text": "Error: ..."
}
```

## Archives Details

### Europeana
- Coverage: Multiple European countries
- Time period: Medieval to contemporary
- Collections: Newspapers, magazines, journals
- API: RESTful JSON API

### Gallica (French National Library)
- Coverage: France and French-speaking regions
- Time period: 16th century to present
- Collections: ~1.7 million digitized documents
- Type: Newspapers, manuscripts, maps, prints

### Deutsche Digitale Bibliothek
- Coverage: Germany
- Institutions: 10,000+ German institutions
- Collections: Newspapers, manuscripts, images
- Free access to all materials

### Bavarian State Library
- Coverage: Bavaria and related regions
- Time period: Medieval to 20th century
- Specialties: Bavarian regional newspapers
- German imperial court documents

### British Library
- Coverage: UK, Ireland, and former Commonwealth
- Time period: 1600s to present
- Collections: Millions of newspapers and magazines
- Major newspapers: The Times, The Guardian archives

### Austrian National Library
- Coverage: Austria and former Austro-Hungarian Empire
- Time period: 1400s to present
- Specialties: Historical Austrian and imperial newspapers
- Languages: German, Czech, Polish, and other regional languages

### Chronicling America
- Coverage: United States (all 50 states)
- Time period: 1690-2023
- Coverage: Over 20 million newspaper pages
- API: Open and free to use

### South African Collections
- Coverage: South Africa
- Time period: 1800s to present
- Collections: Varied - multiple institutions

## Error Handling

The server handles errors gracefully:
- Network timeouts
- Invalid API responses
- Missing API keys (graceful degradation)
- Malformed requests

All errors are returned with descriptive messages.

## Performance Considerations

- Search results are paginated to avoid overwhelming responses
- Default page size is 20 results; adjust as needed
- Multi-archive searches run in parallel for speed
- Caching is not implemented; results are fresh

## Limitations

- Some archives require specific API keys
- Rate limiting may apply to some APIs
- Not all archives support all filter types
- Some archives may have region-specific access restrictions

## Roadmap

- [ ] Add more regional European archives
- [ ] Integrate with additional Asian newspaper archives
- [ ] Add OCR confidence scoring where available
- [ ] Implement caching for frequently searched terms
- [ ] Add support for full-text search across some archives
- [ ] Create specialized search templates

## Contributing

Contributions are welcome! Areas for contribution:
- Adding new archive integrations
- Improving error handling
- Adding more search filters
- Documentation improvements

## License

MIT

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Europeana API](https://pro.europeana.eu/pages/get-api)
- [Gallica Documentation](https://gallica.bnf.fr/)
- [British Library API](https://www.bl.uk/collection-guides/digital-collections)
- [Chronicling America](https://chroniclingamerica.loc.gov/)

## Support

For issues or questions:
1. Check the GitHub issues page
2. Review the documentation
3. Open a new issue with detailed information

## Acknowledgments

- Model Context Protocol by Anthropic
- All participating digital library institutions
- Open-source libraries (axios, zod, TypeScript SDK)
