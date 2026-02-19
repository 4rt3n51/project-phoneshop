#!/usr/bin/env bash
set -euo pipefail

# Usage: run as root or with sudo on Ubuntu
# Example: sudo bash bootstrap.sh <git-repo-url> <branch-or-tag>
REPO_URL=${1:-"REPO_URL_PLACEHOLDER"}
BRANCH=${2:-"main"}
APP_DIR=${3:-"/opt/phoneshop"}
USER=${SUDO_USER:-ubuntu}

echo "Bootstrapping PhoneShop on $(hostname) as user $USER"

# Update and install
apt-get update -y
apt-get upgrade -y
apt-get install -y build-essential git curl nginx default-mysql-client

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
npm install -g pm2@latest

# Create app directory & clone
mkdir -p "$APP_DIR"
chown "$USER":"$USER" "$APP_DIR"
sudo -u "$USER" bash -lc "git clone --depth 1 --branch $BRANCH $REPO_URL $APP_DIR || (cd $APP_DIR && git fetch && git checkout $BRANCH && git pull)"

# Install app deps
cd "$APP_DIR"
sudo -u "$USER" bash -lc "npm ci --production"

# copy sample nginx conf
NGINX_SITE="/etc/nginx/sites-available/phoneshop"
if [ ! -f "$NGINX_SITE" ]; then
  cp "$APP_DIR/nginx/phoneshop.conf.template" "$NGINX_SITE"
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/phoneshop
  rm -f /etc/nginx/sites-enabled/default || true
fi

# pm2 start & startup
sudo -u "$USER" bash -lc "pm2 start ecosystem.config.js --env production || true"
sudo -u "$USER" bash -lc "pm2 save || true"
# register startup script (this command outputs another command; run as root)
env PATH=$PATH pm2 startup systemd -u "$USER" --hp "/home/$USER" | sed -n '1,200p'

# ensure nginx enabled
systemctl restart nginx
systemctl enable nginx

echo "Bootstrap complete. Edit /opt/phoneshop/.env with DB credentials or configure secrets management."
