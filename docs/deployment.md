# TPT Beacon — Deployment Guide

## Quick Start (Docker Compose)

```bash
# Clone the repository
git clone https://github.com/tpt-solutions/tpt-beacon.git
cd tpt-beacon

# Start all services
docker compose up -d

# Check health
curl http://localhost:3000/api/healthz
curl http://localhost:3000/api/readyz
```

The Beacon server will be available at `http://localhost:3000`.

## First-Time Setup

1. **Create an admin account** (the default admin is seeded automatically):
   ```bash
   # Login with default admin
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@localhost","password":"admin"}'
   ```

2. **Change the default admin password** (recommended):
   ```bash
   # Use the token from login response
   curl -X PUT http://localhost:3000/api/auth/users/<user_id>/role \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"role":"admin"}'
   ```

3. **Set a secure JWT secret**:
   ```bash
   export BEACON_JWT_SECRET="your-secret-key-at-least-32-characters-long"
   ```

## Environment Variables

### Keystone Connection

| Variable | Default | Description |
|----------|---------|-------------|
| `KEYSTONE_HOST` | `127.0.0.1` | PostgreSQL host for Keystone |
| `KEYSTONE_PORT` | `5432` | PostgreSQL port |
| `KEYSTONE_DATABASE` | `keystone` | Database name |
| `KEYSTONE_USER` | `keystone` | Database user |
| `KEYSTONE_PASSWORD` | (empty) | Database password |

### Anvil (AI Layer)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANVIL_SOCKET` | (empty) | Path to Anvil daemon socket (e.g., `/run/anvil/anvil.sock`) |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `BEACON_JWT_SECRET` | `change-me-...` | JWT signing secret (min 32 chars) |
| `BEACON_TOKEN_HOURS` | `24` | JWT token lifetime in hours |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `RUST_LOG` | `info` | Log level (trace/debug/info/warn/error) |
| `BEACON_PORT` | `3000` | Server listen port |

## Docker Compose Configuration

### Production Deployment

Create a `.env` file:

```env
# Database
KEYSTONE_PASSWORD=your-secure-db-password

# Authentication (CRITICAL - change these!)
BEACON_JWT_SECRET=your-random-secret-key-at-least-32-characters

# AI Layer (optional)
ANVIL_SOCKET=/run/anvil/anvil.sock

# Logging
RUST_LOG=info
```

Update `docker-compose.yml` for production:

```yaml
services:
  keystone:
    image: tptsolutions/keystone:latest
    environment:
      KEYSTONE_USER: keystone
      KEYSTONE_PASSWORD: ${KEYSTONE_PASSWORD}
      KEYSTONE_DB: keystone
    volumes:
      - keystone-data:/var/lib/keystone
    restart: unless-stopped

  beacon-server:
    build: .
    depends_on:
      keystone:
        condition: service_healthy
    environment:
      KEYSTONE_HOST: keystone
      KEYSTONE_PORT: "5432"
      KEYSTONE_DATABASE: keystone
      KEYSTONE_USER: keystone
      KEYSTONE_PASSWORD: ${KEYSTONE_PASSWORD}
      BEACON_JWT_SECRET: ${BEACON_JWT_SECRET}
      ANVIL_SOCKET: ${ANVIL_SOCKET}
      RUST_LOG: ${RUST_LOG:-info}
    ports:
      - "127.0.0.1:3000:3000"  # Bind to localhost only
    restart: unless-stopped

volumes:
  keystone-data:
```

## Resource Sizing Guide

### Minimum (Development/Testing)

- **CPU**: 2 cores
- **RAM**: 4 GB
- **Disk**: 20 GB SSD
- **Use case**: Single user, small datasets (<1GB)

### Recommended (Small Team)

- **CPU**: 4 cores
- **RAM**: 8 GB
- **Disk**: 100 GB SSD
- **Use case**: 5-10 users, moderate datasets (1-10GB)

### Production (Organization)

- **CPU**: 8+ cores
- **RAM**: 16+ GB
- **Disk**: 500 GB SSD (NVMe preferred)
- **Use case**: 10-50 users, large datasets (10-100GB+)

### Performance Tips

1. **Database**: Use a dedicated PostgreSQL instance for Keystone
2. **Storage**: SSD is required for acceptable query performance
3. **Memory**: Increase `PG_SHARED_BUFFERS` for large datasets
4. **Network**: Ensure low latency between Beacon and Keystone (<5ms)

## API Endpoints

### Health Checks

