#!/usr/bin/env node
/**
 * Beads MCP Server
 *
 * Provides MCP tools for interacting with the Beads issue tracker.
 * Beads is a git-based issue tracker designed for coding agents.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const server = new Server(
  {
    name: "beads-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to execute bd commands
async function executeBdCommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const command = `bd ${args.join(' ')}`;
  console.error(`Executing: ${command} in ${cwd || process.cwd()}`);

  try {
    const result = await execAsync(command, {
      cwd: cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    return result;
  } catch (error: any) {
    // bd commands may return non-zero exit codes with useful output
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
    };
  }
}

// Define available tools
const tools: Tool[] = [
  {
    name: "beads_init",
    description: "Initialize Beads in the current directory. Creates .beads directory and database.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Working directory (defaults to current directory)",
        },
      },
    },
  },
  {
    name: "beads_create",
    description: "Create a new issue in Beads. Returns the issue ID.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Issue title (required)",
        },
        priority: {
          type: "string",
          description: "Priority: critical, high, medium, low (default: medium)",
          enum: ["critical", "high", "medium", "low"],
        },
        type: {
          type: "string",
          description: "Issue type: bug, feature, task, question (default: task)",
          enum: ["bug", "feature", "task", "question"],
        },
        body: {
          type: "string",
          description: "Issue description/body",
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "beads_list",
    description: "List issues in Beads. Returns all issues or filter by status/priority/type.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: open, closed",
          enum: ["open", "closed"],
        },
        priority: {
          type: "string",
          description: "Filter by priority",
          enum: ["critical", "high", "medium", "low"],
        },
        type: {
          type: "string",
          description: "Filter by type",
          enum: ["bug", "feature", "task", "question"],
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
    },
  },
  {
    name: "beads_show",
    description: "Show detailed information about a specific issue.",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "Issue ID (e.g., 'abc123' or full hash)",
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
      required: ["issue_id"],
    },
  },
  {
    name: "beads_update",
    description: "Update an issue's fields (status, priority, type, title, or body).",
    inputSchema: {
      type: "object",
      properties: {
        issue_id: {
          type: "string",
          description: "Issue ID to update",
        },
        status: {
          type: "string",
          description: "New status",
          enum: ["open", "closed"],
        },
        priority: {
          type: "string",
          description: "New priority",
          enum: ["critical", "high", "medium", "low"],
        },
        type: {
          type: "string",
          description: "New type",
          enum: ["bug", "feature", "task", "question"],
        },
        title: {
          type: "string",
          description: "New title",
        },
        body: {
          type: "string",
          description: "New body/description",
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
      required: ["issue_id"],
    },
  },
  {
    name: "beads_close",
    description: "Close one or more issues.",
    inputSchema: {
      type: "object",
      properties: {
        issue_ids: {
          type: "array",
          items: { type: "string" },
          description: "Issue IDs to close",
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
      required: ["issue_ids"],
    },
  },
  {
    name: "beads_ready",
    description: "Show issues that are ready to work on (no open blockers).",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
    },
  },
  {
    name: "beads_blocked",
    description: "Show issues that are blocked by other issues.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
    },
  },
  {
    name: "beads_dep_add",
    description: "Add a dependency between two issues. Types: blocks, related, parent, discovered.",
    inputSchema: {
      type: "object",
      properties: {
        from_issue: {
          type: "string",
          description: "Source issue ID",
        },
        to_issue: {
          type: "string",
          description: "Target issue ID",
        },
        dep_type: {
          type: "string",
          description: "Dependency type (default: blocks)",
          enum: ["blocks", "related", "parent", "discovered"],
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
      required: ["from_issue", "to_issue"],
    },
  },
  {
    name: "beads_dep_remove",
    description: "Remove a dependency between two issues.",
    inputSchema: {
      type: "object",
      properties: {
        from_issue: {
          type: "string",
          description: "Source issue ID",
        },
        to_issue: {
          type: "string",
          description: "Target issue ID",
        },
        dep_type: {
          type: "string",
          description: "Dependency type",
          enum: ["blocks", "related", "parent", "discovered"],
        },
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
      required: ["from_issue", "to_issue"],
    },
  },
  {
    name: "beads_stats",
    description: "Show statistics about the Beads database (issue counts, priorities, types).",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Working directory",
        },
      },
    },
  },
];

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const cwd = (args as any)?.cwd;

  try {
    let bdArgs: string[] = [];
    let result: { stdout: string; stderr: string };

    switch (name) {
      case "beads_init":
        bdArgs = ["init"];
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr || "Beads initialized successfully",
            },
          ],
        };

      case "beads_create":
        bdArgs = ["create"];
        if ((args as any).title) bdArgs.push("--title", (args as any).title);
        if ((args as any).priority) bdArgs.push("--priority", (args as any).priority);
        if ((args as any).type) bdArgs.push("--type", (args as any).type);
        if ((args as any).body) bdArgs.push("--body", (args as any).body);
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_list":
        bdArgs = ["list", "--json"];
        if ((args as any).status) bdArgs.push("--status", (args as any).status);
        if ((args as any).priority) bdArgs.push("--priority", (args as any).priority);
        if ((args as any).type) bdArgs.push("--type", (args as any).type);
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_show":
        bdArgs = ["show", (args as any).issue_id, "--json"];
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_update":
        bdArgs = ["update", (args as any).issue_id];
        if ((args as any).status) bdArgs.push("--status", (args as any).status);
        if ((args as any).priority) bdArgs.push("--priority", (args as any).priority);
        if ((args as any).type) bdArgs.push("--type", (args as any).type);
        if ((args as any).title) bdArgs.push("--title", (args as any).title);
        if ((args as any).body) bdArgs.push("--body", (args as any).body);
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_close":
        bdArgs = ["close", ...(args as any).issue_ids];
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_ready":
        bdArgs = ["ready", "--json"];
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_blocked":
        bdArgs = ["blocked", "--json"];
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_dep_add":
        bdArgs = ["dep", "add", (args as any).from_issue, (args as any).to_issue];
        if ((args as any).dep_type) bdArgs.push("--type", (args as any).dep_type);
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_dep_remove":
        bdArgs = ["dep", "remove", (args as any).from_issue, (args as any).to_issue];
        if ((args as any).dep_type) bdArgs.push("--type", (args as any).dep_type);
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      case "beads_stats":
        bdArgs = ["stats", "--json"];
        result = await executeBdCommand(bdArgs, cwd);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr,
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Beads MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
