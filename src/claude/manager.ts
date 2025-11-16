import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { EmbedBuilder } from "discord.js";
import type { SDKMessage } from "../types/index.js";
import { buildClaudeCommand, type DiscordContext } from "../utils/shell.js";
import { DatabaseManager } from "../db/database.js";
import { handleScreenshotDetection } from "../services/screenshot.js";

/**
 * Truncate text to fit Discord embed description limit (4096 characters)
 */
function truncateForEmbed(text: string, maxLength: number = 4096): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 50) + '\n...\n[Message truncated]';
}

export class ClaudeManager {
  private db: DatabaseManager;
  private channelMessages = new Map<string, any>();
  private channelToolCalls = new Map<string, Map<string, { message: any, toolId: string }>>();
  private channelNames = new Map<string, string>();
  private channelUserIds = new Map<string, string>();
  private channelProgressMessages = new Map<string, any>();
  private channelProgressState = new Map<string, {
    init?: string;
    assistant?: string;
    tools: string[];
    status: 'running' | 'complete' | 'failed' | 'timeout';
  }>();
  private channelProcesses = new Map<
    string,
    {
      process: any;
      sessionId?: string;
      discordMessage: any;
    }
  >();

  constructor(private baseFolder: string) {
    this.db = new DatabaseManager();
    // Clean up old sessions on startup
    this.db.cleanupOldSessions();
  }

  hasActiveProcess(channelId: string): boolean {
    return this.channelProcesses.has(channelId);
  }

  killActiveProcess(channelId: string): void {
    const activeProcess = this.channelProcesses.get(channelId);
    if (activeProcess?.process) {
      console.log(`Killing active process for channel ${channelId}`);
      activeProcess.process.kill("SIGTERM");
    }
  }

  clearSession(channelId: string): void {
    this.killActiveProcess(channelId);
    this.db.clearSession(channelId);
    this.channelMessages.delete(channelId);
    this.channelToolCalls.delete(channelId);
    this.channelNames.delete(channelId);
    this.channelProcesses.delete(channelId);
    this.channelProgressMessages.delete(channelId);
    this.channelProgressState.delete(channelId);
  }

  setDiscordMessage(channelId: string, message: any): void {
    this.channelMessages.set(channelId, message);
    this.channelToolCalls.set(channelId, new Map());
  }

  reserveChannel(
    channelId: string,
    sessionId: string | undefined,
    discordMessage: any
  ): void {
    // Kill any existing process (safety measure)
    const existingProcess = this.channelProcesses.get(channelId);
    if (existingProcess?.process) {
      console.log(
        `Killing existing process for channel ${channelId} before starting new one`
      );
      existingProcess.process.kill("SIGTERM");
    }

    // Reserve the channel by adding a placeholder entry (prevents race conditions)
    this.channelProcesses.set(channelId, {
      process: null, // Will be set when process actually starts
      sessionId,
      discordMessage,
    });
  }

  getSessionId(channelId: string): string | undefined {
    return this.db.getSession(channelId);
  }

