import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionDiscoveryService } from '../../src/services/session-discovery.js';
import type { ClaudeManager } from '../../src/claude/manager.js';
import type { Client, Guild, TextChannel, CategoryChannel } from 'discord.js';
import * as child_process from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('SessionDiscoveryService', () => {
  let service: SessionDiscoveryService;
  let mockClaudeManager: ClaudeManager;
  const baseFolder = '/home/user/projects';

  beforeEach(() => {
    vi.clearAllMocks();
    mockClaudeManager = {} as ClaudeManager;
    service = new SessionDiscoveryService(baseFolder, mockClaudeManager);
  });

  describe('findRunningClaudeSessions', () => {
    it('should discover running Claude sessions', async () => {
      // Mock ps output
      const mockExec = child_process.exec as unknown as ReturnType<typeof vi.fn>;
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        if (cmd.includes('ps aux')) {
          callback(null, { stdout: '1234\n5678\n', stderr: '' });
        }
        return {} as any;
      });

      // Mock pwdx output
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        if (cmd.includes('pwdx')) {
          callback(null, {
            stdout: '1234: /home/user/projects/my-project\n5678: /home/user/projects/another-project\n',
            stderr: ''
          });
        }
        return {} as any;
      });

      const sessions = await service.findRunningClaudeSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toEqual({
        pid: 1234,
        workingDirectory: '/home/user/projects/my-project',
        channelName: 'my-project'
      });
      expect(sessions[1]).toEqual({
        pid: 5678,
        workingDirectory: '/home/user/projects/another-project',
        channelName: 'another-project'
      });
    });

    it('should exclude discord bot directory', async () => {
      const mockExec = child_process.exec as unknown as ReturnType<typeof vi.fn>;
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: '1234\n', stderr: '' });
        return {} as any;
      });

      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, {
          stdout: '1234: /home/user/claude-code-discord-bot\n',
          stderr: ''
        });
        return {} as any;
      });

      const sessions = await service.findRunningClaudeSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should sanitize channel names', async () => {
      const mockExec = child_process.exec as unknown as ReturnType<typeof vi.fn>;
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: '1234\n', stderr: '' });
        return {} as any;
      });

      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, {
          stdout: '1234: /home/user/projects/My Project With Spaces!\n',
          stderr: ''
        });
        return {} as any;
      });

      const sessions = await service.findRunningClaudeSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.channelName).toBe('my-project-with-spaces');
    });

    it('should handle no running sessions', async () => {
      const mockExec = child_process.exec as unknown as ReturnType<typeof vi.fn>;
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const sessions = await service.findRunningClaudeSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      const mockExec = child_process.exec as unknown as ReturnType<typeof vi.fn>;
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(new Error('Command failed'), null);
        return {} as any;
      });

      const sessions = await service.findRunningClaudeSessions();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('syncDiscoveredSessions', () => {
    beforeEach(() => {
      // Mock findRunningClaudeSessions to avoid running real process discovery
      vi.spyOn(service, 'findRunningClaudeSessions').mockResolvedValue([]);
    });

    it('should create channels for discovered sessions', async () => {
      // Mock discovered sessions
      vi.spyOn(service, 'findRunningClaudeSessions').mockResolvedValue([
        {
          pid: 1234,
          workingDirectory: '/home/user/projects/test-project',
          channelName: 'test-project'
        }
      ]);

      // Mock Discord client and guild
      const mockCategory = {
        id: 'category-123',
        name: 'claude-code',
        type: 4
      } as CategoryChannel;

      const mockNewChannel = {
        send: vi.fn().mockResolvedValue(undefined)
      } as unknown as TextChannel;

      const channelCache = new Map([['category-123', mockCategory]]);
      (channelCache as any).find = function(fn: any) {
        for (const channel of this.values()) {
          if (fn(channel)) return channel;
        }
        return undefined;
      };

      const mockGuild = {
        name: 'Test Guild',
        channels: {
          cache: channelCache,
          create: vi.fn().mockResolvedValue(mockNewChannel)
        }
      } as unknown as Guild;

      const mockClient = {
        guilds: {
          cache: {
            first: () => mockGuild,
            find: (fn: any) => {
              const values = [mockGuild];
              return values.find(fn);
            }
          }
        }
      } as unknown as Client;

      await service.syncDiscoveredSessions(mockClient);

      // Verify channel creation was called
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'test-project',
        type: 0,
        parent: 'category-123',
        topic: 'Claude Code session for /home/user/projects/test-project'
      });

      // Verify initial message was sent
      expect(mockNewChannel.send).toHaveBeenCalled();
    });

    it('should create category if it does not exist', async () => {
      vi.spyOn(service, 'findRunningClaudeSessions').mockResolvedValue([
        {
          pid: 1234,
          workingDirectory: '/home/user/projects/test-project',
          channelName: 'test-project'
        }
      ]);

      const mockCategory = {
        id: 'new-category-123',
        name: 'claude-code',
        type: 4
      } as CategoryChannel;

      const mockNewChannel = {
        send: vi.fn().mockResolvedValue(undefined)
      } as unknown as TextChannel;

      const channelCache = new Map();
      (channelCache as any).find = function(fn: any) {
        for (const channel of this.values()) {
          if (fn(channel)) return channel;
        }
        return undefined;
      };

      const mockGuild = {
        name: 'Test Guild',
        channels: {
          cache: channelCache,
          create: vi.fn()
            .mockResolvedValueOnce(mockCategory) // First call creates category
            .mockResolvedValueOnce(mockNewChannel) // Second call creates channel
        }
      } as unknown as Guild;

      const mockClient = {
        guilds: {
          cache: {
            first: () => mockGuild,
            find: (fn: any) => {
              const values = [mockGuild];
              return values.find(fn);
            }
          }
        }
      } as unknown as Client;

      await service.syncDiscoveredSessions(mockClient);

      // Verify category creation
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'claude-code',
        type: 4
      });

      // Verify channel creation
      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        name: 'test-project',
        type: 0,
        parent: 'new-category-123',
        topic: 'Claude Code session for /home/user/projects/test-project'
      });
    });

    it('should not create duplicate channels', async () => {
      vi.spyOn(service, 'findRunningClaudeSessions').mockResolvedValue([
        {
          pid: 1234,
          workingDirectory: '/home/user/projects/test-project',
          channelName: 'test-project'
        }
      ]);

      const mockCategory = {
        id: 'category-123',
        name: 'claude-code',
        type: 4,
        parentId: undefined
      } as unknown as CategoryChannel;

      const mockExistingChannel = {
        name: 'test-project',
        type: 0,
        parentId: 'category-123',
        send: vi.fn().mockResolvedValue(undefined)
      } as unknown as TextChannel;

      const channelCache = new Map<string, any>([
        ['category-123', mockCategory],
        ['channel-456', mockExistingChannel]
      ]);
      (channelCache as any).find = function(fn: any) {
        for (const channel of this.values()) {
          if (fn(channel)) return channel;
        }
        return undefined;
      };

      const mockGuild = {
        name: 'Test Guild',
        channels: {
          cache: channelCache,
          create: vi.fn()
        }
      } as unknown as Guild;

      const mockClient = {
        guilds: {
          cache: {
            first: () => mockGuild,
            find: (fn: any) => {
              const values = [mockGuild];
              return values.find(fn);
            }
          }
        }
      } as unknown as Client;

      await service.syncDiscoveredSessions(mockClient);

      // Should send a message to existing channel but not create a new one
      expect(mockGuild.channels.create).not.toHaveBeenCalled();
      expect(mockExistingChannel.send).toHaveBeenCalledWith({
        embeds: [{
          title: '🔍 Existing Session Detected',
          description: expect.stringContaining('Found running Claude Code session'),
          color: 0x5865F2
        }]
      });
    });

    it('should handle no guild gracefully', async () => {
      // Mock a session to ensure code path is exercised
      vi.spyOn(service, 'findRunningClaudeSessions').mockResolvedValue([
        {
          pid: 1234,
          workingDirectory: '/home/user/projects/test-project',
          channelName: 'test-project'
        }
      ]);

      const mockClient = {
        guilds: {
          cache: {
            first: () => undefined
          }
        }
      } as unknown as Client;

      // Should not throw
      await expect(service.syncDiscoveredSessions(mockClient)).resolves.toBeUndefined();
    });

    it('should handle no sessions gracefully', async () => {
      vi.spyOn(service, 'findRunningClaudeSessions').mockResolvedValue([]);

      const channelCache = new Map();
      (channelCache as any).find = function(fn: any) {
        for (const channel of this.values()) {
          if (fn(channel)) return channel;
        }
        return undefined;
      };

      const mockGuild = {
        name: 'Test Guild',
        channels: {
          cache: channelCache
        }
      } as unknown as Guild;

      const mockClient = {
        guilds: {
          cache: {
            first: () => mockGuild,
            find: (fn: any) => {
              const values = [mockGuild];
              return values.find(fn);
            }
          }
        }
      } as unknown as Client;

      await service.syncDiscoveredSessions(mockClient);

      // Should complete without errors
    });
  });
});
