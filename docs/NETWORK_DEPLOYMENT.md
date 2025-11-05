# Network Deployment Guide

**Version:** 0.5.0 "Network"
**Last Updated:** 2025-11-05

This guide explains how to deploy multiple Event Core instances across different machines in a local network.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Deployment Scenarios](#deployment-scenarios)
5. [Setup External MQTT Broker](#setup-external-mqtt-broker)
6. [Multi-Machine Deployment](#multi-machine-deployment)
7. [Network Configuration](#network-configuration)
8. [Validation and Testing](#validation-and-testing)
9. [Performance Metrics](#performance-metrics)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Event Core's **Fractal Architecture** allows multiple cores to communicate seamlessly via MQTT, whether they're running:

- **Single Machine**: Multiple cores on localhost (v0.2.0)
- **Local Network**: Cores across different machines in LAN (v0.5.0) ✨
- **Cloud/Internet**: Future cloud deployments (v1.0.0)

### Key Features (v0.5.0)

✅ **Automatic Discovery**: Cores discover peers via MQTT retained messages
✅ **External Broker Support**: Connect all cores to shared Mosquitto broker
✅ **Fallback Mechanism**: Auto-fallback to embedded broker if external fails
✅ **Low Latency**: < 50ms event propagation in local network
✅ **Zero Configuration**: No manual peer registration required

---

## Architecture

### Single Machine (v0.2.0)

```
┌─────────────────────────────────────┐
│        Machine A (localhost)        │
│                                     │
│  ┌──────────┐      ┌──────────┐   │
│  │ Core A   │      │ Core B   │   │
│  │ :3000    │      │ :3001    │   │
│  └────┬─────┘      └────┬─────┘   │
│       │                 │          │
│       └────────┬────────┘          │
│                │                   │
│       ┌────────▼────────┐          │
│       │ Embedded Broker │          │
│       │   :1883         │          │
│       └─────────────────┘          │
└─────────────────────────────────────┘
```

### Multi-Machine Network (v0.5.0)

```
┌──────────────────┐         ┌──────────────────┐
│   Machine A      │         │   Machine B      │
│   192.168.1.10   │         │   192.168.1.11   │
│                  │         │                  │
│  ┌──────────┐    │         │  ┌──────────┐    │
│  │ Core A   │    │         │  │ Core B   │    │
│  │ :3000    │    │         │  │ :3000    │    │
│  └────┬─────┘    │         │  └────┬─────┘    │
│       │          │         │       │          │
└───────┼──────────┘         └───────┼──────────┘
        │                            │
        │    ┌──────────────────┐   │
        └────┤  Machine C       ├───┘
             │  192.168.1.12    │
             │                  │
             │ ┌──────────────┐ │
             │ │  Mosquitto   │ │
             │ │  Broker      │ │
             │ │  :1883       │ │
             │ └──────────────┘ │
             └──────────────────┘
```

**Communication Flow:**
1. Core A → MQTT Broker (Machine C)
2. Core B → MQTT Broker (Machine C)
3. Discovery: Both cores publish to `core/{id}/status` (retained)
4. Events: Published to `core/{source}/events/{type}`

---

## Prerequisites

### Hardware Requirements

**Per Machine:**
- RAM: 512MB minimum (1GB recommended)
- CPU: 1 core minimum
- Network: 100 Mbps LAN (1 Gbps recommended)
- Disk: 100MB for Event Core installation

### Software Requirements

**All Machines:**
- Node.js 18+ (LTS)
- Git (optional, for cloning repo)
- Network connectivity between machines

**Broker Machine (one machine only):**
- Mosquitto MQTT Broker 2.x

### Network Requirements

- All machines in same subnet (e.g., 192.168.1.0/24)
- Firewall rules allow:
  - Port 1883 (MQTT) from all core machines to broker
  - Port 3000 (HTTP API) for core management
- Low latency network (< 10ms ping between machines)

---

## Deployment Scenarios

### Scenario 1: Development (2-3 machines)

**Use Case**: Local testing, development environment

```
Machine 1: Core A + Mosquitto Broker
Machine 2: Core B
Machine 3: Core C (optional)
```

**Pros**: Minimal setup, broker + core on same machine
**Cons**: Broker failure affects local core too

### Scenario 2: Production-like (3+ machines)

**Use Case**: Staging, production simulation

```
Machine 1: Mosquitto Broker (dedicated)
Machine 2: Core A
Machine 3: Core B
Machine 4: Core C
...
```

**Pros**: Isolated broker, easier to scale cores
**Cons**: Requires additional machine for broker

### Scenario 3: High Availability (5+ machines)

**Use Case**: Production deployment with redundancy

```
Machine 1-2: Mosquitto Broker Cluster (HA)
Machine 3-5: Event Cores
```

**Pros**: No single point of failure
**Cons**: Complex setup (requires Mosquitto clustering)

> **Note**: v0.5.0 focuses on Scenario 1 and 2. Scenario 3 (HA) will be covered in v1.0.0.

---

## Setup External MQTT Broker

### Install Mosquitto

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients
```

**macOS:**
```bash
brew install mosquitto
```

**Docker (alternative):**
```bash
docker run -d \
  --name mosquitto \
  -p 1883:1883 \
  -p 9001:9001 \
  eclipse-mosquitto:2
```

### Configure Mosquitto

**File:** `/etc/mosquitto/mosquitto.conf` (or create new file)

```conf
# Mosquitto configuration for Event Core

# Listeners
listener 1883 0.0.0.0
protocol mqtt

# Allow anonymous connections (dev only!)
# For production, use authentication
allow_anonymous true

# Persistence
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type all
log_timestamp true

# Performance
max_connections -1
max_keepalive 60

# QoS
max_queued_messages 1000
```

> **⚠️ Security Warning**: `allow_anonymous true` is for development only. Production deployments should use authentication (see [Security](#security) section).

### Start Mosquitto

**System Service:**
```bash
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

**Check Status:**
```bash
sudo systemctl status mosquitto
```

**Test Connection:**
```bash
# Terminal 1: Subscribe
mosquitto_sub -h localhost -t test/topic

# Terminal 2: Publish
mosquitto_pub -h localhost -t test/topic -m "Hello MQTT"
```

### Firewall Configuration

**Allow MQTT Port 1883:**
```bash
# UFW (Ubuntu)
sudo ufw allow 1883/tcp
sudo ufw reload

# Firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=1883/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 1883 -j ACCEPT
sudo iptables-save
```

---

## Multi-Machine Deployment

### Step 1: Identify Machines

**Example Network:**
```
Machine A (Broker): 192.168.1.12
Machine B (Core B):  192.168.1.10
Machine C (Core C):  192.168.1.11
```

**Verify Connectivity:**
```bash
# From Machine B, ping Broker
ping -c 4 192.168.1.12

# From Machine C, ping Broker
ping -c 4 192.168.1.12
```

Expected latency: < 10ms in LAN

### Step 2: Install Event Core on Each Machine

**On Machine B and C:**
```bash
# Clone repository
git clone https://github.com/YOUR_ORG/event-core.git
cd event-core

# Install dependencies
npm install

# Verify installation
node index.js --version
```

### Step 3: Configure Environment Variables

**Machine B (Core B):**

Create `.env` file:
```bash
# Core Configuration
EVENT_CORE_ID=core-b
EVENT_CORE_PORT=3000

# MQTT Configuration
EVENT_CORE_BROKER_URL=mqtt://192.168.1.12:1883
EVENT_CORE_BROKER_PORT=1883

# Logging
LOG_LEVEL=info
```

**Machine C (Core C):**

Create `.env` file:
```bash
# Core Configuration
EVENT_CORE_ID=core-c
EVENT_CORE_PORT=3000

# MQTT Configuration
EVENT_CORE_BROKER_URL=mqtt://192.168.1.12:1883
EVENT_CORE_BROKER_PORT=1883

# Logging
LOG_LEVEL=info
```

> **💡 Tip**: Use different `EVENT_CORE_ID` for each core. IDs must be unique across the network.

### Step 4: Start Cores

**On Machine B:**
```bash
node index.js
```

**On Machine C:**
```bash
node index.js
```

**Expected Output (both machines):**
```
🚀 Event Core v0.5.0 'Network' starting...
🔌 [1/8] Connecting to MQTT broker...
✅ Connected to external MQTT broker at mqtt://192.168.1.12:1883
🔍 [7/8] Initializing Discovery System...
✅ Discovery System started
📡 Discovered peer: core-c (version: 0.5.0)
✅ HTTP API listening on http://0.0.0.0:3000
```

### Step 5: Verify Discovery

**Check Active Cores (from any machine):**

**Option 1: HTTP API**
```bash
curl http://192.168.1.10:3000/api/discovery/cores
```

**Expected Response:**
```json
{
  "cores": [
    {
      "core_id": "core-b",
      "version": "0.5.0",
      "host": "192.168.1.10",
      "port": 3000,
      "started_at": 1730808000000,
      "last_seen": 1730808120000,
      "heartbeat_count": 4,
      "is_alive": true,
      "modules": ["echo", "file-watcher", "security-p2p"]
    },
    {
      "core_id": "core-c",
      "version": "0.5.0",
      "host": "192.168.1.11",
      "port": 3000,
      "started_at": 1730808010000,
      "last_seen": 1730808125000,
      "heartbeat_count": 4,
      "is_alive": true,
      "modules": ["echo", "file-watcher", "security-p2p"]
    }
  ],
  "total": 2
}
```

**Option 2: MQTT Subscription (from broker machine)**
```bash
mosquitto_sub -h localhost -t 'core/+/status' -v
```

**Expected Output:**
```
core/core-b/status {"core_id":"core-b","version":"0.5.0",...}
core/core-c/status {"core_id":"core-c","version":"0.5.0",...}
```

---

## Network Configuration

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EVENT_CORE_ID` | Unique core identifier | `core-{timestamp}` | ✅ Yes |
| `EVENT_CORE_PORT` | HTTP API port | `3000` | No |
| `EVENT_CORE_BROKER_URL` | External MQTT broker URL | `mqtt://localhost:1883` | ✅ Yes* |
| `EVENT_CORE_BROKER_PORT` | Embedded broker port (fallback) | `1883` | No |
| `EVENT_CORE_BROKER_TIMEOUT` | Connection timeout (ms) | `2000` | No |
| `LOG_LEVEL` | Logging level | `info` | No |

*Required for multi-machine deployment

### Configuration Examples

**Development (localhost):**
```bash
EVENT_CORE_ID=core-dev
EVENT_CORE_PORT=3000
# Uses embedded broker (no external broker configured)
```

**Production (external broker):**
```bash
EVENT_CORE_ID=core-prod-1
EVENT_CORE_PORT=3000
EVENT_CORE_BROKER_URL=mqtt://mqtt.example.com:1883
EVENT_CORE_BROKER_TIMEOUT=5000
LOG_LEVEL=warn
```

### Fallback Behavior

**How Fallback Works:**

1. Core starts and attempts to connect to `EVENT_CORE_BROKER_URL`
2. If connection succeeds within `EVENT_CORE_BROKER_TIMEOUT` (default 2000ms):
   - ✅ Uses external broker
   - Logs: `mqtt.connected` (broker: external)
3. If connection fails or times out:
   - ⚠️ Starts embedded broker on `EVENT_CORE_BROKER_PORT`
   - Connects to own embedded broker
   - Logs: `mqtt.external.failed` → `mqtt.connected` (broker: embedded)

**Example Fallback Scenario:**

```bash
# Machine D has no network access to broker
EVENT_CORE_BROKER_URL=mqtt://192.168.1.12:1883  # Unreachable!
```

**Logs:**
```
⚠️  mqtt.external.failed: Connection timeout after 2000ms
🔄 Starting embedded broker on port 1883...
✅ mqtt.connected (broker: embedded, port: 1883)
```

**Result:** Core D runs in **isolated mode** with its own broker. It won't discover or communicate with other cores until network is restored.

---

## Validation and Testing

### Test 1: Discovery Validation

**Goal**: Verify all cores discover each other

**Steps:**

1. Start all cores
2. Wait 60 seconds (for discovery to stabilize)
3. Query discovery API on each core

**Command:**
```bash
# On each machine, run:
curl http://localhost:3000/api/discovery/cores | jq '.total'
```

**Expected**: Same number on all cores (e.g., `3` if you have 3 cores)

**Pass Criteria:**
- ✅ All cores see same number of peers
- ✅ `is_alive: true` for all cores
- ✅ `last_seen` timestamp within last 60 seconds

### Test 2: Event Communication

**Goal**: Verify events propagate across network

**Setup:**

1. **Machine B**: Subscribe to events
2. **Machine C**: Publish event
3. **Machine B**: Verify event received

**Machine B (Terminal 1):**
```bash
# Subscribe to all events
curl -X POST http://localhost:3000/modules/echo/test \
  -H "Content-Type: application/json" \
  -d '{"action": "subscribe", "pattern": "test.*"}'
```

**Machine C (Terminal 2):**
```bash
# Publish test event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "test.network",
    "data": {
      "message": "Hello from Core C",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }
  }'
```

**Machine B (Check Logs):**
```bash
# Check logs for received event
curl http://localhost:3000/api/logs?level=info | grep test.network
```

**Pass Criteria:**
- ✅ Event published successfully from Core C
- ✅ Event received by Core B within 100ms
- ✅ Event payload intact (no data loss)

### Test 3: P2P Security Handshake

**Goal**: Validate encrypted communication between cores

**Machine B:**
```bash
# Get Core B's public key
curl http://localhost:3000/modules/security-p2p/public-key
```

**Copy the public key, then on Machine C:**
```bash
# Trust Core B from Core C
curl -X POST http://localhost:3000/modules/security-p2p/trust-peer \
  -H "Content-Type: application/json" \
  -d '{
    "peer_id": "core-b",
    "public_key": "BASE64_PUBLIC_KEY_FROM_CORE_B"
  }'
```

**Repeat reverse direction (Core B trusts Core C)**

**Verify:**
```bash
# Check security status on both cores
curl http://localhost:3000/modules/security-p2p/status | jq '.trusted_peers'
```

**Pass Criteria:**
- ✅ Both cores have each other in `trusted_peers`
- ✅ Shared secret computed (32-byte hex)
- ✅ Encrypted events decrypt successfully

---

## Performance Metrics

### Network Latency

**Measure Event Propagation Time:**

```bash
# On Machine C, publish event with timestamp
START=$(date +%s%3N)
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d "{
    \"event_type\": \"test.latency\",
    \"data\": {\"start_ms\": $START}
  }"

# On Machine B, check when event was received
# (requires custom module or log parsing)
```

**Target Metrics (v0.5.0):**

| Metric | Target | Acceptable |
|--------|--------|-----------|
| Event Latency (LAN) | < 20ms | < 50ms |
| Discovery Update | < 30s | < 60s |
| Heartbeat Interval | 30s | 30s |
| Core Offline Detection | < 60s | < 120s |

### MQTT Broker Performance

**Monitor Broker Stats:**
```bash
# Mosquitto doesn't have built-in stats API
# Use external tools like Prometheus + MQTT exporter

# Or check logs
tail -f /var/log/mosquitto/mosquitto.log
```

**Key Metrics to Monitor:**
- Active connections (should equal number of cores)
- Messages/second (depends on workload)
- Retained messages (one per core for discovery)
- Queue depth (should stay low, < 100)

### Core Performance

**Check Core Metrics:**
```bash
curl http://localhost:3000/api/metrics
```

**Important Metrics:**
- `mqtt.messages.received`: Incoming event count
- `mqtt.messages.published`: Outgoing event count
- `mqtt.errors`: Should be 0
- `events.published`: Application-level events

---

## Troubleshooting

### Issue 1: Core Can't Connect to External Broker

**Symptoms:**
```
⚠️  mqtt.external.failed: Connection timeout after 2000ms
🔄 Starting embedded broker...
```

**Diagnosis:**
```bash
# Test broker connectivity from core machine
telnet 192.168.1.12 1883

# Or with mosquitto_pub
mosquitto_pub -h 192.168.1.12 -t test -m "ping"
```

**Solutions:**

1. **Firewall blocking port 1883:**
   ```bash
   sudo ufw allow 1883/tcp
   ```

2. **Broker not listening on external interface:**
   - Check `mosquitto.conf`: `listener 1883 0.0.0.0` (not `127.0.0.1`)
   - Restart: `sudo systemctl restart mosquitto`

3. **Incorrect broker IP:**
   - Verify with `ip addr show` on broker machine
   - Update `EVENT_CORE_BROKER_URL` in `.env`

4. **Network routing issue:**
   ```bash
   # Check route to broker
   traceroute 192.168.1.12
   ```

### Issue 2: Cores Don't Discover Each Other

**Symptoms:**
- Core starts successfully
- But `curl /api/discovery/cores` shows only local core

**Diagnosis:**
```bash
# Check if discovery messages are published
mosquitto_sub -h 192.168.1.12 -t 'core/+/status' -v

# Should see messages from ALL cores
```

**Solutions:**

1. **Cores using different brokers:**
   - All cores MUST use same external broker
   - Check `EVENT_CORE_BROKER_URL` on each machine

2. **Discovery not started:**
   - Check logs for: `🔍 [7/8] Initializing Discovery System...`
   - Should see: `✅ Discovery System started`

3. **MQTT retained messages not working:**
   - Verify Mosquitto persistence is enabled
   - Check: `persistence true` in `mosquitto.conf`

4. **Heartbeat interval too long:**
   - Default: 30s
   - Wait at least 60s after startup

### Issue 3: High Event Latency (> 50ms)

**Symptoms:**
- Events arrive but delayed
- Logs show gaps between publish and receive timestamps

**Diagnosis:**
```bash
# Measure network latency
ping -c 10 192.168.1.12

# Check broker load
ps aux | grep mosquitto
```

**Solutions:**

1. **Network congestion:**
   - Verify LAN is not saturated (use `iftop`)
   - Avoid WiFi, use Ethernet for cores

2. **Broker overloaded:**
   - Too many cores on single broker (> 50)
   - Consider broker clustering (v1.0.0)

3. **QoS too high:**
   - Event Core uses QoS 0 by default (best for low latency)
   - QoS 1/2 add overhead

4. **CPU throttling:**
   - Check CPU usage on broker machine
   - Upgrade broker machine if CPU > 80%

### Issue 4: Core Goes Offline Randomly

**Symptoms:**
- Core shows `is_alive: false` in discovery
- Then comes back online

**Diagnosis:**
```bash
# Check core logs for disconnections
curl http://CORE_IP:3000/api/logs?level=warn | grep mqtt.disconnect

# Check broker logs
tail -f /var/log/mosquitto/mosquitto.log | grep disconnect
```

**Solutions:**

1. **Network instability:**
   - Check for packet loss: `ping -c 100 CORE_IP`
   - Fix: Use stable wired network

2. **Broker restart:**
   - Check broker uptime
   - Fix: Enable Mosquitto auto-restart

3. **Core process crash:**
   - Check for unhandled exceptions in core logs
   - Fix: Use process manager (systemd, PM2)

4. **Insufficient keepalive:**
   - MQTT keepalive too short (default: 60s)
   - Increase in `mosquitto.conf`: `max_keepalive 120`

---

## Security

### Production Security Checklist

For production deployments, **DO NOT** use anonymous MQTT connections:

**1. Enable Mosquitto Authentication:**

```conf
# mosquitto.conf
allow_anonymous false
password_file /etc/mosquitto/passwd
```

Create password file:
```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd event-core
# Enter password when prompted
```

**2. Update Core Configuration:**

```bash
# .env
EVENT_CORE_BROKER_URL=mqtt://event-core:PASSWORD@192.168.1.12:1883
```

**3. Use TLS/SSL:**

```conf
# mosquitto.conf
listener 8883
protocol mqtt
cafile /etc/mosquitto/ca_certificates/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
```

Update cores:
```bash
EVENT_CORE_BROKER_URL=mqtts://event-core:PASSWORD@192.168.1.12:8883
```

**4. Firewall:**
- Only allow core machines to access broker port
- Block external access to MQTT ports

**5. Enable P2P Encryption:**
- Use `security-p2p` module for end-to-end encryption
- Exchange keys via secure channel (not MQTT)

---

## Next Steps

After successful network deployment:

1. **Scale Up**: Add more cores to network (v0.5.0 tested up to 10 cores)
2. **Observability**: Deploy Dashboard module to monitor all cores (v0.5.0 PHASE 2)
3. **Cloud Deployment**: Prepare for Internet-scale deployment (v1.0.0)
4. **High Availability**: Setup Mosquitto clustering (v1.0.0)

---

## References

- [Event Core Architecture](./ARCHITECTURE_FINAL.md)
- [Discovery System](../core/discovery/README.md)
- [MQTT Client](../core/mqtt/client.js)
- [Mosquitto Documentation](https://mosquitto.org/documentation/)
- [MQTT Protocol Specification](https://mqtt.org/mqtt-specification/)

---

**Questions or Issues?**

Open an issue on GitHub or consult the [Troubleshooting](#troubleshooting) section above.
