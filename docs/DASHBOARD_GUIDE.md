# Dashboard User Guide

**Version:** 0.5.0 "Network"
**Module:** dashboard v1.0.0

The Event Core Dashboard provides a real-time web interface for monitoring all cores in your network.

---

## Table of Contents

1. [Overview](#overview)
2. [Accessing the Dashboard](#accessing-the-dashboard)
3. [Dashboard Interface](#dashboard-interface)
4. [Features](#features)
5. [Use Cases](#use-cases)
6. [Troubleshooting](#troubleshooting)
7. [Configuration](#configuration)

---

## Overview

The Dashboard module is a built-in observability tool that provides:

- **Real-time monitoring** of all active cores
- **Live log streaming** from all cores via Server-Sent Events
- **Event flow visualization** to track inter-core communication
- **Aggregated metrics** from the discovery system
- **Modern web interface** with dark theme

### Key Features

✅ **Zero configuration** - Auto-discovers all cores via MQTT
✅ **Real-time updates** - No manual refresh needed
✅ **Lightweight** - Pure JavaScript, no heavy frameworks
✅ **Responsive design** - Works on desktop and mobile
✅ **Professional UI** - Clean dark theme interface

---

## Accessing the Dashboard

### Prerequisites

1. Event Core v0.5.0+ running
2. Dashboard module loaded (enabled by default)
3. Web browser (Chrome, Firefox, Safari, Edge)

### URL

The dashboard is accessible at:

```
http://<core-host>:<core-port>/modules/dashboard/
```

**Examples:**

```bash
# Local core on default port
http://localhost:3000/modules/dashboard/

# Remote core
http://192.168.1.10:3001/modules/dashboard/

# Auto-allocated port (check startup logs)
http://localhost:3001/modules/dashboard/
```

**Finding Your Port:**

Check the Event Core startup logs:

```
📍 Endpoints:
   HTTP Gateway:   http://localhost:3001
```

Then access: `http://localhost:3001/modules/dashboard/`

---

## Dashboard Interface

### Layout

The dashboard consists of four main sections:

```
┌─────────────────────────────────────────────────┐
│  Header (Title + Stats)                         │
├─────────────────────────────────────────────────┤
│  Active Cores (Grid View)                       │
├─────────────────────────────────────────────────┤
│  Real-time Logs (Scrollable)                    │
├─────────────────────────────────────────────────┤
│  Event Stream (Collapsible)                     │
├─────────────────────────────────────────────────┤
│  Footer (Version + Last Updated)                │
└─────────────────────────────────────────────────┘
```

### 1. Header

Displays key information at a glance:

- **Title**: Event Core Dashboard
- **Active Cores**: Count of online/total cores (e.g., "2/3")
- **Status Indicator**:
  - 🟢 Green = Connected
  - 🟡 Yellow = Connecting
  - 🔴 Red = Connection Error

### 2. Active Cores Section

Grid view showing all discovered cores with:

**Core Card Information:**
- **Core ID** (e.g., "core-a") - Unique identifier
- **Status Badge**:
  - "Online" (green) = Core is alive
  - "Offline" (red) = Core not responding
- **Version**: Event Core version (e.g., "0.5.0")
- **Host:Port**: Network address (e.g., "192.168.1.10:3000")
- **Uptime**: Human-readable uptime (e.g., "2h 15m")
- **Heartbeats**: Number of heartbeat messages received
- **Modules**: List of loaded modules (badges)

**Actions:**
- **↻ Refresh Button**: Manually refresh cores list
- **Auto-refresh**: Updates every 10 seconds automatically

### 3. Real-time Logs Section

Live log stream from all cores:

**Features:**
- **Auto-scroll**: Automatically scrolls to newest logs (toggle with checkbox)
- **Color-coded levels**:
  - 🔵 **DEBUG** - Gray background
  - 🔵 **INFO** - Blue background
  - 🟡 **WARN** - Yellow/orange background
  - 🔴 **ERROR** - Red background
- **Timestamps**: Each log entry shows time received
- **Clear Button**: Clear all logs from view
- **Buffer**: Keeps last 500 logs in memory

**Log Format:**
```
[12:34:56] INFO  dashboard.loaded {"module":"dashboard","version":"1.0.0"}
```

### 4. Event Stream Section

Shows events flowing between cores:

**Features:**
- **Collapsible**: Click header to toggle visibility
- **Real-time**: Events appear as they happen
- **Topic Display**: Shows MQTT topic (e.g., `core/core-a/events/test`)
- **Payload**: JSON data for each event
- **Clear Button**: Clear event history
- **Buffer**: Keeps last 100 events

---

## Features

### Real-Time Updates

The dashboard uses **Server-Sent Events (SSE)** for real-time updates:

- **Logs Stream**: Continuous feed of logs from all cores
- **Events Stream**: Live event flow visualization
- **Auto-refresh**: Cores list refreshes every 10 seconds
- **Connection monitoring**: Status indicator updates automatically

**How it Works:**

```
Dashboard (Browser) ←─ SSE ─→ Core (Server)
     │                           │
     │  Keep-alive connection    │
     │  ← log/event data ────────┤
     │                           │
     └── Displays in real-time ──┘
```

### Filtering & Controls

**Logs Section:**
- ✅ **Auto-scroll toggle**: Enable/disable automatic scrolling
- ✅ **Clear logs**: Remove all logs from view
- ✅ **Scroll history**: Manually scroll through past logs

**Events Section:**
- ✅ **Toggle visibility**: Collapse/expand section
- ✅ **Clear events**: Remove all events from view

**Cores Section:**
- ✅ **Manual refresh**: Force update of cores list
- ✅ **Hover effects**: Visual feedback on core cards

### Responsive Design

The dashboard adapts to different screen sizes:

**Desktop (> 768px):**
- Multi-column grid for cores (2-3 columns)
- Full sidebar for sections
- Horizontal stats layout

**Mobile (< 768px):**
- Single column layout
- Stacked sections
- Vertical stats layout

---

## Use Cases

### 1. Monitoring Production Deployment

**Scenario**: You have 5 cores running in production across different machines.

**How to Use Dashboard:**

1. Access dashboard from any core (they all show same data)
2. Check **Active Cores** section for all 5 cores showing "Online"
3. Monitor **Uptime** to ensure cores haven't restarted unexpectedly
4. Watch **Real-time Logs** for any ERROR or WARN messages
5. Check **Heartbeats** to verify cores are communicating

**What to Look For:**
- ✅ All cores show "Online" status
- ✅ Heartbeat counts increasing over time
- ✅ No ERROR logs appearing
- ⚠️ Any core showing "Offline" requires investigation

### 2. Debugging Inter-Core Communication

**Scenario**: Core A should send events to Core B, but they're not arriving.

**How to Use Dashboard:**

1. Open **Event Stream** section (click to expand)
2. Trigger the event from Core A
3. Watch for event appearing in stream with topic:
   `core/core-a/events/<event-type>`
4. Check **Logs** for any error messages about event publishing
5. Verify both cores appear in **Active Cores** as "Online"

**Troubleshooting Steps:**
- If event doesn't appear: Core A may not be publishing
- If event appears but Core B doesn't react: Check Core B's module subscriptions
- Check logs for "mqtt.publish.failed" or similar errors

### 3. Performance Monitoring

**Scenario**: Monitor system performance and resource usage.

**How to Use Dashboard:**

1. Check **Uptime** for each core (should be stable)
2. Monitor **Heartbeat** counts (should increment every 30s)
3. Watch **Logs** for performance warnings
4. Note any cores with frequent restarts (low uptime)

**Metrics to Track:**
- Uptime consistency
- Heartbeat regularity
- Log error rate
- Event flow volume

### 4. Development and Testing

**Scenario**: Developing a new module and testing it across cores.

**How to Use Dashboard:**

1. Start cores with new module loaded
2. Check **Modules** badges on each core card to confirm module loaded
3. Use **Logs** to see module initialization messages
4. Monitor **Events** to see module emitting/receiving events
5. Use **Clear logs** frequently to reset view for new tests

**Development Tips:**
- Keep dashboard open in split screen while coding
- Use auto-scroll to see latest logs immediately
- Clear logs between test runs for clarity
- Check all cores show same module version

### 5. Initial Setup Validation

**Scenario**: Just deployed Event Core network, want to verify everything works.

**How to Use Dashboard:**

1. Access dashboard from first core
2. **Active Cores** should show at least 1 core (itself)
3. Start additional cores and watch them appear automatically
4. Verify all cores show expected **Modules** loaded
5. Check **Logs** for any warnings during startup

**Validation Checklist:**
- ✅ Dashboard loads without errors
- ✅ At least one core appears in Active Cores
- ✅ Status indicator is green (Connected)
- ✅ Logs are streaming in real-time
- ✅ New cores appear within 60 seconds of starting

---

## Troubleshooting

### Dashboard Won't Load

**Symptoms**: HTTP 404 or "Cannot GET /modules/dashboard/"

**Solutions**:

1. **Check dashboard module is loaded:**
   ```bash
   curl http://localhost:3000/modules
   ```
   Look for "dashboard" in the list.

2. **Check port number:**
   Dashboard may be on auto-allocated port. Check startup logs:
   ```
   HTTP Gateway:   http://localhost:3001  # Use this port!
   ```

3. **Verify URL path:**
   Correct: `/modules/dashboard/`
   Wrong: `/dashboard/` or `/modules/dashboard` (no trailing slash)

### No Cores Showing

**Symptoms**: "No cores discovered yet" message

**Solutions**:

1. **Wait 60 seconds**: Discovery heartbeat interval is 30s
2. **Check MQTT connection**: Core logs should show:
   ```
   ✅ Connected to external broker on port 1883
   ```
3. **Verify discovery is running**:
   ```bash
   curl http://localhost:3000/api/discovery/cores
   ```

### Logs Not Updating

**Symptoms**: Logs section stays static

**Solutions**:

1. **Check SSE connection**: Look in browser DevTools Network tab for:
   ```
   /modules/dashboard/api/logs/stream (pending/EventStream)
   ```
2. **Firewall**: Ensure SSE isn't blocked (some proxies block long-lived connections)
3. **Browser compatibility**: Use modern browser (Chrome 6+, Firefox 6+, Safari 5+)
4. **Refresh page**: Force reconnect SSE streams

### Connection Status Shows Red

**Symptoms**: Status indicator is red, "Connection Error" text

**Solutions**:

1. **Core crashed**: Check if core process is running
2. **Network issue**: Verify network connectivity to core
3. **Port changed**: Core may have restarted on different port
4. **Check browser console**: Open DevTools and look for error messages

### Cores Show as "Offline"

**Symptoms**: Core cards show red "Offline" badge

**Possible Causes**:

1. **Core actually offline**: Core process stopped
2. **Discovery timeout**: Core hasn't sent heartbeat in 60s
3. **MQTT disconnected**: Check core logs for MQTT errors
4. **Network partition**: Cores can't reach MQTT broker

**Verify**:
```bash
# Check if core is running
curl http://<core-host>:<core-port>/health

# Check discovery status
curl http://localhost:3000/api/discovery/cores | jq '.cores[] | {id, is_alive, last_seen}'
```

### Styles Not Loading (Plain HTML)

**Symptoms**: Dashboard shows but with no styling

**Solutions**:

1. **Check CSS file**:
   ```bash
   curl http://localhost:3000/modules/dashboard/css/dashboard.css
   ```
   Should return CSS content, not 404.

2. **Browser cache**: Hard refresh with Ctrl+Shift+R (or Cmd+Shift+R on Mac)

3. **HTTPGateway issue**: Check core logs for errors serving static files

---

## Configuration

### Module Configuration

The dashboard module loads automatically with default settings. No configuration needed in most cases.

**Default Settings:**
- Log buffer: 1000 items
- Event buffer: 1000 items
- Auto-refresh interval: 10 seconds
- SSE reconnect: Automatic

### Customization (Advanced)

To customize dashboard behavior, edit `modules/dashboard/index.js`:

**Buffer Sizes:**
```javascript
this.maxBufferSize = 1000; // Change to 5000 for more history
```

**Frontend Settings** (`modules/dashboard/public/js/dashboard.js`):
```javascript
this.maxLogs = 500;    // Max logs to display
this.maxEvents = 100;  // Max events to display
setInterval(() => this.refreshCores(), 10000); // Refresh interval
```

### Disabling Dashboard

If you don't need the dashboard, remove the module:

```bash
# Temporarily
rm -rf modules/dashboard/

# Or move to backup
mv modules/dashboard/ modules/.dashboard.disabled/
```

Event Core will continue working normally without the dashboard.

---

## API Endpoints

The dashboard exposes these HTTP APIs (can be used programmatically):

### `GET /modules/dashboard/`
Returns dashboard HTML UI

### `GET /modules/dashboard/api/cores`
Returns JSON list of active cores

**Example Response:**
```json
{
  "cores": [
    {
      "id": "core-a",
      "version": "0.5.0",
      "host": "192.168.1.10",
      "port": 3000,
      "started_at": 1730808000000,
      "last_seen": 1730808120000,
      "heartbeat_count": 4,
      "is_alive": true,
      "modules": ["dashboard", "echo", "security-p2p"],
      "uptime_ms": 120000
    }
  ],
  "total": 1,
  "timestamp": 1730808120000
}
```

### `GET /modules/dashboard/api/logs/stream`
Server-Sent Events stream of logs

### `GET /modules/dashboard/api/events/stream`
Server-Sent Events stream of events

### `GET /modules/dashboard/api/metrics`
Returns aggregated metrics

---

## Tips & Best Practices

### For Development

1. **Keep dashboard open** in a second monitor while coding
2. **Use auto-scroll** to see new logs immediately
3. **Clear logs frequently** between test runs
4. **Monitor events** to debug inter-core communication

### For Production

1. **Bookmark dashboard URL** for quick access during incidents
2. **Check dashboard daily** as part of monitoring routine
3. **Watch for offline cores** - investigate immediately
4. **Monitor uptime trends** - frequent restarts indicate issues
5. **Review error logs** - address warnings before they become problems

### Performance

1. **Dashboard is lightweight** - safe to keep open 24/7
2. **SSE connections** use minimal bandwidth (only when data changes)
3. **Buffer limits** prevent memory issues (auto-cleanup old entries)
4. **Auto-refresh** is throttled to prevent server overload

---

## Next Steps

- [Network Deployment Guide](./NETWORK_DEPLOYMENT.md) - Deploy cores across machines
- [Architecture Documentation](./ARCHITECTURE_FINAL.md) - Understand the system
- [Module Development Guide](./GUIA_CREAR_MODULO.md) - Build custom modules

---

**Questions or Issues?**

Open an issue on GitHub or check the troubleshooting section above.

**Dashboard Version:** 1.0.0
**Compatible With:** Event Core v0.5.0+
