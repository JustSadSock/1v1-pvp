#!/bin/bash

echo "========================================"
echo "Starting 1v1 PVP Game Server"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies!"
        exit 1
    fi
    echo ""
fi

echo "Starting game server on http://localhost:3000"
echo ""

# Start the Node.js server in background
node server.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 3

echo "Server started with PID: $SERVER_PID"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "WARNING: cloudflared is not installed or not in PATH!"
    echo "Download from: https://github.com/cloudflare/cloudflared/releases"
    echo ""
    echo "The game server is running locally at http://localhost:3000"
    echo "But the cloudflared tunnel will not start."
    echo ""
    echo "Press Ctrl+C to stop the server"
    wait $SERVER_PID
    exit 0
fi

echo "Starting cloudflared tunnel..."
echo "Configuration: cloudflared-config.yml"
echo "Tunnel: irgri-tunnel"
echo "Public URLs: irgri.uk, www.irgri.uk"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "========================================"
    echo "Stopping server..."
    echo "========================================"
    kill $SERVER_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C
trap cleanup INT TERM

# Start cloudflared tunnel
cloudflared tunnel --config cloudflared-config.yml run irgri-tunnel

# If cloudflared exits, cleanup
cleanup
