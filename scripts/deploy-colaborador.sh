#!/usr/bin/env bash
# Publicação para o colaborador (chave restrita: só consegue atualizar a Esteira).
# Uso, no Git Bash na raiz do projeto:
#   SSH_KEY=~/.ssh/esteira_amigo bash scripts/deploy-colaborador.sh
set -euo pipefail

SERVER="${SERVER:-ubuntu@144.22.163.43}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/esteira_amigo}"

cd "$(dirname "$0")/.."

echo "==> Build do frontend"
npm run build

echo "==> Empacotando e enviando"
PKG="$(mktemp -d)/esteira.tgz"
tar -czf "$PKG" server shared scripts web/dist package.json package-lock.json ecosystem.config.cjs deploy
ssh -i "$SSH_KEY" -o BatchMode=yes "$SERVER" < "$PKG"
rm -f "$PKG"
echo "==> Pronto"
