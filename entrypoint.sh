#!/bin/bash

echo "=========================================="
echo "Starting Cloudflare WARP..."
# Registra o cliente WARP (silenciosamente)
warp-cli registration new || true
# Conecta ao WARP
warp-cli mode proxy
warp-cli connect

# Aguarda 5 segundos para o proxy SOCKS5 (porta 40000) ficar online
sleep 5
echo "WARP Proxy should be running on 127.0.0.1:40000"
echo "=========================================="

# Inicia a aplicação Node.js
exec node addon.js