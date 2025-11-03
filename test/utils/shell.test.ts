import { describe, it, expect } from 'vitest';
import { escapeShellString, buildClaudeCommand } from '../../src/utils/shell.js';

describe('escapeShellString', () => {
  it('should wrap simple strings in single quotes', () => {
    expect(escapeShellString('hello world')).toBe("'hello world'");
  });

  it('should escape single quotes properly', () => {
    expect(escapeShellString("don't")).toBe("'don'\\''t'");
  });

  it('should handle multiple single quotes', () => {
    expect(escapeShellString("can't won't")).toBe("'can'\\''t won'\\''t'");
  });

  it('should handle empty string', () => {
    expect(escapeShellString('')).toBe("''");
  });

  it('should handle string with only single quotes', () => {
    expect(escapeShellString("'''")).toBe("''\\'''\\'''\\'''");
  });
});

describe('buildClaudeCommand', () => {
  it('should build basic command without session ID', () => {
    const command = buildClaudeCommand('/test/dir', 'hello world');
    expect(command).toContain("cd /test/dir");
    expect(command).toContain("claude");
    expect(command).toContain("--output-format stream-json");
    expect(command).toContain("--model claude-sonnet-4-5-20250929");
    expect(command).toContain("--permission-mode acceptEdits");
    expect(command).toContain("-p 'hello world'");
    expect(command).toContain("--mcp-config");
  });

  it('should build command with session ID', () => {
    const command = buildClaudeCommand('/test/dir', 'hello world', 'session-123');
    expect(command).toContain("--resume session-123");
    expect(command).toContain("-p 'hello world'");
  });

  it('should properly escape prompt with special characters', () => {
    const command = buildClaudeCommand('/test/dir', "don't use this");
    expect(command).toContain("-p 'don'\\''t use this'");
  });

  it('should handle complex prompts', () => {
    const prompt = "Fix the bug in 'config.js' and don't break anything";
    const command = buildClaudeCommand('/project/path', prompt, 'abc-123');
    expect(command).toContain("--resume abc-123");
    expect(command).toContain("-p 'Fix the bug in '\\''config.js'\\'' and don'\\''t break anything'");
  });

  it('should include Discord context when provided', () => {
    const discordContext = {
      channelId: 'channel-123',
      channelName: 'test-channel',
      userId: 'user-456',
      messageId: 'msg-789',
    };
    const command = buildClaudeCommand('/test/dir', 'test', undefined, discordContext);
    expect(command).toContain("--mcp-config");
    // The MCP config file should be created with the context
  });
});