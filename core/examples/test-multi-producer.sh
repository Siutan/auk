#!/bin/bash

# Multi-Producer Test Script
# This script helps test the multi-producer distributed system

echo "🚀 Starting Multi-Producer Distributed System Test"
echo "=================================================="
echo ""

# Check if NATS is running
if ! pgrep -f "nats-server" > /dev/null; then
    echo "❌ NATS server is not running!"
    echo "   Please start NATS server first: nats-server"
    echo ""
    exit 1
fi

echo "✅ NATS server is running"
echo ""

# Function to start background processes
start_workers() {
    echo "🏗️  Starting worker instances..."
    bun run ./examples/multi-producer.ts > worker1.log 2>&1 &
    WORKER1_PID=$!
    echo "   Worker 1 started (PID: $WORKER1_PID)"
    
    bun run ./examples/multi-producer.ts > worker2.log 2>&1 &
    WORKER2_PID=$!
    echo "   Worker 2 started (PID: $WORKER2_PID)"
    
    sleep 2
}

start_producers() {
    echo ""
    echo "🏭 Starting producer instances..."
    
    bun run ./examples/multi-producer.ts email > email-producer.log 2>&1 &
    EMAIL_PID=$!
    echo "   Email producer started (PID: $EMAIL_PID)"
    
    sleep 1
    
    bun run ./examples/multi-producer.ts image > image-producer.log 2>&1 &
    IMAGE_PID=$!
    echo "   Image producer started (PID: $IMAGE_PID)"
    
    sleep 1
    
    bun run ./examples/multi-producer.ts analytics > analytics-producer.log 2>&1 &
    ANALYTICS_PID=$!
    echo "   Analytics producer started (PID: $ANALYTICS_PID)"
    
    sleep 2
}

show_logs() {
    echo ""
    echo "📋 Showing live logs (Ctrl+C to stop)..."
    echo "========================================="
    echo ""
    
    # Use multitail if available, otherwise use tail
    if command -v multitail >/dev/null 2>&1; then
        multitail worker1.log worker2.log email-producer.log image-producer.log analytics-producer.log
    else
        echo "💡 Tip: Install multitail for better log viewing: brew install multitail"
        echo ""
        echo "Tailing all logs (press Ctrl+C to stop):"
        tail -f worker1.log worker2.log email-producer.log image-producer.log analytics-producer.log
    fi
}

cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    
    # Kill all background processes
    for pid in $WORKER1_PID $WORKER2_PID $EMAIL_PID $IMAGE_PID $ANALYTICS_PID; do
        if [ ! -z "$pid" ]; then
            kill $pid 2>/dev/null
        fi
    done
    
    # Clean up log files
    rm -f worker1.log worker2.log email-producer.log image-producer.log analytics-producer.log
    
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main execution
case "$1" in
    "quick")
        echo "🚄 Quick test mode - starting everything automatically"
        start_workers
        start_producers
        
        echo ""
        echo "⏱️  Letting system run for 30 seconds..."
        sleep 30
        
        echo ""
        echo "📊 Final log summary:"
        echo "====================="
        echo ""
        echo "Worker 1 Summary:"
        tail -10 worker1.log
        echo ""
        echo "Email Producer Summary:"
        tail -5 email-producer.log
        
        cleanup
        ;;
    "manual")
        echo "🎛️  Manual mode - you control when to start components"
        echo ""
        echo "Commands:"
        echo "  1. Start workers:    $0 workers"
        echo "  2. Start producers:  $0 producers"
        echo "  3. View logs:        $0 logs"
        echo "  4. Stop all:         $0 stop"
        ;;
    "workers")
        start_workers
        echo ""
        echo "✅ Workers started. Use '$0 producers' to start producers."
        ;;
    "producers")
        start_producers
        echo ""
        echo "✅ Producers started. Use '$0 logs' to view logs."
        ;;
    "logs")
        show_logs
        ;;
    "stop")
        cleanup
        ;;
    *)
        echo "Usage: $0 [quick|manual|workers|producers|logs|stop]"
        echo ""
        echo "Modes:"
        echo "  quick    - Automated 30-second test"
        echo "  manual   - Step-by-step manual control"
        echo "  workers  - Start worker instances only"  
        echo "  producers- Start all producer instances"
        echo "  logs     - Show live logs from all instances"
        echo "  stop     - Stop all running instances"
        echo ""
        echo "Example:"
        echo "  $0 quick        # Quick automated test"
        echo "  $0 workers      # Start workers first"
        echo "  $0 producers    # Then start producers"
        echo "  $0 logs         # Watch the action"
        ;;
esac 