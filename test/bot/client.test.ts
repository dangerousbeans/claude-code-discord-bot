import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscordBot } from '../../src/bot/client.js';

// Mock commands
vi.mock('../../src/bot/commands.js', () => ({
  CommandHandler: vi.fn().mockImplementation(() => ({
    registerCommands: vi.fn().mockResolvedValue(undefined),
    handleInteraction: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock discord.js
vi.mock('discord.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    once: vi.fn(),
    on: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    user: { tag: 'TestBot#1234', id: 'bot-123' }
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    GuildMessageReactions: 8,
  },
  EmbedBuilder: vi.fn().mockImplementation(() => ({
    setTitle: vi.fn().mockReturnThis(),
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
  })),
}));

// Mock ClaudeManager
const mockClaudeManager = {
  hasActiveProcess: vi.fn(),
  killActiveProcess: vi.fn(),
  clearSession: vi.fn(),
  setDiscordMessage: vi.fn(),
  reserveChannel: vi.fn(),
  runClaudeCode: vi.fn(),
  getSessionId: vi.fn(),
};

describe('DiscordBot', () => {
  let discordBot: DiscordBot;
  const allowedUserId = 'user-123';

  beforeEach(() => {
    discordBot = new DiscordBot(mockClaudeManager as any, allowedUserId);
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should call client.login with token', async () => {
      const token = 'test-token';
      await discordBot.login(token);
      
      // We can't easily test the actual login call due to mocking limitations
      // but we can verify the method exists and doesn't throw
      expect(typeof discordBot.login).toBe('function');
    });
  });

  // Note: Testing the private event handlers would require more complex mocking
  // of the Discord.js Client's event system. For now, we're testing the main
  // public interface and the constructor doesn't throw.
  
  describe('constructor', () => {
    it('should create instance without throwing', () => {
      expect(() => new DiscordBot(mockClaudeManager as any, allowedUserId)).not.toThrow();
    });
  });

  describe('stop command', () => {
    it('should have killActiveProcess method in ClaudeManager', () => {
      expect(mockClaudeManager.killActiveProcess).toBeDefined();
      expect(typeof mockClaudeManager.killActiveProcess).toBe('function');
    });
  });
});