- `GET /api/healthz` - Liveness probe (always 200)
- `GET /api/readyz` - Readiness probe (checks Keystone connectivity)

### Authentication

- `POST /api/auth/signup` - Create new user account
- `POST /api/auth/login` - Login and receive JWT
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/users` - List all users (admin only)
- `PUT /api/auth/users/{id}/role` - Update user role (admin only)
- `DELETE /api/auth/users/{id}` - Delete user (admin only)

### API Tokens

- `GET /api/tokens` - List your API tokens
- `POST /api/tokens` - Create new API token
- `DELETE /api/tokens/{id}` - Revoke API token

### Share Links

- `GET /api/shares?resource_type=dashboard&resource_id=xxx` - List share links
- `POST /api/shares` - Create share link
- `DELETE /api/shares/{id}` - Delete share link
- `GET /api/shares/{id}/validate` - Validate share link (public)

### Embedded Analytics

- `POST /api/embed/tokens` - Create embed token (requires auth)
- `GET /api/embed/tokens/{id}/validate` - Validate embed token (public)

### Schema Introspection

- `GET /api/schema/tables` - List all tables with extension indexes
- `GET /api/schema/tables/{table}/columns` - List columns for a table
- `GET /api/schema/tables/{table}/extensions` - Detect extension indexes
- `GET /api/schema/flux` - Detect Flux (event-log) tables

### Query Execution

- `POST /api/query` - Execute SQL query (read-only)
- `POST /api/compile` - Compile query to SQL

### Saved Queries

- `GET /api/queries` - List saved queries
- `POST /api/queries` - Create saved query
- `GET /api/queries/{id}` - Get saved query
- `PUT /api/queries/{id}` - Update saved query
- `DELETE /api/queries/{id}` - Delete saved query

### AI Layer (Anvil)

- `POST /api/ai/nl-to-query` - Natural language to query
- `POST /api/ai/suggest` - Get query suggestions
- `POST /api/ai/explain` - Explain query results

### Real-time

- `GET /api/ws/subscribe` - WebSocket for Flux CDC events

### Audit Log

- `GET /api/audit?limit=100` - Query audit log (admin only)

## Security Considerations

### Authentication

- JWT tokens expire after 24 hours (configurable)
- API tokens are SHA-256 hashed before storage
- Passwords are hashed with Argon2id
- Rate limiting: 100 requests per minute per IP

### Embedded Analytics

- Embed tokens are scoped to specific dashboards
- Tokens can include row-level filters for data isolation
- Tokens expire after a configurable duration (default 24 hours)

### SQL Safety

- Table/column names are validated against injection patterns
- Metric expressions are restricted to a safe allowlist
- Graph patterns are sanitized before execution
- Write operations are blocked in query execution

### Network Security

- Bind to `127.0.0.1` in production (not `0.0.0.0`)
- Use HTTPS in front of Beacon (reverse proxy)
- Restrict CORS to known frontend domains

## Troubleshooting

### "Keystone is not healthy"

- Check PostgreSQL is running: `pg_isready -h localhost -p 5432`
- Verify credentials in environment variables
- Check network connectivity between containers

### "Invalid JWT token"

- Ensure `BEACON_JWT_SECRET` is set and consistent
- Token may have expired (default 24 hours)
- Clear browser localStorage and re-login

### "Rate limited"

- Default: 100 requests per minute per IP
- Increase via `BEACON_RATE_LIMIT` environment variable
- Check for misconfigured load balancers

### "SQL injection attempt detected"

- Table/column names must be alphanumeric + underscores
- Metric expressions must use approved functions
- Contact admin if legitimate queries are blocked

## Backup and Recovery

### Database Backup

```bash
# Backup Keystone database
docker exec keystone pg_dump -U keystone keystone > backup.sql

# Restore
cat backup.sql | docker exec -i keystone psql -U keystone keystone
```

### Application Data

- In-memory stores (users, tokens, audit log) are lost on restart
- For production, implement persistent storage (PostgreSQL tables)
- Saved queries and dashboards should be backed up separately

## Monitoring

### Health Endpoints

```bash
# Liveness
curl http://localhost:3000/api/healthz

# Readiness (includes Keystone status)
curl http://localhost:3000/api/readyz
```

### Logs

```bash
# View Beacon logs
docker logs beacon-server

# Follow logs
docker logs -f beacon-server
```

### Metrics

- Structured JSON logs with request metrics
- Compatible with Prometheus/Grafana via log aggregation
- Track: request count, latency, error rate, client IPs
