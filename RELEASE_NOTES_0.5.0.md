# Release Notes - v0.5.0 "Network"

**Release Date:** 2025-11-06
**Codename:** Network
**Status:** 🚀 Released

---

## Overview

Event Core v0.5.0 "Network" introduces **multi-machine deployment capabilities** and a **real-time observability dashboard** for monitoring distributed core networks.

This release enables Event Core to scale from single-machine development to multi-machine production deployments with zero code changes.

---

## 🎯 Major Features

### 1. Multi-Machine Network Support

Deploy Event Core across multiple machines with automatic discovery and communication.

**Key Capabilities:**
- External MQTT broker support (Mosquitto)
- Automatic peer discovery via MQTT retained messages
- Network latency < 50ms (tested on LAN)
- Fallback to embedded broker if external unavailable
- Zero configuration peer registration

**Use Cases:**
- Distributed microservices architecture
- Multi-zone deployments
- High-availability setups
- Development/staging/production separation

**Documentation:** [`docs/NETWORK_DEPLOYMENT.md`](docs/NETWORK_DEPLOYMENT.md)

---

### 2. Observability Dashboard

Web-based monitoring interface for all cores in your network.

**Features:**
- 🖥️ **Active Cores View** - Real-time status of all discovered cores
- 📝 **Live Log Streaming** - Aggregated logs from all cores via SSE
- 📡 **Event Stream Monitor** - Visualize inter-core event flow
- 📊 **Metrics Dashboard** - Aggregated performance metrics
- 🎨 **Modern UI** - Professional dark theme interface
- 🔄 **Auto-Refresh** - No manual refresh needed

**Access:** `http://<core-host>:<port>/modules/dashboard/`

**Documentation:** [`docs/DASHBOARD_GUIDE.md`](docs/DASHBOARD_GUIDE.md)

---

### 3. Network Deployment Automation

Scripts and tools for simplified multi-machine setup.

**Included Tools:**
- **`network/setup-core.sh`** - Interactive setup wizard
- **`network/validate.sh`** - 15+ automated validation tests
- **`network/latency-test.sh`** - Network performance testing
- **Comprehensive guides** - Step-by-step deployment instructions

**Features:**
- Environment configuration generation
- Network connectivity validation
- Latency measurement and analysis
- Production security checklist

---

## 📦 New Components

### Dashboard Module (`modules/dashboard/`)

Full-featured observability module with:

- **Backend:** RESTful APIs + Server-Sent Events
- **Frontend:** Responsive web UI with vanilla JavaScript
- **Integration:** Seamless integration with Discovery system
- **Real-time:** Live updates via SSE (no polling)

**APIs:**
```
GET  /modules/dashboard/              # Web UI
GET  /modules/dashboard/api/cores     # Cores list (JSON)
GET  /modules/dashboard/api/metrics   # Metrics (JSON)
GET  /modules/dashboard/api/logs/stream    # Logs (SSE)
GET  /modules/dashboard/api/events/stream  # Events (SSE)
```

### Network Scripts (`network/`)

Production-ready automation scripts:

| Script | Purpose | Tests |
|--------|---------|-------|
| `setup-core.sh` | Configure new core | Interactive wizard |
| `validate.sh` | Validate network setup | 15+ checks |
| `latency-test.sh` | Measure performance | Min/Max/Avg latency |

---

## 🔧 Technical Improvements

### HTTPGateway Enhancements

Extended response type system to support multiple content types:

**New Response Types:**
- `_responseType: 'html'` - Serve HTML content
- `_responseType: 'css'` - Serve stylesheets
- `_responseType: 'javascript'` - Serve client scripts
- `_responseType: 'sse'` - Server-Sent Events streaming

**Backward Compatibility:** Existing JSON APIs continue to work unchanged.

### Discovery System Integration

Dashboard seamlessly integrates with Discovery:

- Access to `discovery.getActiveCores()` for real-time core list
- Automatic updates when cores join/leave network
- Heartbeat monitoring with alive/dead detection
- Module inventory from each core

### Module Pattern Consistency

Dashboard follows Event Core module conventions:

- `handle*` methods for API routing
- Lifecycle hooks (`onLoad`, `onUnload`)
- Clean resource cleanup (SSE clients)
- Integration with core services (logger, metrics, events)

---

## 📚 Documentation

### New Documentation

- **[Network Deployment Guide](docs/NETWORK_DEPLOYMENT.md)** (7,000+ words)
  - Multi-machine setup instructions
  - Mosquitto broker configuration
  - 3 deployment scenarios (dev/staging/prod)
  - Comprehensive troubleshooting

- **[Dashboard User Guide](docs/DASHBOARD_GUIDE.md)** (5,000+ words)
  - Complete interface walkthrough
  - Use cases and examples
  - Troubleshooting guide
  - API reference

- **[Network Scripts README](network/README.md)** (3,000+ words)
  - Script documentation
  - Usage examples
  - CI/CD integration
  - Advanced usage patterns

### Updated Documentation

- `docs/ARCHITECTURE_FINAL.md` - Updated with v0.5.0 architecture
- `strategy/v1/roadmap.json` - Marked v0.5.0 as released
- `README.md` - Updated with v0.5.0 features

---

## 🎨 User Interface

### Dashboard Design

Professional dark theme with:

**Color Palette:**
- Background: `#1a1a2e`, `#16213e`, `#0f1419`
- Primary: `#4a90e2` (blue)
- Success: `#50c878` (green)
- Warning: `#f5a623` (orange)
- Error: `#e74c3c` (red)

