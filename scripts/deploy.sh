#!/usr/bin/env bash
# Publica a Esteira de Tráfego no servidor Oracle (rodar no Git Bash a partir da raiz do projeto).
# Envia só o código e o build — .env e data/ do servidor nunca são sobrescritos.
set -euo pipefail

SERVER="${SERVER:-ubuntu@144.22.163.43}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/oracle_esteira.key}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/esteira-de-trafego}"
SSH="ssh -i $SSH_KEY -o BatchMode=yes"

cd "$(dirname "$0")/.."

echo "==> Build do frontend"
npm run build

echo "==> Empacotando"
PKG="$(mktemp -d)/esteira.tgz"
tar -czf "$PKG" server shared scripts web/dist package.json package-lock.json ecosystem.config.cjs deploy

echo "==> Enviando para $SERVER:$REMOTE_DIR"
$SSH "$SERVER" "mkdir -p '$REMOTE_DIR'"
scp -i "$SSH_KEY" -o BatchMode=yes "$PKG" "$SERVER:/tmp/esteira.tgz"

echo "==> Instalando e reiniciando"
$SSH "$SERVER" bash -s <<EOF
set -euo pipefail
cd '$REMOTE_DIR'
rm -rf server shared scripts web/dist deploy
tar -xzf /tmp/esteira.tgz && rm /tmp/esteira.tgz
npm ci --omit=dev --no-audit --no-fund
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
EOF

rm -f "$PKG"
echo "==> Pronto"
