# Claude Code Discord Bot

A Discord bot that runs Claude Code sessions on different projects based on Discord channel names. Each channel maps to a folder in your file system, allowing you to interact with Claude Code for different repositories through Discord.

![image](https://github.com/user-attachments/assets/d78c6dcd-eb28-48b6-be1c-74e25935b86b)

## Quickstart

1. Install [Bun](https://bun.sh/), [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), and [Beads](https://github.com/steveyegge/beads) (optional)
2. Create a Discord bot at [Discord Developer Portal](https://discord.com/developers/applications)
3. Clone and setup:
   ```bash
   git clone <repository-url>
   cd claude-code-discord
   bun install
   ```
4. Create `.env` file:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   ALLOWED_USER_ID=your_discord_user_id_here
   BASE_FOLDER=/path/to/your/repos
   ```
5. Run: `bun start`

## Features

- **Channel-based project mapping**: Each Discord channel corresponds to a folder (e.g., `#my-project` → `/path/to/repos/my-project`)
- **Persistent sessions**: Sessions are maintained per channel and automatically resume
- **Live progress updates**: Single message that updates in real-time showing current status, latest response, and recent tools
- **Automatic screenshots**: Detects localhost URLs and automatically captures/posts screenshots of web apps
- **Beads task tracking**: Deep integration with Beads issue tracker for managing complex tasks and dependencies
- **MCP tool permissions**: Interactive approval for MCP tools with 5-minute timeout
- **Slash commands**: Use `/clear` to reset a session

## Setup Instructions

### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give your application a name (e.g., "Claude Code Bot")
4. Click "Create"

### 2. Create a Bot User

1. In your application, go to the "Bot" section in the left sidebar
2. Click "Add Bot"
3. Under "Token", click "Copy" to copy your bot token (keep this secure!)
4. Under "Privileged Gateway Intents", enable:
   - Message Content Intent
5. Click "Save Changes"

### 3. Invite the Bot to Your Server

1. Go to the "OAuth2" → "URL Generator" section
2. Under "Scopes", select:
   - `bot`
   - `applications.commands`
3. Under "Bot Permissions", select:
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - Embed Links
4. Copy the generated URL and open it in your browser
5. Select your Discord server and authorize the bot

### 4. Get Your Discord User ID

1. Enable Developer Mode in Discord:
   - Go to Discord Settings → Advanced → Enable "Developer Mode"
2. Right-click on your username in any channel
3. Click "Copy User ID"
4. Save this ID - you'll need it for the configuration

### 5. Clone and Setup the Bot

```bash
# Clone the repository
git clone <repository-url>
cd claude-code-discord

# Install dependencies
bun install
```

### 6. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Discord bot token from step 2
DISCORD_TOKEN=your_discord_bot_token_here

# Your Discord user ID from step 4
ALLOWED_USER_ID=your_discord_user_id_here

# Base folder containing your repositories
# Each Discord channel will map to a subfolder here
# Example: if BASE_FOLDER=/Users/you/repos and channel is #my-project
# The bot will operate in /Users/you/repos/my-project
BASE_FOLDER=/path/to/your/repos
```

### 7. Prepare Your Repository Structure

Organize your repositories under the base folder with names matching your Discord channels:

```
/path/to/your/repos/
├── my-project/          # Maps to #my-project channel
├── another-repo/        # Maps to #another-repo channel
├── test-app/           # Maps to #test-app channel
└── experimental/       # Maps to #experimental channel
```

**Important**: Channel names in Discord should match folder names exactly (Discord will convert spaces to hyphens).

### 8. Create Discord Channels

In your Discord server, create channels for each repository:
- `#my-project`
- `#another-repo` 
- `#test-app`
- `#experimental`

### 9. Run the Bot

```bash
# Start the bot
bun start

# Start in background (recommended for production)
nohup bun run src/index.ts > bot.log 2>&1 &

# Restart the bot (safely stops and restarts)
bun run restart
```

**Important**: Do not use hot reload (`bun --hot`) as it can cause issues with process management and spawn multiple Claude processes.

You should see:
```
Bot is ready! Logged in as Claude Code Bot#1234
Successfully registered application commands.
```

### Managing the Bot

**Restarting the bot:**
```bash
bun run restart
```
This script safely stops any running bot instance and immediately starts a new one. Logs are written to `bot.log`.

**Viewing logs:**
```bash
tail -f bot.log
```

**Stopping the bot:**
```bash
# Find the bot process
ps aux | grep "bun run src/index.ts"

# Kill it
kill <PID>
```

## Usage

Type any message in a channel that corresponds to a repository folder. The bot will run Claude Code with your message as the prompt and show live progress updates.

**Progress Updates**: The bot creates a single message that updates in real-time showing:
- 🚀 Working directory, model, and available tools
- 💬 Latest assistant response (most recent 200 characters)
- 🔧 Recent tool calls with status indicators (⏳ running, ✅ completed, ❌ failed)
- Final status: ✅ Session Complete, ❌ Session Failed, or ⏰ Timeout

**Notifications**: The bot will @mention you when:
- ✅ A session completes successfully
- ❌ A session fails or encounters an error
- ⏰ A session times out (after 30 minutes)

**MCP Permissions**: When Claude Code requests permission to use an MCP tool, the bot will:
- Post a permission request message with tool details
- Wait up to 5 minutes for you to react with ✅ (approve) or ❌ (deny)
- Auto-deny if no response within the timeout period
- Delete the permission message after you respond to keep chat clean

**Automatic Screenshots**: When Claude mentions a localhost URL, the bot will:
- Automatically detect URLs like `localhost:3000`, `http://localhost:8080/path`, `127.0.0.1:5000`
- Wait 3 seconds for the server to be ready
- Launch a headless browser and capture a screenshot
- Post the screenshot to Discord with the URL
- Supported formats: `localhost:PORT`, `127.0.0.1:PORT`, `0.0.0.0:PORT`, `http://localhost:PORT/path`

**Beads Task Tracking**: Claude Code can use Beads tools to manage complex tasks:
- `beads_init` - Initialize Beads in project directory
- `beads_create` - Create issues with priorities and types
- `beads_list` - List and filter issues
- `beads_update` - Update issue status, priority, or description
- `beads_ready` - Show issues ready to work on (no blockers)
- `beads_blocked` - Show blocked issues
- `beads_dep_add` - Create dependencies (blocks, related, parent, discovered)
- `beads_stats` - View project statistics
- All Beads data is git-versioned in `.beads/` directory

### Commands

- **Any message**: Runs Claude Code with your message as the prompt
- **stop**: Stops the currently running Claude Code process in the channel
- **/clear**: Resets the current channel's session (starts fresh next time)

### Example

```
You: hello

Bot: 🚀 Claude Code

     Working Directory: /path/to/repos/my-project
     Model: claude-sonnet-4-5-20250929
     Tools: 15 available

     Latest Response:
     Hello! I can see this is a Node.js project. What would you like to work on?

     Recent Tools:
     ✅ Glob (pattern=**/*.ts)
     ✅ Read (file_path=./package.json)

[Message updates in real-time as Claude works, then final status:]

Bot: ✅ Session Complete

     Working Directory: /path/to/repos/my-project
     Model: claude-sonnet-4-5-20250929
     Tools: 15 available

     Latest Response:
     Task completed

     Completed in 3 turns

     Recent Tools:
     ✅ Glob (pattern=**/*.ts)
     ✅ Read (file_path=./package.json)

@YourUsername
```

## How It Works

- Each Discord channel maps to a folder: `#my-project` → `/path/to/repos/my-project`
- Sessions persist per channel and automatically resume
- Single progress message updates in real-time (no spam!)
- Shows latest response, recent tools, and current status
- @mentions you only when input needed or task completes
- Only responds to the configured `ALLOWED_USER_ID`

## Development

### Running Tests

```bash
# Run all tests
bun run test:run

# Run tests in watch mode
bun test

# Run tests with coverage report
bun run test:coverage
```

### Test Coverage

Current test coverage (excluding MCP integration modules):

- **Overall**: 50.69%
- **database.ts**: 100% ✅
- **config.ts**: 100% ✅
- **shell.ts**: 93.58% ✅
- **commands.ts**: 76.19%
- **manager.ts**: 36.79%
- **client.ts**: 28.46%

Coverage focuses on unit-testable modules. MCP modules are excluded as they require full integration testing with Claude Code CLI and Discord bot running.

### Process Exit Code Handling

The bot properly handles Claude Code process exit codes:
- **Exit code 0**: Normal successful completion
- **Exit code 143**: SIGTERM shutdown (also treated as normal)
- **Other codes**: Displayed as errors in Discord

The bot no longer manually terminates Claude Code processes. It lets them exit naturally when tasks complete.

## Troubleshooting

### Claude Code Hooks

If you have Claude Code hooks configured (e.g., audio notifications in `~/.claude/settings.json`), they may interfere with the Discord bot. The bot automatically sets `CLAUDE_DISABLE_HOOKS=1` when spawning Claude processes.

To make your hooks respect this, add a check at the beginning of your hook scripts:

```bash
#!/bin/bash
# Example: ~/.claude/claude-sound-notification.sh

# Skip hook if running from Discord bot
if [ "$CLAUDE_DISABLE_HOOKS" = "1" ]; then
  exit 0
fi

# Your existing hook code (e.g., play sound)
mplayer -really-quiet /path/to/sound.mp3
```

This ensures hooks run normally in your terminal but are skipped when using the Discord bot.

For detailed setup instructions, troubleshooting, and development information, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the MIT License.
