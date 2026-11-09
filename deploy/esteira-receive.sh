#!/usr/bin/env bash
# Roda NO SERVIDOR. É o único comando que a chave do colaborador pode executar
# (forced command no authorized_keys). Recebe o pacote .tgz pelo stdin, atualiza
# só a pasta da Esteira e recarrega só o processo PM2 da Esteira.
# Instalar em /home/ubuntu/bin/esteira-receive.sh (fora da pasta do app, que o deploy apaga).
set -euo pipefail

REMOTE_DIR=/home/ubuntu/esteira-de-trafego
TMP="$(mktemp /tmp/esteira-XXXXXX.tgz)"
trap 'rm -f "$TMP"' EXIT

cat > "$TMP"

# Recusa caminhos absolutos, ".." e qualquer coisa fora da lista permitida
ALLOWED='^(server|shared|scripts|web/dist|deploy|package\.json|package-lock\.json|ecosystem\.config\.cjs)(/|$)'
if tar -tzf "$TMP" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Pacote recusado: caminho inválido" >&2; exit 1
fi
if tar -tzf "$TMP" | grep -Ev "$ALLOWED" | grep -q .; then
  echo "Pacote recusado: contém arquivos fora do permitido" >&2; exit 1
fi

cd "$REMOTE_DIR"
rm -rf server shared scripts web/dist deploy
tar -xzf "$TMP"
npm ci --omit=dev --no-audit --no-fund
pm2 startOrReload ecosystem.config.cjs --only esteira-de-trafego --update-env
pm2 save
echo "==> Publicado"
