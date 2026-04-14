# Guía de Despliegue - Recetas v2

## Requisitos Previos

### Sistema
- **Node.js:** 18.0.0+
- **SQLite3:** 3.30.0+
- **Memoria:** 2GB mínimo
- **Disco:** 100MB por 1000 recetas (estimado)

### Dependencias
```json
{
  "sqlite3": "^5.1.6",
  "sharp": "^0.32.0",
  "date-fns": "^2.30.0"
}
```

### Servicios Externos
- **OCR:** Google Vision API (para ingestion PDF/imágenes)
- **MQTT:** Broker MQTT (para eventos)
- **Logging:** Winston o similar

---

## Instalación Local

### 1. Clonar Repositorio

```bash
git clone https://github.com/noninapizzicas/2enki.git
cd 2enki
git checkout claude/analyze-system-architecture-IIwZ9
```

### 2. Instalar Dependencias

```bash
# Instalar todas las dependencias
npm install

# Verificar SQLite
npm list sqlite3

# Instalar sharp (OCR)
npm install sharp
```

### 3. Configurar Variables de Entorno

Crear archivo `.env.local`:

```bash
# Database
DB_PATH=data/projects

# OCR
GOOGLE_VISION_API_KEY=your-api-key
GOOGLE_VISION_PROJECT_ID=your-project-id

# MQTT Broker
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=user
MQTT_PASSWORD=pass

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Recetas API
RECETAS_MAX_FILE_SIZE=50MB
RECETAS_ALLOWED_SOURCES=pdf,imagen,url,json,manual
RECETAS_OCR_CONFIDENCE_THRESHOLD=0.5

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Feature Flags
FEATURE_VERSIONING=true
FEATURE_RANKING=true
FEATURE_ANALYSIS=true
```

### 4. Inicializar BD

```bash
# Crear estructura
mkdir -p data/projects
mkdir -p data/temp

# Tests de inicialización
npm test -- modules/recetas/__tests__/search-ranker.test.js
npm test -- modules/recetas/__tests__/search-filters.test.js
```

### 5. Iniciar Servidor

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

### 6. Verificar Salud

```bash
curl http://localhost:3000/health

# Respuesta esperada:
{
  "status": "ok",
  "modules": {
    "recetas": {
      "initialized": true,
      "databases": 1,
      "version": "2.0.0"
    }
  }
}
```

---

## Despliegue en Producción

### 1. Docker

**Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  pixman-dev \
  cairo-dev \
  libpng-dev \
  jpeg-dev

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código
COPY . .

# Crear directorios de datos
RUN mkdir -p data/projects data/temp

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD npm run health || exit 1

# Start
CMD ["npm", "start"]
```

**Build & Run:**

```bash
# Build
docker build -t 2enki-recetas:v2.0.0 .

# Run
docker run -d \
  --name recetas \
  -p 3000:3000 \
  -v recetas_data:/app/data \
  -e GOOGLE_VISION_API_KEY=key \
  -e MQTT_BROKER_URL=mqtt://broker:1883 \
  2enki-recetas:v2.0.0
```

### 2. Kubernetes

**deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recetas
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: recetas
  template:
    metadata:
      labels:
        app: recetas
    spec:
      containers:
      - name: recetas
        image: 2enki-recetas:v2.0.0
        ports:
        - containerPort: 3000
        env:
        - name: GOOGLE_VISION_API_KEY
          valueFrom:
            secretKeyRef:
              name: recetas-secrets
              key: api-key
        - name: MQTT_BROKER_URL
          value: mqtt://mqtt-broker:1883
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        volumeMounts:
        - name: data
          mountPath: /app/data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: recetas-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: recetas-service
spec:
  selector:
    app: recetas
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

**Deploy:**

```bash
kubectl apply -f deployment.yaml
kubectl get pods -l app=recetas
kubectl logs -f deployment/recetas
```

### 3. AWS (EC2 + RDS alternative)

**Usar SQLite local** (no requiere RDS):

```bash
# SSH a instancia
ssh -i key.pem ec2-user@instance-ip

# Clone y setup
git clone ... && cd 2enki
npm install && npm run build

# Systemd service
sudo tee /etc/systemd/system/recetas.service <<EOF
[Unit]
Description=2enki Recetas Module
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/home/app/2enki
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable recetas
sudo systemctl start recetas
```

**Monitoreo CloudWatch:**

```bash
# AWS CLI - logs
aws logs tail /aws/ec2/recetas --follow

# Métricas
aws cloudwatch put-metric-alarm \
  --alarm-name recetas-health \
  --alarm-actions arn:aws:sns:...
```

---

## Configuración de Producción

### 1. Logging

**Winston config:**

```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

### 2. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // 100 req/min
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/projects/:projectId/recetas/', limiter);
```

### 3. CORS

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  maxAge: 86400
}));
```

### 4. Compresión

```javascript
app.use(compression({
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
```

---

## Backup & Recovery

### 1. Backup Automático

**Script: `backup.sh`**

