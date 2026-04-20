<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Newspapers MCP Server - Project Setup Guide

## Overview
This is an MCP (Model Context Protocol) server for searching newspaper archives across multiple countries and regions. It provides unified access to newspaper collections through standardized tools.

## Prerequisites
- Node.js 16 or higher
- npm 7+
- TypeScript knowledge (helpful but not required)
- MCP SDK familiarity (optional)

## Project Setup Checklist

- [x] **Verify Project Structure**
  - Project layout follows MCP TypeScript server standards
  - Source code in `src/index.ts`
  - Configuration files in place

- [ ] **Install Dependencies**
  Run: `npm install`
  This installs the MCP SDK, TypeScript, and other dependencies.

- [ ] **Build the Project**
  Run: `npm run build`
  This compiles TypeScript to JavaScript in the `build/` directory.

- [ ] **Configure Environment**
  1. Copy `.env.example` to `.env`
  2. Add your API keys (see README for instructions)
  3. Currently only Europeana API key is configurable

- [ ] **Test the Server**
  Run: `npm run dev`
  This builds and starts the server on stdio transport.

## Available Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install all dependencies |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch mode for development |
| `npm run dev` | Build and run the server |
| `npm run test` | Run tests (if configured) |

## Supported Newspaper Archives

1. **Europeana** (Europe) - Multiple European countries
2. **Gallica** (France) - French National Library
3. **Deutsche Digitale Bibliothek** (Germany)
4. **Bavarian State Library** (Bavaria)
5. **British Library** (UK/GB)
6. **Austrian National Library** (Austria + Austro-Hungarian Empire)
7. **Chronicling America** (USA)
8. **South African Collections** (South Africa)

## Key Features

- 🔍 Search across 8 different newspaper archive systems
- 📅 Filter by date ranges
- 🌍 Multi-region support
- ⚡ Batch search all archives simultaneously
- 🔐 Secure API key management

## MCP Tools Available

1. `search_europeana` - Search European newspapers
2. `search_gallica` - Search French newspapers
3. `search_ddb` - Search German newspapers
4. `search_bavarian_state_library` - Search Bavarian newspapers
5. `search_british_library` - Search British newspapers
6. `search_austrian_newspapers` - Search Austrian newspapers
7. `search_chronicling_america` - Search US newspapers
8. `search_south_african_newspapers` - Search South African newspapers
9. `search_all_archives` - Search all archives simultaneously

## Integration with Claude Desktop

After building, configure in Claude Desktop:

1. macOS: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Windows: Edit `%APPDATA%\Claude\claude_desktop_config.json`

Add:
```json
{
  "mcpServers": {
    "newspapers-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"]
    }
  }
}
```

3. Restart Claude Desktop
4. The server should appear as available tools

## Development Tips

### File Structure
- **src/index.ts** - Main server implementation with all tools
- **package.json** - Dependencies and scripts
- **tsconfig.json** - TypeScript configuration
- **README.md** - Comprehensive documentation

### Code Organization
- Tools are registered in sequence using `server.registerTool()`
- Each tool has a description, schema, and async handler
- Helper functions support multi-archive searches
- Error handling is implemented for all searches

### Extending the Server

To add a new newspaper archive:

1. Create a new `server.registerTool()` block
2. Define the schema (copy from existing tools)
3. Implement the API calls using axios
4. Add error handling
5. Test the tool
6. Update README with new archive info

Example structure:
```typescript
server.registerTool(
  "tool_name",
  {
    title: "Tool Title",
    description: "Tool description",
    inputSchema: searchSchema,
  },
  async ({ query, date_from, date_to, page = 1, rows = 20 }) => {
    try {
      // Implement search
      return {
        content: [{ type: "text", text: "Results..." }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error}` }],
      };
    }
  }
);
```

## Next Steps

1. Run `npm install` to install dependencies
2. Copy `.env.example` to `.env`
3. Optionally add your Europeana API key
4. Run `npm run build` to compile
5. Test with `npm run dev`
6. Integrate with Claude Desktop using mcp.json

## Documentation

- **README.md** - Complete project documentation
- **MCP Spec** - https://modelcontextprotocol.io/
- **TypeScript SDK** - https://github.com/modelcontextprotocol/typescript-sdk

## Troubleshooting

**Build fails:**
- Ensure Node.js 16+ is installed
- Run `npm install` again
- Check tsconfig.json is valid

**Server won't start:**
- Check for syntax errors in src/index.ts
- Ensure all imports are correct
- Check console for detailed error messages

**API calls failing:**
- Check internet connection
- Verify API endpoints are accessible
- Check API key configuration for Europeana

## Next Work Items

- [ ] Add more archive integrations
- [ ] Implement caching layer
- [ ] Add OCR confidence filtering
- [ ] Create specialized search templates
- [ ] Add test suite
- [ ] Performance optimization
- [ ] Documentation improvements
