# Production Deployment Guide

Deploy skuhan.com (Drupal 11) to Hetzner VPS using Coolify with Docker Compose.

## Architecture

- **Single container**: nginx + PHP 8.3-FPM (managed by supervisord)
- **Database**: MariaDB 10.11 (separate container)
- **Reverse proxy**: Traefik (managed by Coolify, handles SSL)
- **Hosting**: Hetzner VPS via Coolify

## Prerequisites

- Hetzner VPS with Coolify installed
- Git repository (GitHub/GitLab) connected to Coolify
- Local DDEV environment for development

## Project Structure

```
skuhan/
├── Dockerfile                 # Multi-stage build (composer + production)
├── docker-compose.yaml        # Production compose file
├── .dockerignore              # Excludes dev files from build
├── .env.example               # Environment variable template
└── docker/
    ├── nginx.conf             # Drupal-optimized nginx config
    ├── php.ini                # PHP production settings
    ├── supervisord.conf       # Process manager config
    └── entrypoint.sh          # Container startup script
```

## Environment Variables

Set these in Coolify UI under your project's environment settings:

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database hostname | `db` |
| `DB_PORT` | Database port | `3306` |
| `DB_NAME` | Database name | `drupal` |
| `DB_USER` | Database user | `drupal` |
| `DB_PASSWORD` | Database password | `<secure-password>` |
| `DB_ROOT_PASSWORD` | MariaDB root password | `<secure-password>` |
| `DRUPAL_HASH_SALT` | Drupal hash salt | `<random-64-char-string>` |
| `DRUPAL_TRUSTED_HOST` | Trusted host pattern | `^skuhan\.com$` |

Generate secure values:
```bash
# Generate hash salt
openssl rand -base64 48

# Generate password
openssl rand -base64 24
```

## Initial Deployment

### Step 1: Export from Local DDEV

```bash
cd /home/foketina/skuhan

# Export database
ddev drush sql-dump --gzip > backup.sql.gz

# Export files
tar -czvf files-backup.tar.gz sites/default/files/
```

### Step 2: Create Project in Coolify

1. Log into Coolify dashboard
2. Create new project
3. Add **Docker Compose** resource
4. Connect your Git repository
5. Set compose file to `docker-compose.yaml`
6. Configure environment variables (see table above)
7. Set domain (Coolify assigns one like `xxx.crimio.net`, or use custom)
8. Deploy

### Step 3: Import Database

```bash
# Copy backup to VPS
scp backup.sql.gz root@<vps-ip>:/tmp/

# SSH to VPS
ssh root@<vps-ip>

# Find the database container
docker ps --filter "name=db"

# Import database
gunzip /tmp/backup.sql.gz
docker exec -i <db-container-name> mysql -u drupal -p<password> drupal < /tmp/backup.sql
```

### Step 4: Sync Files Directory

```bash
# Copy files to VPS
scp files-backup.tar.gz root@<vps-ip>:/tmp/

# SSH to VPS
ssh root@<vps-ip>

# Find app container
docker ps --filter "name=app"

# Extract files into container
docker cp /tmp/files-backup.tar.gz <app-container>:/var/www/html/
docker exec <app-container> tar -xzvf /var/www/html/files-backup.tar.gz -C /var/www/html/
docker exec <app-container> chown -R www-data:www-data /var/www/html/sites/default/files
docker exec <app-container> rm /var/www/html/files-backup.tar.gz
```

### Step 5: Clear Cache and Verify

```bash
docker exec <app-container> /var/www/html/vendor/bin/drush cr
```

Visit your site URL to verify it's working.

## Ongoing Deployments

### Auto-Deploy on Git Push

Coolify automatically rebuilds when you push to master:

1. Docker build runs `composer install`
2. Container starts, entrypoint.sh runs:
   - Database migrations (`drush updatedb`)
   - Config import (`drush config:import`)
   - Cache clear (`drush cache:rebuild`)
3. Site goes live

### Adding a New Module

```bash
# Local development
ddev composer require drupal/module_name
ddev drush en module_name -y
ddev drush cex -y

# Deploy
git add composer.json composer.lock config/sync/
git commit -m "Add module_name"
git push origin master
# Coolify auto-deploys
```

### Theme/Code Changes

```bash
git add themes/skuhan/
git commit -m "Update theme styles"
git push origin master
# Coolify auto-deploys
```

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker logs <app-container>
```

Common issues:
- Database not ready: entrypoint waits up to 60s
- Settings.php missing: entrypoint creates it automatically

### Database Connection Failed

Verify environment variables in Coolify match docker-compose.yaml.

Check database is healthy:
```bash
docker exec <db-container> healthcheck.sh --connect --innodb_initialized
```

### SSL/HTTPS Issues

Coolify manages SSL via Traefik. Check:
- Domain is correctly set in Coolify
- DNS points to VPS IP
- Traefik container is running

### Trusted Host Error (400 Bad Request)

Add domain pattern to trusted hosts in `docker/entrypoint.sh`:
```php
\$settings['trusted_host_patterns'] = [
  '${DRUPAL_TRUSTED_HOST}',
  '^localhost\$',
  '^.+\\.crimio\\.net\$',  // Coolify domains
];
```

### Drush Commands

Run drush inside container:
```bash
docker exec <app-container> /var/www/html/vendor/bin/drush <command>

# Examples
docker exec <app-container> /var/www/html/vendor/bin/drush cr
docker exec <app-container> /var/www/html/vendor/bin/drush cex -y
docker exec <app-container> /var/www/html/vendor/bin/drush uli
```

### View Container Logs

```bash
# All logs
docker logs <app-container>

# Follow logs
docker logs -f <app-container>

# nginx access logs
docker exec <app-container> tail -f /var/log/nginx/access.log

# nginx error logs
docker exec <app-container> tail -f /var/log/nginx/error.log
```

## Useful Commands

### Find Container Names
```bash
docker ps --filter "name=app"
docker ps --filter "name=db"
```

### Restart Containers
```bash
docker restart <app-container>
```

### Enter Container Shell
```bash
docker exec -it <app-container> sh
```

### Check Disk Usage
```bash
docker system df
```

### Backup Database from Production
```bash
docker exec <db-container> mysqldump -u drupal -p<password> drupal | gzip > prod-backup.sql.gz
```

## Volumes

| Volume | Mount Point | Purpose |
|--------|-------------|---------|
| `drupal_files` | `/var/www/html/sites/default/files` | User uploads (persistent) |
| `db_data` | `/var/lib/mysql` | Database storage (persistent) |

## Networks

| Network | Purpose |
|---------|---------|
| `internal` | App-to-DB communication |
| `coolify` | Traefik reverse proxy (external) |

## Security Notes

- Database credentials are stored in Coolify's encrypted environment variables
- SSL is handled by Traefik (Let's Encrypt certificates)
- PHP errors are logged but not displayed
- `expose_php` is disabled
- Trusted host patterns prevent host header attacks