```bash
#!/bin/bash
BACKUP_DIR="/backups/recetas"
DATE=$(date +%Y%m%d_%H%M%S)

# Crear snapshot por proyecto
for project_dir in data/projects/*/; do
  project=$(basename "$project_dir")
  sqlite3 "$project_dir/recetas.db" ".backup '/backups/recetas_${project}_${DATE}.db'"
done

# Comprimir
tar -czf "$BACKUP_DIR/recetas_backup_${DATE}.tar.gz" /backups/*.db

# Limpiar backups viejos (>30 días)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completado: $BACKUP_DIR/recetas_backup_${DATE}.tar.gz"
```

**Cron:**

```bash
# Daily backup at 2 AM
0 2 * * * /app/backup.sh >> /var/log/recetas-backup.log 2>&1
```

### 2. Recovery

```bash
# Listar backups
ls -lh /backups/recetas_backup_*.tar.gz

# Extraer
tar -xzf /backups/recetas_backup_2026_04_14.tar.gz -C /

# Restaurar proyecto
cp /backups/recetas_proj_123_20260414_000000.db data/projects/proj_123/recetas.db
```

### 3. Verificación de Integridad

```sql
-- SQLite
PRAGMA integrity_check;

-- Resultado: "ok" si todo está bien
```

---

## Monitoreo en Producción

### 1. Métricas Clave

```javascript
const promClient = require('prom-client');

const searchCounter = new promClient.Counter({
  name: 'recetas_search_total',
  help: 'Total searches',
  labelNames: ['criteria_type', 'result_count']
});

const ingestDuration = new promClient.Histogram({
  name: 'recetas_ingest_duration_seconds',
  help: 'Ingestion duration',
  buckets: [1, 5, 10, 30, 60]
});

const versionCount = new promClient.Gauge({
  name: 'recetas_total_versions',
  help: 'Total recipe versions',
  labelNames: ['project_id']
});
```

### 2. Alertas

| Métrica | Threshold | Acción |
|---------|-----------|--------|
| Error Rate | > 5% | Page oncall |
| Search Latency | > 2s | Investigate indices |
| Ingestion Queue | > 100 | Scale workers |
| DB Size | > 500MB | Archive project |
| API Errors | > 100/min | Check service |

### 3. Dashboard Grafana

```json
{
  "dashboard": {
    "title": "Recetas v2",
    "panels": [
      {
        "title": "Search Requests/min",
        "targets": [
          {"expr": "rate(recetas_search_total[1m])"}
        ]
      },
      {
        "title": "Ingest Duration (p95)",
        "targets": [
          {"expr": "histogram_quantile(0.95, recetas_ingest_duration_seconds)"}
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {"expr": "rate(recetas_errors_total[5m]) / rate(recetas_requests_total[5m])"}
        ]
      }
    ]
  }
}
```

---

## Troubleshooting

### Problema: "Database is locked"

**Causa:** Múltiples procesos escribiendo simultáneamente

**Solución:**
```javascript
// Aumentar timeout
db.configure("busyTimeout", 30000); // 30 segundos

// O usar queue
const queue = new PQueue({ concurrency: 1 });
await queue.add(() => manager.updateReceta(...));
```

### Problema: "OCR confidence too low"

**Causa:** Imagen de baja calidad

**Solución:**
```bash
# Reducir threshold
RECETAS_OCR_CONFIDENCE_THRESHOLD=0.3

# O reintentarvarios veces con diferentes configuraciones
```

### Problema: "Out of memory during ingest"

**Causa:** Archivos muy grandes

**Solución:**
```javascript
// Procesar por chunks
const chunks = await splitPDF(file, 10); // 10 páginas por chunk
for (const chunk of chunks) {
  await processChunk(chunk);
}
```

### Problema: "Search is slow"

**Causa:** Índices no optimizados

**Verificación:**
```sql
-- Ver planes de query
EXPLAIN QUERY PLAN 
SELECT * FROM receta_search_index 
WHERE proyecto_id = ? AND nombre_lower LIKE ?;

-- Analizar tabla
ANALYZE;

-- Reconstruir índices
REINDEX;
```

---

## Checklist de Despliegue

- [ ] Envs configuradas (.env.production)
- [ ] BD inicializada y backups configurados
- [ ] Dependencias instaladas (npm ci)
- [ ] Tests pasando (npm test)
- [ ] Build optimizado (npm run build)
- [ ] Logging configurado
- [ ] Rate limiting habilitado
- [ ] CORS configurado
- [ ] Healthchecks probados
- [ ] Monitoreo en Grafana
- [ ] Alertas configuradas
- [ ] Runbook disponible (este documento)
- [ ] Rollback plan documentado
- [ ] 2 réplicas mínimo

---

## Rollback

Si hay problemas en producción:

```bash
# 1. Detener instancia actual
kubectl scale deployment recetas --replicas=0

# 2. Restaurar desde backup
cp /backups/recetas_backup_2026_04_13.tar.gz .
tar -xzf recetas_backup_2026_04_13.tar.gz

# 3. Iniciar versión anterior
docker run -d \
  --name recetas \
  2enki-recetas:v1.0.0 # versión anterior

# 4. Verificar salud
curl http://localhost:3000/health

# 5. Escalar de nuevo
kubectl scale deployment recetas --replicas=2
```

---

## Soporte

- **Docs:** Leer README.md, SCHEMA.md, PIPELINE.md
- **Tests:** `npm test modules/recetas/__tests__/`
- **Logs:** `tail -f logs/error.log`
- **Issues:** GitHub issues en 2enki repo
