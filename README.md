# PhoneShop

Minimal backend + ops artifacts for PhoneShop (Node.js + MySQL) with ALB-ready health endpoint,
PM2 process management, Nginx reverse proxy, and bootstrapping scripts for EC2.

Overview
- Node.js Express API (products + reviews + /api/health)
- MySQL (RDS) connection via mysql2
- PM2 ecosystem config for production process management
- Nginx site template to reverse-proxy to Node (port 3000)
- Bootstrap script (`scripts/bootstrap.sh`) for EC2 instances
- Docker Compose for local development (app + local MySQL)

Quickstart (local, Docker)
1. Copy example env:
   cp .env.example .env
   Edit .env to set DB credentials (for local Docker, `docker-compose` uses a matching DB)
2. Start services:
   docker-compose up --build
3. Visit:
   - API: http://localhost:3000/api/health
   - App static files (if served by app): http://localhost:3000/

Deploy on EC2 (summary)
- Use `scripts/bootstrap.sh` as user-data or run manually:
  - installs Node, PM2, nginx, clones repo, `npm ci`, starts PM2, enables pm2 startup & nginx
- Use ALB target group with health check path `/api/health` (HTTP port 80)
- Ensure RDS MySQL security group allows inbound 3306 from web instances' security group
- Use PM2 `pm2 save` + `pm2 startup` so processes auto-resurrect on reboot

Repository layout (selected)
- package.json, package-lock.json
- server.js, db.js, routes/...
- ecosystem.config.js
- .env.example
- scripts/bootstrap.sh
- nginx/phoneshop.conf.template
- docker-compose.yml, Dockerfile
- infra/schema.sql (DB schema + seed)
- .gitignore

Security note
- Never commit secrets. Use `.env.example`. For production use AWS Secrets Manager or SSM Parameter Store and inject via instance role or startup script.
