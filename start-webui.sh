#!/bin/bash

# Ollama Qdrant Web UI Startup Script

echo "🚀 Starting Ollama Qdrant Web UI..."
echo ""

# Check if node_modules exists in root
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
    echo ""
fi

# Check if cors package is installed
if ! npm list cors > /dev/null 2>&1; then
    echo "📦 Installing additional server dependencies..."
    npm install cors express
    echo ""
fi

# Check if web-ui dependencies are installed
if [ ! -d "web-ui/node_modules" ]; then
    echo "📦 Installing web UI dependencies..."
    cd web-ui
    npm install
    cd ..
    echo ""
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $API_PID 2>/dev/null
    kill $UI_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start API server
echo "🔧 Starting API server..."
node server.js &
API_PID=$!

# Wait for API server to start (model probing + collection init may take a bit)
API_HEALTH_URL="http://localhost:3001/api/health"
API_STARTED=false

for i in {1..60}; do
    # If the process already exited, fail fast
    if ! kill -0 $API_PID 2>/dev/null; then
        echo "❌ Error: API server process exited during startup"
        exit 1
    fi

    if curl -fsS "$API_HEALTH_URL" > /dev/null 2>&1; then
        API_STARTED=true
        break
    fi

    sleep 0.5
done

if [ "$API_STARTED" != "true" ]; then
    echo "❌ Error: API server failed to become healthy at $API_HEALTH_URL"
    echo "   Common causes: port 3001 already in use, Qdrant/Ollama not reachable, or slow model init."
    kill $API_PID 2>/dev/null
    exit 1
fi
echo "✅ API server running on http://localhost:3001"
echo ""

# Start Vue UI
echo "🎨 Starting Vue UI..."
cd web-ui
npm run dev &
UI_PID=$!
cd ..

# Wait a moment for UI to start
sleep 3
echo ""
echo "=========================================="
echo "✅ Web UI is ready!"
echo "=========================================="
echo ""
echo "🌐 Open your browser to:"
echo "   http://localhost:5173"
echo ""
echo "📡 API server: http://localhost:3001"
echo "📊 Qdrant dashboard: http://localhost:6333/dashboard"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for processes
wait
