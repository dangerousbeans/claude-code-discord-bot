#!/bin/bash
# Safe restart script for Claude Code Discord Bot
# Finds and kills the running bot, then immediately starts a new one

set -e

echo "🔄 Restarting Claude Code Discord Bot..."

# Find the bot process
BOT_PID=$(ps aux | grep "bun run src/index.ts" | grep -v grep | awk '{print $2}')

if [ -n "$BOT_PID" ]; then
    echo "📍 Found bot running with PID: $BOT_PID"
    echo "🛑 Stopping bot..."
    kill -TERM $BOT_PID

    # Wait for process to exit (max 5 seconds)
    for i in {1..50}; do
        if ! kill -0 $BOT_PID 2>/dev/null; then
            echo "✅ Bot stopped"
            break
        fi
        sleep 0.1
    done

    # Force kill if still running
    if kill -0 $BOT_PID 2>/dev/null; then
        echo "⚠️  Bot didn't stop gracefully, force killing..."
        kill -9 $BOT_PID
    fi
else
    echo "ℹ️  No running bot found"
fi

echo "🚀 Starting bot..."
cd "$(dirname "$0")"
nohup bun run src/index.ts > bot.log 2>&1 &
NEW_PID=$!

echo "✅ Bot started with PID: $NEW_PID"
echo "📋 Logs available at: bot.log"
echo ""
echo "To view logs: tail -f bot.log"
echo "To stop: kill $NEW_PID"
