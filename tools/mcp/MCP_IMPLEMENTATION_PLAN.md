# MCP Server Missing Functionality Implementation Plan

## Summary

The MCP server currently has 14 tools and 11 resources. The REST backend has 50+ endpoints. This plan addresses the gap.

## Missing Functionality (Prioritized)

### Phase 1: Quick Wins (5 tools)

| Tool | CommandManager Method | Description |
|------|----------------------|-------------|
| `remove_attachment` | `removeCmd.remove('attachment', cardKey, filename)` | Delete attachment from card |
| `list_labels` | `showCmd.showLabels()` | Get all unique labels in project |
| `rank_card_first` | `moveCmd.rankFirst(cardKey)` | Move card to first position |
| `rank_card_after` | `moveCmd.rankCard(cardKey, afterCardKey)` | Position card after another |
| `rank_card_by_index` | `moveCmd.rankByIndex(cardKey, index)` | Position card at specific index |

### Phase 2: Resource Creation (6 tools)

| Tool | CommandManager Method | Parameters |
|------|----------------------|------------|
| `create_card_type` | `createCmd.createCardType(name, workflow)` | identifier, workflowName |
| `create_field_type` | `createCmd.createFieldType(name, dataType)` | identifier, dataType (enum) |
| `create_workflow` | `createCmd.createWorkflow(name, content)` | identifier |
| `create_link_type` | `createCmd.createLinkType(name)` | identifier |
| `create_template` | `createCmd.createTemplate(name, content)` | identifier |
| `add_template_cards` | `createCmd.addCards(cardType, template, card, count)` | template, cardType, parentKey?, count? |

### Phase 3: Resource Management (3 tools)

| Tool | CommandManager Method | Description |
|------|----------------------|-------------|
| `delete_resource` | `removeCmd.remove(type, name)` | Delete any resource type |
| `validate_resource` | `validateCmd.validateResource(name, project)` | Validate resource |
| `update_resource` | `updateCmd.applyResourceOperation(name, key, op)` | Update resource property |

### Phase 4: Calculations & Queries (6 tools)

| Tool | CommandManager Method | Description |
|------|----------------------|-------------|
| `create_calculation` | `createCmd.createCalculation(name)` | Create calculation definition |
| `run_query` | `calculateCmd.runQuery(name, ctx, opts)` | Run predefined query (tree, card, etc.) |
| `run_logic_program` | `calculateCmd.runLogicProgram(query, ctx)` | Execute custom logic program (Clingo) |
| `create_report` | `createCmd.createReport(name)` | Create report definition |
| `run_report` | `showCmd.showReportResults(...)` | Execute report with params |
| `run_graph` | `calculateCmd.runGraph(model, view, ctx)` | Generate graph visualization |

**Why logic program execution matters**: AI can design and iterate on logic programs (Clingo/ASP) for calculations, validations, and derived fields. Without execution, the AI cannot verify correctness.

### Phase 5: Project Management (4 tools) - Lower Priority

| Tool | Description |
|------|-------------|
| `import_module` | Import module from file or Git |
| `update_modules` | Update all imported modules |
| `remove_module` | Remove imported module |
| `update_project` | Update project settings |

## Files to Modify

| File | Changes |
|------|---------|
| [tools/mcp/src/tools/index.ts](tools/mcp/src/tools/index.ts) | Add all new tool registrations |

## Implementation Pattern

Follow existing pattern in `tools/index.ts`:

```typescript
server.tool(
  'tool_name',
  'Description',
  {
    param: z.string().describe('Description'),
  },
  async ({ param }) => {
    try {
      const result = await commands.cmdCategory.method(param);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, ...result }, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        isError: true,
      };
    }
  },
);
```

## Verification

1. **Build**: `npm run build` in tools/mcp
2. **Test with MCP Inspector**:
   ```bash
   npx @modelcontextprotocol/inspector cyberismo mcp --project-path=/path/to/test/project
   ```
3. **For each new tool**:
   - Verify it appears in Tools tab
   - Execute with valid parameters
   - Verify error handling with invalid parameters
4. **Integration test**: Use Claude Code with MCP server to test real-world usage

## Scope Notes

**Excluded from this plan** (lower priority / less useful for AI):
- `open_attachment` - Opens in system app, not useful for AI
- Export operations (PDF/AsciiDoc) - Requires file system access
- Module import from Git - Requires credentials handling
- Graph model/view creation - Separate from execution, rarely needed by AI
