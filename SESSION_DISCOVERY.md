# Session Discovery Feature

This feature automatically detects running Claude Code sessions and creates corresponding Discord channels for them.

## How It Works

When the Discord bot starts up, it:

1. **Scans for Running Claude Processes**
   - Uses `ps aux` to find Claude Code processes
   - Uses `pwdx` to get the working directory of each process
   - Filters out the bot's own directory

2. **Creates Discord Channels**
   - Converts working directory paths to Discord-friendly channel names
   - Creates a "claude-code" category if it doesn't exist
   - Creates channels under that category for each discovered session
   - If a channel already exists, sends a notification instead

3. **Channel Name Conversion**
   - `/home/user/projects/my-app` → `#my-app`
   - `/home/user/Soffi/Main Project` → `#main-project`
   - Sanitizes to lowercase, alphanumeric + dashes/underscores

## Example

If you have Claude Code running in these directories:
- `/home/user/projects/soffi-main`
- `/home/user/projects/discord-bot`

The bot will create:
```
📁 claude-code (category)
  └─ #soffi-main
  └─ #discord-bot
```

Each channel will show:
- 🔍 Session Discovered
- Working Directory: `/home/user/projects/soffi-main`
- Process ID: 1234
- Message: "You can now interact with this session by sending messages here!"

## Files Modified

- **`src/services/session-discovery.ts`** - New service for discovering sessions
- **`src/bot/client.ts`** - Integrated session discovery on startup
- **`src/index.ts`** - Pass baseFolder to DiscordBot
- **`test/services/session-discovery.test.ts`** - Comprehensive test suite
- **`test/bot/client.test.ts`** - Updated tests for new constructor parameter

## Benefits

1. **Seamless Integration** - Existing sessions are automatically discoverable
2. **No Manual Setup** - Channels are created automatically
3. **Clear Organization** - All Claude Code channels grouped under one category
4. **Process Tracking** - See which PID corresponds to each session
5. **No Duplicates** - Handles existing channels gracefully

## Running the Bot

To test the feature:

```bash
# Make sure you have Claude Code sessions running in various directories
bun run src/index.ts
```

The bot will:
1. Start the MCP Permission Server
2. Discover existing Claude Code sessions
3. Create Discord channels for each
4. Log the results to console

## Environment Requirements

Make sure these environment variables are set:
- `DISCORD_TOKEN` - Your Discord bot token
- `ALLOWED_USER_ID` - Discord user ID who can use the bot
- `BASE_FOLDER` - Base path where Claude Code operates

## Notes

- The bot excludes its own directory from discovery
- Channel names are sanitized to be Discord-compatible
- Existing channels receive a "Session Detected" notification
- The feature runs once on bot startup (not continuously)