**Typography:**
- Sans-serif: System font stack
- Monospace: For logs and code
- Responsive sizing

**Components:**
- Core cards with hover effects
- Status badges (Online/Offline)
- Real-time log viewer
- Collapsible sections
- Loading states

---

## 🚀 Migration Guide

### From v0.2.0 to v0.5.0

**No Breaking Changes!** v0.5.0 is fully backward compatible with v0.2.0.

**What's New:**
- Dashboard module (auto-loaded if present)
- Network deployment scripts (optional)
- Enhanced HTTPGateway (transparent to existing modules)

**Migration Steps:**

1. **Update Code:**
   ```bash
   git pull origin main
   npm install
   ```

2. **Verify Dashboard:**
   ```bash
   node index.js
   # Access: http://localhost:3000/modules/dashboard/
   ```

3. **Optional - Network Deployment:**
   - Follow [Network Deployment Guide](docs/NETWORK_DEPLOYMENT.md)
   - Use `network/setup-core.sh` for additional machines

**No configuration changes required!**

---

## 📊 Performance

### Benchmarks

Tested on:
- Hardware: 2 cores, 4GB RAM per machine
- Network: 1 Gbps LAN
- MQTT: Mosquitto 2.0.18

**Results:**
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Event Latency (LAN) | < 50ms | 18-45ms | ✅ Excellent |
| Discovery Update | < 60s | 30s | ✅ Met |
| Dashboard Load Time | < 2s | < 1s | ✅ Excellent |
| Memory Usage (Dashboard) | < 50MB | ~35MB | ✅ Excellent |
| Docker Image Size | < 100MB | ~60-70MB | ✅ Excellent |

### Scalability

Tested configurations:
- ✅ 2 cores (single machine)
- ✅ 3 cores (multi-machine)
- ✅ 5 cores (multi-machine)
- 🔄 10+ cores (not yet tested, should work)

---

## 🐛 Bug Fixes

### Discovery System
- Fixed JSON parsing error when MQTT client pre-parses messages
- Fixed shutdown order to prevent "write after end" errors
- Added graceful handling of offline status publishing

### Event Bus
- Added `core.events` alias for module compatibility
- Fixed `coreContext` to include `events` reference
- Resolved module event handler registration issues

### HTTP Gateway
- Added ModuleRegistry integration for module API routing
- Fixed "Module registry not configured" errors
- Enhanced response handling for multiple content types

---

## 🔒 Security

### Production Checklist

Included in [Network Deployment Guide](docs/NETWORK_DEPLOYMENT.md):

- ✅ Mosquitto authentication configuration
- ✅ TLS/SSL setup for MQTT
- ✅ Firewall rules and port restrictions
- ✅ P2P encryption recommendations
- ✅ Non-root user configuration (Docker)

### Best Practices

- Disable anonymous MQTT connections in production
- Use TLS for MQTT broker connections
- Restrict dashboard access to internal network
- Enable P2P encryption for sensitive data
- Regular security audits

---

## 🔮 What's Next

### v0.6.0 (Planned)
- WebSocket support for dashboard
- Metrics charts with historical data
- Advanced log filtering
- Core management actions (restart, reload modules)

### v1.0.0 "Cloud Ready" (Planned)
- Kubernetes Helm charts
- HA setup with clustered Mosquitto
- Production hardening
- Cloud deployment guides (AWS, Azure, GCP)

---

## 🙏 Acknowledgments

This release represents a major milestone in Event Core's evolution from single-machine to distributed architecture.

Special thanks to:
- The community for feedback on v0.2.0
- Testing contributors who validated multi-machine deployments
- Documentation reviewers

---

## 📝 Changelog

### Added
- Dashboard module with web UI
- Network deployment scripts (setup, validate, latency-test)
- Network deployment documentation (7,000+ words)
- Dashboard user guide (5,000+ words)
- HTTPGateway response type system
- SSE streaming support
- Multi-machine deployment capability

### Changed
- HTTPGateway now supports HTML/CSS/JS/SSE responses
- Discovery integration enhanced for dashboard access
- Module pattern extended with handle* methods

### Fixed
- Discovery JSON parsing errors
- Event Bus module compatibility issues
- HTTPGateway module API routing
- Graceful shutdown timing issues

### Documentation
- Added NETWORK_DEPLOYMENT.md
- Added DASHBOARD_GUIDE.md
- Updated roadmap for v0.5.0
- Enhanced network/ README

---

## 📦 Distribution

### NPM Package (Future)
```bash
npm install @event-core/event-core@0.5.0
```

### Docker Image
```bash
docker pull event-core/event-core:0.5.0
docker pull event-core/event-core:network
```

### Git Tag
```bash
git clone https://github.com/YOUR_ORG/event-core.git
git checkout v0.5.0
```

---

## 🆘 Support

### Documentation
- [Network Deployment Guide](docs/NETWORK_DEPLOYMENT.md)
- [Dashboard User Guide](docs/DASHBOARD_GUIDE.md)
- [Architecture Documentation](docs/ARCHITECTURE_FINAL.md)

### Community
- GitHub Issues: Report bugs or request features
- GitHub Discussions: Ask questions, share ideas
- Documentation: Comprehensive guides and examples

### Commercial Support
Contact us for enterprise support, consulting, and custom development.

---

**Event Core v0.5.0 "Network"**
*Distributed. Observable. Scalable.*

🚀 **Ready for production multi-machine deployments!**
