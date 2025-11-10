# Event Core - Docker Setup

Docker setup for running Event Core in containers with multi-core architecture.

## Quick Start

```bash
# Build and start both cores
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop cores
docker-compose down
```

## Architecture

The docker-compose setup runs two Event Core instances:

- **Core A** (core-a): Primary core with embedded MQTT broker
  - HTTP Gateway: `http://localhost:3000`
  - MQTT Broker: `mqtt://localhost:1883`

- **Core B** (core-b): Secondary core connecting to Core A
  - HTTP Gateway: `http://localhost:3001`
  - MQTT: Connects to Core A's broker

Both cores:
- Discover each other automatically via MQTT retained messages
- Share the same MQTT broker (Core A's embedded broker)
- Can establish P2P trust and encrypted communication
- Run in isolated containers with persistent volumes

## Image Details

### Multi-Stage Build
- **Stage 1 (deps)**: Installs production dependencies
- **Stage 2 (production)**: Minimal runtime image

### Base Image
- `node:18-alpine` (~40MB base)
- Total image size: **< 100MB** (target met)

### Security Features
- Non-root user (nodejs:1001)
- dumb-init for proper signal handling
- Health checks every 30s
- Read-only root filesystem capable

### Optimizations
- Production-only dependencies
- Multi-stage build reduces layers
- .dockerignore excludes unnecessary files
- npm cache cleaned

## Testing Multi-Core Communication

### 1. Start the cores
```bash
docker-compose up -d
```

### 2. Wait for discovery (30s)
```bash
docker-compose logs -f | grep discovery.core.discovered
```

You should see:
```
core-a | discovery.core.discovered {"core_id":"core-b"...}
core-b | discovery.core.discovered {"core_id":"core-a"...}
```

### 3. Test inter-core communication
```bash
# Get Core B's public key
curl http://localhost:3001/modules/security-p2p/public-key

# Establish P2P trust (from host)
# ... (see main README for full P2P handshake)
```

### 4. View stats
```bash
# Core A stats
curl http://localhost:3000/stats

# Core B stats
curl http://localhost:3001/stats
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `EVENT_CORE_ID` | `event-core` | Core instance ID |
| `EVENT_CORE_PORT` | `3000` | HTTP Gateway port |
| `EVENT_CORE_BROKER_PORT` | `1883` | MQTT Broker port |
| `EVENT_CORE_LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `EVENT_CORE_MODULES_PATH` | `./modules` | Path to modules directory |

### Volumes

- `core-a-data`: Persistent data for Core A
- `core-b-data`: Persistent data for Core B

### Networks

- `event-core-net`: Bridge network for inter-container communication

## Health Checks

Each container has a health check that:
- Runs every 10s
- Timeout after 3s
- 3 retries before marking unhealthy
- 10s start period

Health check endpoint: `GET /health`

Expected response:
```json
{
  "status": "healthy",
  "core_id": "core-a",
  "uptime": 12345,
  "timestamp": "2025-11-05T15:00:00.000Z"
}
```

## Scaling

To run more cores, add to `docker-compose.yml`:

```yaml
core-c:
  build:
    context: .
    dockerfile: Dockerfile
  environment:
    - EVENT_CORE_ID=core-c
    - EVENT_CORE_PORT=3000
  ports:
    - "3002:3000"
  networks:
    - event-core-network
```

All cores will automatically discover each other via the shared MQTT broker.

## Troubleshooting

### Core not discovering others
```bash
# Check MQTT connectivity
docker-compose exec core-a node -e "const mqtt = require('mqtt'); const c = mqtt.connect('mqtt://core-a:1883'); c.on('connect', () => { console.log('OK'); process.exit(0); });"
```

### View discovery messages
```bash
docker-compose logs | grep "discovery"
```

### Check network
```bash
docker network inspect event-core-net
```

### Rebuild from scratch
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

## Production Deployment

### Kubernetes
See `k8s/` directory for Kubernetes manifests (coming in v1.0.0).

### Docker Swarm
```bash
docker stack deploy -c docker-compose.yml event-core
```

### Cloud Platforms
- **AWS ECS**: Use task definitions with bridge networking
- **Google Cloud Run**: Single core per service, external MQTT broker
- **Azure Container Instances**: Use container groups

## Performance

### Resource Usage (per core)
- **CPU**: ~5-10% idle, ~20-30% under load
- **Memory**: ~50-80MB
- **Disk**: Minimal (<10MB logs per day)
- **Network**: <1MB/s for discovery and events

### Limits (recommended)
```yaml
deploy:
  resources:
    limits:
      cpus: '0.5'
      memory: 256M
    reservations:
      cpus: '0.1'
      memory: 64M
```

## Security

### Running as non-root
All containers run as `nodejs:1001` user.

### Network isolation
Cores communicate only through defined network.

### Secrets management
Use Docker secrets or environment variables for sensitive data:

```yaml
secrets:
  mqtt_password:
    external: true
environment:
  - MQTT_PASSWORD_FILE=/run/secrets/mqtt_password
```

## License

MIT - See LICENSE file

## Support

For issues and questions, see the main README.md
