# Quick Start Guide - Event Core v0.1.0

Get up and running with Event Core in 5 minutes!

## 📋 Prerequisites

- **Node.js** v16+ (built-in crypto, async/await support)
- **npm** or **yarn** package manager
- **Termux** (for Android/mobile) or Linux/macOS

## 🚀 Installation

### 1. Clone or navigate to the project

```bash
cd event-core
```

### 2. Install dependencies

```bash
npm install
```

Event Core has minimal dependencies:
- `aedes` - Embedded MQTT broker
- `mqtt` - MQTT client library

## ▶️ Starting the Core

### Basic Usage

Start Event Core with default configuration:

```bash
node index.js
```

You should see:

```
╔════════════════════════════════════════════════════════════╗
║                    EVENT CORE v0.1.0                       ║
║          Meta-Core Event-Driven Framework                  ║
╚════════════════════════════════════════════════════════════╝

📋 Configuration:
   Environment:    development
   Core ID:        core-a
   HTTP Port:      3000
   Broker Port:    1883
   Modules Path:   ./modules
   Log Level:      info

🔍 [1/6] Initializing Observability...
📡 [2/6] Starting MQTT Broker...
🔄 [3/6] Initializing Event Bus...
🪝 [4/6] Initializing Hook System...
📦 [5/6] Loading Modules...
   ✅ Loaded 3 module(s):
      - echo v1.0.0
      - file-watcher v1.0.0
      - security-p2p v1.0.0
🌐 [6/6] Starting HTTP Gateway...

╔════════════════════════════════════════════════════════════╗
║                  ✅ CORE STARTED SUCCESSFULLY               ║
╚════════════════════════════════════════════════════════════╝

📍 Endpoints:
   HTTP Gateway:   http://localhost:3000
   MQTT Broker:    mqtt://localhost:1883
   Health Check:   http://localhost:3000/health

🔧 Management:
   View Status:    curl http://localhost:3000/stats
   List Modules:   curl http://localhost:3000/modules
   Shutdown:       Ctrl+C or SIGTERM
```

### Custom Configuration

Start with custom ports:

```bash
node index.js --port 3001 --broker-port 1884 --core-id my-core
```

Start with different log level:

```bash
node index.js --log-level debug
```

Use custom config file:

```bash
node index.js --config /path/to/my-config.json
```

### Environment Variables

Set configuration via environment:

```bash
# Set environment
NODE_ENV=production

# Set core configuration
EVENT_CORE_ID=core-prod
EVENT_CORE_PORT=8080
EVENT_CORE_BROKER_PORT=1884
EVENT_CORE_LOG_LEVEL=warn

# Start
node index.js
```

## 🧪 Testing the Installation

### 1. Check Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "core_id": "core-a",
  "uptime": 12345,
  "version": "0.1.0"
}
```

### 2. View Core Statistics

```bash
curl http://localhost:3000/stats
```

### 3. List Loaded Modules

```bash
curl http://localhost:3000/modules
```

Expected response:
```json
{
  "count": 3,
  "modules": [
    {
      "name": "echo",
      "version": "1.0.0",
      "status": "loaded"
    },
    {
      "name": "file-watcher",
      "version": "1.0.0",
      "status": "loaded"
    },
    {
      "name": "security-p2p",
      "version": "1.0.0",
      "status": "loaded"
    }
  ]
}
```

### 4. Test Echo Module

```bash
curl -X POST http://localhost:3000/modules/echo/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Event Core!"}'
```

Expected response:
```json
{
  "echo": "Hello Event Core!",
  "timestamp": "2025-10-17T..."
}
```

### 5. Check Security P2P Status

```bash
curl http://localhost:3000/modules/security-p2p/status
```

Expected response:
```json
{
  "module": "security-p2p",
  "version": "1.0.0",
  "encryption_enabled": true,
  "fingerprint": "a1b2c3d4e5f6g7h8",
  "trusted_peers": 0,
  "stats": {
    "events_encrypted": 0,
    "events_decrypted": 0,
    "encryption_errors": 0,
    "decryption_errors": 0,
    "trusted_peers": 0
  }
}
```

## 📦 Using CLI Client

Event Core includes a CLI HTTP client for easier interaction:

```bash
# Check health
./cli/index.js health

# View stats
./cli/index.js stats

# List modules
./cli/index.js modules

