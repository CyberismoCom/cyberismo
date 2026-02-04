# Cyberismo MCP Server

The Model Context Protocol (MCP) server allows AI assistants like Claude to interact directly with Cyberismo projects - reading cards, creating content, managing workflows, and more.

## Quick Start (HTTP)

The recommended approach is to use the HTTP MCP server, which runs as part of the Cyberismo backend:

```bash
# Start the backend with MCP support
cyberismo app
```

The MCP endpoint is now available at `http://localhost:3000/mcp`.

---

## Configuring Claude Code (HTTP)

Add the HTTP MCP server to your Claude Code settings. Create or edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cyberismo": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

After configuration, restart Claude Code. The Cyberismo tools will be available to Claude.

**Note**: Ensure the Cyberismo backend is running (`cyberismo app`) before starting Claude Code.

---

## Configuring VS Code with GitHub Copilot (HTTP)

For VS Code with the Copilot extension, add MCP server configuration to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "cyberismo": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

After configuration, reload VS Code. Copilot Chat will have access to Cyberismo tools.

---

## HTTP Protocol Details

The HTTP transport uses Server-Sent Events (SSE) for streaming:

| Method | Path   | Description                                      |
| ------ | ------ | ------------------------------------------------ |
| POST   | `/mcp` | Send MCP messages (initialize, tool calls, etc.) |
| GET    | `/mcp` | SSE streaming for server-to-client messages      |
| DELETE | `/mcp` | Close session                                    |

Sessions are managed via the `mcp-session-id` header returned after initialization.

### Custom Port

To run on a different port:

```bash
PORT=4000 cyberismo app
```

Then update your MCP configuration to use `http://localhost:4000/mcp`.

---

## Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is an interactive debugging tool for MCP servers.

### Testing the HTTP Server

Start the Cyberismo backend first, then run:

```bash
npx @modelcontextprotocol/inspector --server-url http://localhost:3000/mcp
```

This opens a web UI where you can:

- View available tools and resources
- Execute tools interactively
- Inspect request/response payloads
- Debug MCP communication

### Inspector Features

- **Tools Tab**: List all available tools, view their schemas, and execute them with custom parameters
- **Resources Tab**: Browse available resources and read their contents
- **Logs Tab**: View the raw MCP protocol messages for debugging

---

## Available Tools

The MCP server exposes the following tools:

### Card Operations

| Tool                 | Description                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| `get_card`           | Get detailed card info including rendered content, transitions, and field metadata |
| `list_cards`         | List all cards in the project hierarchy                                            |
| `create_card`        | Create a new card from a template                                                  |
| `edit_card_content`  | Update the AsciiDoc content of a card                                              |
| `edit_card_metadata` | Update a metadata field                                                            |
| `remove_card`        | Delete a card and its children                                                     |
| `move_card`          | Move a card to a new parent                                                        |
| `transition_card`    | Transition a card to a new workflow state                                          |

### Labels & Links

| Tool           | Description                     |
| -------------- | ------------------------------- |
| `create_label` | Add a label to a card           |
| `remove_label` | Remove a label from a card      |
| `create_link`  | Create a link between two cards |
| `remove_link`  | Remove a link between cards     |

### Attachments & Templates

| Tool                | Description                                 |
| ------------------- | ------------------------------------------- |
| `create_attachment` | Add an attachment to a card (max 10MB)      |
| `list_templates`    | List available templates for creating cards |

---

## Available Resources

Resources provide read-only access to project data:

| Resource     | URI                    | Description                   |
| ------------ | ---------------------- | ----------------------------- |
| Project info | `file:///project`      | Project metadata and settings |
| Card types   | `file:///card-types`   | All card type definitions     |
| Workflows    | `file:///workflows`    | All workflow definitions      |
| Field types  | `file:///field-types`  | All field type definitions    |
| Link types   | `file:///link-types`   | All link type definitions     |
| Templates    | `file:///templates`    | All template definitions      |
| Calculations | `file:///calculations` | All calculation definitions   |
| Reports      | `file:///reports`      | All report definitions        |

---

## Example Usage

Once configured, you can ask Claude or Copilot to interact with your Cyberismo project:

```
"List all the cards in the project"
"Create a new page card with the title 'Security Assessment'"
"Show me the details of card proj_abc123"
"Transition card proj_abc123 to 'In Review'"
"Add a label 'urgent' to card proj_abc123"
"What templates are available?"
```

---

## Standalone MCP Server (stdio)

For local development or when the HTTP server is not available, you can run the MCP server as a subprocess communicating via stdin/stdout.

### Running Manually

```bash
# With auto-detection (run from within a Cyberismo project)
cyberismo mcp

# With explicit project path
cyberismo mcp --project-path=/path/to/your/project

# Using environment variable
CYBERISMO_PROJECT_PATH=/path/to/your/project cyberismo mcp
```

### Configuring Claude Code (stdio)

```json
{
  "mcpServers": {
    "cyberismo": {
      "command": "cyberismo",
      "args": ["mcp", "--project-path=/path/to/your/project"]
    }
  }
}
```

### Configuring VS Code (stdio)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "cyberismo": {
      "command": "cyberismo",
      "args": ["mcp", "--project-path=${workspaceFolder}"]
    }
  }
}
```

### Testing with MCP Inspector (stdio)

```bash
npx @modelcontextprotocol/inspector cyberismo mcp --project-path=/path/to/project
```

---

## Troubleshooting

### HTTP endpoint not responding

1. Ensure the backend is running: `cyberismo app`
2. Check the port (default 3000) isn't in use
3. Verify the URL in your MCP configuration matches the server
4. Check CORS settings if accessing from a different origin

### Tools not appearing

1. Restart Claude Code or VS Code after configuration changes
2. Check the config file path and JSON syntax
3. For HTTP: verify the backend is running and accessible

### Server not starting (stdio)

1. Ensure `cyberismo` is installed and in your PATH
2. Check the project path exists and contains a `.cards` directory
3. Try running `cyberismo mcp` manually to see error messages

### MCP Inspector connection issues

1. For HTTP: Ensure the server is running before starting inspector
2. For stdio: Check the command and arguments are correct
3. Look at the inspector's console output for error messages
