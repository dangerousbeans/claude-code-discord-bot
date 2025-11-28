import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { Client, Guild, TextChannel, CategoryChannel } from 'discord.js';
import type { ClaudeManager } from '../claude/manager.js';

const execAsync = promisify(exec);

export interface DiscoveredSession {
  pid: number;
  workingDirectory: string;
  channelName: string;
}

/**
 * Service to discover running Claude Code sessions and create Discord channels for them
 */
export class SessionDiscoveryService {
  constructor(
    private baseFolder: string,
    private claudeManager: ClaudeManager
  ) {}

  /**
   * Find all running Claude Code processes
   */
  async findRunningClaudeSessions(): Promise<DiscoveredSession[]> {
    try {
      // Find Claude processes (excluding the bot's own spawned processes)
      const { stdout: psOutput } = await execAsync(
        "ps aux | grep '/home/[^/]*/.local/bin/claude' | grep -v 'grep' | awk '{print $2}'"
      );

      const pids = psOutput
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(pid => parseInt(pid, 10))
        .filter(pid => !isNaN(pid));

      if (pids.length === 0) {
        console.log('No running Claude Code sessions found');
        return [];
      }

      // Get working directories for each process
      const { stdout: pwdxOutput } = await execAsync(`pwdx ${pids.join(' ')}`);

      const sessions: DiscoveredSession[] = [];
      const lines = pwdxOutput.trim().split('\n');

      for (const line of lines) {
        const match = line.match(/^(\d+):\s+(.+)$/);
        if (match && match[1] && match[2]) {
          const pid = parseInt(match[1], 10);
          const workingDirectory = match[2].trim();

          // Skip if this is the discord bot's own directory
          if (workingDirectory.includes('claude-code-discord-bot')) {
            continue;
          }

          // Extract channel name from working directory
          const channelName = this.getChannelNameFromPath(workingDirectory);

          if (channelName) {
            sessions.push({
              pid,
              workingDirectory,
              channelName
            });
          }
        }
      }

      console.log(`Discovered ${sessions.length} Claude Code sessions:`, sessions);
      return sessions;
    } catch (error) {
      console.error('Error discovering Claude sessions:', error);
      return [];
    }
  }

  /**
   * Extract channel name from working directory path
   * Converts path to Discord-friendly channel name
   */
  private getChannelNameFromPath(workingDirectory: string): string | null {
    // If working directory starts with baseFolder, extract the subfolder name
    if (workingDirectory.startsWith(this.baseFolder)) {
      const relativePath = path.relative(this.baseFolder, workingDirectory);
      const channelName = relativePath.split(path.sep)[0];
      if (!channelName) return null;
      return this.sanitizeChannelName(channelName);
    }

    // Otherwise, use the last part of the path
    const baseName = path.basename(workingDirectory);
    return this.sanitizeChannelName(baseName);
  }

  /**
   * Sanitize directory name to be a valid Discord channel name
   * Discord channel names must be lowercase, no spaces, alphanumeric + dashes/underscores
   */
  private sanitizeChannelName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Create or find Discord channels for discovered sessions
   */
  async syncDiscoveredSessions(client: Client): Promise<void> {
    const sessions = await this.findRunningClaudeSessions();

    if (sessions.length === 0) {
      return;
    }

    // Get the first guild (server) - assumes bot is only in one server
    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error('No guild found for session sync');
      return;
    }

    console.log(`Syncing ${sessions.length} sessions to Discord channels in guild: ${guild.name}`);

    for (const session of sessions) {
      await this.ensureChannelExists(guild, session);
    }
  }

  /**
   * Ensure a Discord channel exists for the session
   */
  private async ensureChannelExists(
    guild: Guild,
    session: DiscoveredSession
  ): Promise<void> {
    try {
      // Find or create category for Claude Code sessions
      let category: CategoryChannel | undefined = guild.channels.cache.find(
        (channel) =>
          channel.name === 'claude-code' && channel.type === 4 // 4 = GUILD_CATEGORY
      ) as CategoryChannel | undefined;

      if (!category) {
        console.log('Creating "claude-code" category');
        category = await guild.channels.create({
          name: 'claude-code',
          type: 4, // GUILD_CATEGORY
        }) as unknown as CategoryChannel;
      }

      // Check if channel already exists
      const existingChannel = guild.channels.cache.find(
        (channel): channel is TextChannel =>
          channel.name === session.channelName &&
          channel.type === 0 && // 0 = GUILD_TEXT
          channel.parentId === category?.id
      );

      if (existingChannel) {
        console.log(`Channel #${session.channelName} already exists (PID: ${session.pid})`);
        // Optionally send a message to indicate the session was discovered
        await existingChannel.send({
          embeds: [{
            title: '🔍 Existing Session Detected',
            description: `Found running Claude Code session\n**Working Directory:** ${session.workingDirectory}\n**Process ID:** ${session.pid}`,
            color: 0x5865F2, // Discord blurple
          }]
        });
        return;
      }

      // Create new channel
      console.log(`Creating channel #${session.channelName} for PID ${session.pid}`);
      const newChannel = await guild.channels.create({
        name: session.channelName,
        type: 0, // GUILD_TEXT
        parent: category?.id,
        topic: `Claude Code session for ${session.workingDirectory}`
      });

      // Send initial message
      await newChannel.send({
        embeds: [{
          title: '🔍 Session Discovered',
          description: `This channel was created for an existing Claude Code session.\n\n**Working Directory:** ${session.workingDirectory}\n**Process ID:** ${session.pid}\n\nYou can now interact with this session by sending messages here!`,
          color: 0x57F287, // Discord green
        }]
      });

      console.log(`Created channel #${session.channelName} for discovered session`);
    } catch (error) {
      console.error(`Error creating channel for session ${session.channelName}:`, error);
    }
  }
}