# Call module API
./cli/index.js call POST /modules/echo/echo '{"message":"test"}'
```

## 🔧 Configuration

Event Core uses a layered configuration system with the following priority:

1. **CLI arguments** (highest priority)
2. **Environment variables** (`EVENT_CORE_*`)
3. **Environment-specific config** (`config.production.json`)
4. **Base config** (`config.json`)

### Example config.json

```json
{
  "core": {
    "id": "core-a",
    "version": "0.1.0",
    "environment": "development"
  },
  "http": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "mqtt": {
    "broker": {
      "port": 1883,
      "host": "0.0.0.0"
    }
  },
  "modules": {
    "path": "./modules",
    "auto_load": true,
    "enabled": ["echo", "file-watcher", "security-p2p"]
  },
  "observability": {
    "logging": {
      "level": "info",
      "outputs": ["console"]
    }
  }
}
```

### Production Configuration

Create `config.production.json` to override defaults:

```json
{
  "core": {
    "environment": "production"
  },
  "http": {
    "port": 8080
  },
  "observability": {
    "logging": {
      "level": "warn",
      "outputs": ["console", "file"]
    }
  }
}
```

Start in production:

```bash
NODE_ENV=production node index.js
```

## 🛑 Stopping the Core

### Graceful Shutdown

Press `Ctrl+C` or send `SIGTERM`:

```bash
kill -TERM <pid>
```

Event Core performs graceful shutdown:

1. Stops HTTP Gateway
2. Unloads all modules
3. Disconnects Event Bus
4. Stops MQTT Broker

Output:
```
🛑 Received SIGINT, shutting down gracefully...

   [1/4] Stopping HTTP Gateway...
   [2/4] Unloading modules...
   [3/4] Disconnecting Event Bus...
   [4/4] Stopping MQTT Broker...

✅ Shutdown complete. Goodbye!
```

## 📚 Next Steps

- **[Module Development](./MODULE_DEVELOPMENT.md)** - Create your own modules
- **[Architecture Guide](./architecture.md)** - Understand the system design
- **[MQTT Protocol](./mqtt-protocol.md)** - Learn about event communication
- **[API Reference](./API_REFERENCE.md)** - HTTP Gateway API documentation
- **[Examples](../examples/)** - Sample code and use cases

## 🐛 Troubleshooting

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:** Change the port:

```bash
node index.js --port 3001
```

Or check what's using the port:

```bash
lsof -i :3000  # Linux/macOS
netstat -ano | findstr :3000  # Windows
```

### Modules Not Loading

```
⚠️  Modules path not found: /path/to/modules
```

**Solution:** Check modules directory exists:

```bash
ls -la modules/
```

Or specify correct path:

```bash
node index.js --modules-path ./my-modules
```

### MQTT Connection Failed

```
Error: connect ECONNREFUSED 127.0.0.1:1883
```

**Solution:** Ensure broker started successfully. Check logs for:

```
📡 [2/6] Starting MQTT Broker...
✅ Broker listening on port 1883
```

### Module Fails to Load

Check module structure:

```bash
modules/
  my-module/
    module.json     # ← Required
    index.js        # ← Required
```

Validate `module.json`:

```json
{
  "name": "my-module",
  "version": "1.0.0",
  "provides": [],
  "subscribes": []
}
```

## 🎯 Performance Tips

1. **Disable unused modules** in `config.json`:

```json
{
  "modules": {
    "enabled": ["echo"],
    "disabled": ["file-watcher", "security-p2p"]
  }
}
```

2. **Reduce log verbosity** in production:

```json
{
  "observability": {
    "logging": {
      "level": "warn"
    }
  }
}
```

3. **Use QoS 0 for non-critical events** (logs, metrics)

4. **Enable hot-reload only in development**:

```json
{
  "modules": {
    "hot_reload": false
  }
}
```

## 📊 Monitoring

### View Real-time Logs

```bash
node index.js --log-level debug
```

### Metrics Endpoint

```bash
curl http://localhost:3000/metrics
```

### Trace ID Propagation

All events include trace IDs for distributed tracing:

```json
{
  "trace_id": "a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6",
  "event_type": "user.action"
}
```

---

**Need Help?**

- **Documentation:** `/docs`
- **Examples:** `/examples`
- **Issues:** GitHub Issues
- **Community:** Discord/Slack (TBD)

---

**Version:** 0.1.0
**Last Updated:** 2025-10-17