  async runClaudeCode(
    channelId: string,
    channelName: string,
    prompt: string,
    sessionId?: string,
    discordContext?: DiscordContext
  ): Promise<void> {
    // Store the channel name and user ID for mentions
    this.channelNames.set(channelId, channelName);
    if (discordContext?.userId) {
      this.channelUserIds.set(channelId, discordContext.userId);
    }
    const workingDir = path.join(this.baseFolder, channelName);
    console.log(`Running Claude Code in: ${workingDir}`);

    // Check if working directory exists
    if (!fs.existsSync(workingDir)) {
      throw new Error(`Working directory does not exist: ${workingDir}`);
    }

    const commandString = buildClaudeCommand(workingDir, prompt, sessionId, discordContext);
    console.log(`Running command: ${commandString}`);

    const claude = spawn("/bin/bash", ["-c", commandString], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        SHELL: "/bin/bash",
        CLAUDE_DISABLE_HOOKS: "1", // Disable audio/hooks for Discord bot usage
      },
    });

    console.log(`Claude process spawned with PID: ${claude.pid}`);

    // Update the channel process tracking with actual process
    const channelProcess = this.channelProcesses.get(channelId);
    if (channelProcess) {
      channelProcess.process = claude;
    }

    // Close stdin to signal we're not sending input
    claude.stdin.end();

    // Add immediate listeners to debug
    claude.on("spawn", () => {
      console.log("Process successfully spawned");
    });

    claude.on("error", (error) => {
      console.error("Process spawn error:", error);
    });

    let buffer = "";

    // Set a timeout for the Claude process (30 minutes)
    const timeout = setTimeout(() => {
      console.log("Claude process timed out, killing it");
      claude.kill("SIGTERM");

      const state = this.channelProgressState.get(channelId);
      if (state) {
        const userId = this.channelUserIds.get(channelId);
        const mention = userId ? `<@${userId}>` : '';

        state.status = 'timeout';
        state.assistant = "Claude Code took too long to respond (30 minutes)";

        this.updateProgressMessage(channelId).then(() => {
          const progressMessage = this.channelProgressMessages.get(channelId);
          if (progressMessage && mention) {
            progressMessage.reply(mention).catch(console.error);
          }
        }).catch(console.error);
      }
    }, 30 * 60 * 1000); // 30 minutes

    claude.stdout.on("data", (data) => {
      const rawData = data.toString();
      console.log("Raw stdout data:", rawData);
      
      // Log all streamed output to log.txt
      try {
        fs.appendFileSync(path.join(process.cwd(), 'log.txt'), 
          `[${new Date().toISOString()}] Channel: ${channelId}\n${rawData}\n---\n`);
      } catch (error) {
        console.error("Error writing to log.txt:", error);
      }
      
      buffer += rawData;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          console.log("Processing line:", line);
          try {
            const parsed: SDKMessage = JSON.parse(line);
            console.log("Parsed message type:", parsed.type);

            if (parsed.type === "assistant" && parsed.message.content) {
              this.handleAssistantMessage(channelId, parsed).catch(console.error);
            } else if (parsed.type === "user" && parsed.message.content) {
              this.handleToolResultMessage(channelId, parsed).catch(console.error);
            } else if (parsed.type === "result") {
              this.handleResultMessage(channelId, parsed).then(() => {
                clearTimeout(timeout);
              }).catch(console.error);
            } else if (parsed.type === "system") {
              console.log("System message:", parsed.subtype);
              if (parsed.subtype === "init") {
                this.handleInitMessage(channelId, parsed).catch(console.error);
              }
              const channelName = this.channelNames.get(channelId) || "default";
              this.db.setSession(channelId, parsed.session_id, channelName);
            }
          } catch (error) {
            console.error("Error parsing JSON:", error, "Line:", line);
          }
        }
      }
    });

    claude.on("close", (code) => {
      console.log(`Claude process exited with code ${code}`);
      clearTimeout(timeout);

      this.channelProcesses.delete(channelId);

      if (code !== 0 && code !== null && code !== 143) {
        const state = this.channelProgressState.get(channelId);
        if (state) {
          const userId = this.channelUserIds.get(channelId);
          const mention = userId ? `<@${userId}>` : '';

          state.status = 'failed';
          state.assistant = `Process exited with code: ${code}`;

          this.updateProgressMessage(channelId).then(() => {
            const progressMessage = this.channelProgressMessages.get(channelId);
            if (progressMessage && mention) {
              progressMessage.reply(mention).catch(console.error);
            }
          }).catch(console.error);
        }
      }
    });

    claude.stderr.on("data", (data) => {
      const stderrOutput = data.toString();
      console.error("Claude stderr:", stderrOutput);
    });

    claude.on("error", (error) => {
      console.error("Claude process error:", error);
      clearTimeout(timeout);

      this.channelProcesses.delete(channelId);

      const state = this.channelProgressState.get(channelId);
      if (state) {
        const userId = this.channelUserIds.get(channelId);
        const mention = userId ? `<@${userId}>` : '';

        state.status = 'failed';
        state.assistant = error.message;

        this.updateProgressMessage(channelId).then(() => {
          const progressMessage = this.channelProgressMessages.get(channelId);
          if (progressMessage && mention) {
            progressMessage.reply(mention).catch(console.error);
          }
        }).catch(console.error);
      }
    });
  }

  private buildProgressEmbed(channelId: string): EmbedBuilder {
    const state = this.channelProgressState.get(channelId);
    if (!state) {
      return new EmbedBuilder()
        .setTitle("🚀 Claude Code")
        .setDescription("Running...")
        .setColor(0x7289DA);
    }

    let description = '';

    if (state.init) {
      description += `${state.init}\n\n`;
    }

    if (state.assistant) {
      description += `**Latest Response:**\n${state.assistant}\n\n`;
    }

    if (state.tools.length > 0) {
      const recentTools = state.tools.slice(-5);
      description += `**Recent Tools:**\n${recentTools.join('\n')}`;
    }

    let title = '🚀 Claude Code';
    let color = 0x7289DA;

    if (state.status === 'complete') {
      title = '✅ Session Complete';
      color = 0x00FF00;
    } else if (state.status === 'failed') {
      title = '❌ Session Failed';
      color = 0xFF0000;
    } else if (state.status === 'timeout') {
      title = '⏰ Timeout';
      color = 0xFFD700;
    }

    return new EmbedBuilder()
      .setTitle(title)
      .setDescription(truncateForEmbed(description.trim()))
      .setColor(color);
  }

  private async updateProgressMessage(channelId: string): Promise<void> {
    const progressMessage = this.channelProgressMessages.get(channelId);
    if (!progressMessage) return;

    try {
      const progressEmbed = this.buildProgressEmbed(channelId);
      await progressMessage.edit({ embeds: [progressEmbed] });
    } catch (error) {
      console.error("Error updating progress message:", error);
    }
  }

  private async handleInitMessage(channelId: string, parsed: any): Promise<void> {
    const channel = this.channelMessages.get(channelId)?.channel;
    if (!channel) return;

    const initText = `**Working Directory:** ${parsed.cwd}\n**Model:** ${parsed.model}\n**Tools:** ${parsed.tools.length} available`;

    this.channelProgressState.set(channelId, {
      init: initText,
      tools: [],
      status: 'running'
    });

    try {
      const progressEmbed = this.buildProgressEmbed(channelId);
      const progressMessage = await channel.send({ embeds: [progressEmbed] });
      this.channelProgressMessages.set(channelId, progressMessage);
    } catch (error) {
      console.error("Error sending init message:", error);
    }
  }

  private async handleAssistantMessage(
    channelId: string,
    parsed: SDKMessage & { type: "assistant" }
  ): Promise<void> {
    const content = Array.isArray(parsed.message.content)
      ? parsed.message.content.find((c: any) => c.type === "text")?.text || ""
      : parsed.message.content;

    const toolUses = Array.isArray(parsed.message.content)
      ? parsed.message.content.filter((c: any) => c.type === "tool_use")
      : [];

    const state = this.channelProgressState.get(channelId);
    if (!state) return;

    try {
      if (content && content.trim()) {
        const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content;
        state.assistant = truncated;

        // Check for localhost URLs in assistant messages
        const channel = this.channelMessages.get(channelId)?.channel;
        if (channel) {
          handleScreenshotDetection(content, channel).catch(error => {
            console.error("Error handling screenshot:", error);
          });
        }
      }

      for (const tool of toolUses) {
        let toolMessage = `⏳ ${tool.name}`;

        if (tool.input && Object.keys(tool.input).length > 0) {
          const inputs = Object.entries(tool.input)
            .map(([key, value]) => {
              let val = String(value);
              const channelName = this.channelNames.get(channelId);
              if (channelName) {
                const basePath = `${this.baseFolder}${channelName}`;
                if (val === basePath) {
                  val = ".";
                } else if (val.startsWith(basePath + "/")) {
                  val = val.replace(basePath + "/", "./");
                }
              }
              return `${key}=${val}`;
            })
            .join(", ");
          toolMessage += ` (${inputs})`;
        }

        state.tools.push(toolMessage);
      }

      const channelName = this.channelNames.get(channelId) || "default";
      this.db.setSession(channelId, parsed.session_id, channelName);

      await this.updateProgressMessage(channelId);
    } catch (error) {
      console.error("Error handling assistant message:", error);
    }
  }

  private async handleToolResultMessage(channelId: string, parsed: any): Promise<void> {
    const toolResults = Array.isArray(parsed.message.content)
      ? parsed.message.content.filter((c: any) => c.type === "tool_result")
      : [];

    if (toolResults.length === 0) return;

    const state = this.channelProgressState.get(channelId);
    if (!state || state.tools.length === 0) return;

    try {
      for (const result of toolResults) {
        const lastToolIndex = state.tools.length - 1;
        if (lastToolIndex >= 0) {
          const isError = result.is_error === true;
          const icon = isError ? '❌' : '✅';
          state.tools[lastToolIndex] = state.tools[lastToolIndex].replace('⏳', icon);
        }
      }

      await this.updateProgressMessage(channelId);
    } catch (error) {
      console.error("Error handling tool result message:", error);
    }
  }

  private async handleResultMessage(
    channelId: string,
    parsed: SDKMessage & { type: "result" }
  ): Promise<void> {
    console.log("Result message:", parsed);
    const channelName = this.channelNames.get(channelId) || "default";
    this.db.setSession(channelId, parsed.session_id, channelName);

    const state = this.channelProgressState.get(channelId);
    if (!state) return;

    const userId = this.channelUserIds.get(channelId);
    const mention = userId ? `<@${userId}>` : '';

    if (parsed.subtype === "success") {
      let resultText = "result" in parsed ? parsed.result : "Task completed";
      resultText += `\n\n*Completed in ${parsed.num_turns} turns*`;
      state.assistant = resultText;
      state.status = 'complete';

      // Check if result contains a localhost URL for screenshot
      const channel = this.channelMessages.get(channelId)?.channel;
      if (channel && state.assistant) {
        handleScreenshotDetection(state.assistant, channel).catch(error => {
          console.error("Error handling screenshot:", error);
        });
      }
    } else {
      state.assistant = `Task failed: ${parsed.subtype}`;
      state.status = 'failed';
    }

    try {
      await this.updateProgressMessage(channelId);

      const progressMessage = this.channelProgressMessages.get(channelId);
      if (progressMessage && mention) {
        await progressMessage.reply(mention);
      }
    } catch (error) {
      console.error("Error updating result message:", error);
    }

    console.log("Got result message, cleaning up process tracking");
  }



  // Clean up resources
  destroy(): void {
    // Close all active processes
    for (const [channelId] of this.channelProcesses) {
      this.killActiveProcess(channelId);
    }
    
    // Close database connection
    this.db.close();
  }
}
