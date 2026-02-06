# Cyberismo MCP Server

The Model Context Protocol (MCP) server allows AI assistants like Claude to interact directly with Cyberismo projects - reading cards, creating content, managing workflows, and more.

## Overview

There are two ways to run the MCP server:

1. **Standalone (stdio)** - Runs as a subprocess, communicating via stdin/stdout. Best for local development with Claude Code or VS Code.

2. **HTTP** - Runs as part of the Cyberismo backend server. Best for web-based integrations or when you need multiple clients.

---

## Standalone MCP Server (stdio)

The standalone server runs as a subprocess and communicates via stdio. This is the recommended approach for Claude Code and VS Code Copilot.

### Running Manually

```bash
# With auto-detection (run from within a Cyberismo project)
cyberismo mcp

# With explicit project path
cyberismo mcp --project-path=/path/to/your/project

# Using environment variable
CYBERISMO_PROJECT_PATH=/path/to/your/project cyberismo mcp
```

---

## Configuring Claude Code

Add the MCP server to your Claude Code settings. Create or edit `~/.claude/claude_desktop_config.json`:

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

Or use environment variables:

```json
{
  "mcpServers": {
    "cyberismo": {
      "command": "cyberismo",
      "args": ["mcp"],
      "env": {
        "CYBERISMO_PROJECT_PATH": "/path/to/your/project"
      }
    }
  }
}
```

After configuration, restart Claude Code. The Cyberismo tools will be available to Claude.

---

## Configuring VS Code with GitHub Copilot

For VS Code with the Copilot extension, add MCP server configuration to your VS Code settings.

### Option 1: Workspace Settings

Create `.vscode/settings.json` in your project:

```json
{
  "github.copilot.chat.mcpServers": {
    "cyberismo": {
      "command": "cyberismo",
      "args": ["mcp", "--project-path=${workspaceFolder}"]
    }
  }
}
```

### Option 2: User Settings

Add to your VS Code user settings (`settings.json`):

```json
{
  "github.copilot.chat.mcpServers": {
    "cyberismo": {
      "command": "cyberismo",
      "args": ["mcp", "--project-path=/path/to/your/project"]
    }
  }
}
```

After configuration, reload VS Code. Copilot Chat will have access to Cyberismo tools.

---

## HTTP MCP Server

The HTTP variant runs as part of the Cyberismo backend and exposes an MCP endpoint at `/mcp`.

### Starting the Backend

```bash
cyberismo app
```

The MCP endpoint will be available at `http://localhost:3000/mcp` (or your configured port).

### HTTP Protocol

The HTTP transport uses:
- **POST** `/mcp` - Send MCP messages (initialize, tool calls, etc.)
- **GET** `/mcp` - SSE streaming for server-to-client messages
- **DELETE** `/mcp` - Close session

Sessions are managed via the `mcp-session-id` header.

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

### Testing the Standalone Server

For the stdio-based server:

```bash
npx @modelcontextprotocol/inspector cyberismo mcp --project-path=/path/to/project
```

### Inspector Features

- **Tools Tab**: List all available tools, view their schemas, and execute them with custom parameters
- **Resources Tab**: Browse available resources and read their contents
- **Logs Tab**: View the raw MCP protocol messages for debugging

---

## Available Tools

The MCP server exposes the following tools:

### Card Operations
| Tool | Description |
|------|-------------|
| `get_card` | Get detailed card info including rendered content, transitions, and field metadata |
| `list_cards` | List all cards in the project hierarchy |
| `create_card` | Create a new card from a template |
| `edit_card_content` | Update the AsciiDoc content of a card |
| `edit_card_metadata` | Update a metadata field |
| `remove_card` | Delete a card and its children |
| `move_card` | Move a card to a new parent |
| `transition_card` | Transition a card to a new workflow state |

### Labels & Links
| Tool | Description |
|------|-------------|
| `create_label` | Add a label to a card |
| `remove_label` | Remove a label from a card |
| `create_link` | Create a link between two cards |
| `remove_link` | Remove a link between cards |

### Attachments & Templates
| Tool | Description |
|------|-------------|
| `create_attachment` | Add an attachment to a card (max 10MB) |
| `list_templates` | List available templates for creating cards |

---

## Available Resources

Resources provide read-only access to project data:

| Resource | URI | Description |
|----------|-----|-------------|
| Project info | `cyberismo://project` | Project metadata and settings |
| Card types | `cyberismo://cardTypes` | All card type definitions |
| Workflows | `cyberismo://workflows` | All workflow definitions |
| Field types | `cyberismo://fieldTypes` | All field type definitions |
| Link types | `cyberismo://linkTypes` | All link type definitions |
| Templates | `cyberismo://templates` | All template definitions |

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

## Troubleshooting

### Server not starting

1. Ensure `cyberismo` is installed and in your PATH
2. Check the project path exists and contains a `.cards` directory
3. Try running `cyberismo mcp` manually to see error messages

### Tools not appearing

1. Restart Claude Code or VS Code after configuration changes
2. Check the config file path and JSON syntax
3. Verify `cyberismo` is accessible from the shell

### HTTP endpoint not responding

1. Ensure the backend is running: `cyberismo app`
2. Check the port (default 3000) isn't in use
3. Verify CORS settings if accessing from a different origin

### MCP Inspector connection issues

1. For HTTP: Ensure the server is running before starting inspector
2. For stdio: Check the command and arguments are correct
3. Look at the inspector's console output for error messages
