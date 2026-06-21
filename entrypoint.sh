#!/bin/bash

echo "=========================================="
echo "Starting D-Bus system bus..."
# Inicia o barramento de sistema necessário para o warp-cli
mkdir -p /run/dbus
dbus-daemon --system --nofork &
sleep 2

echo "Starting Cloudflare WARP..."
# Registra o cliente WARP (silenciosamente)
warp-cli registration new || true
# Define o modo proxy (SOCKS5 na porta 40000)
warp-cli mode proxy
# Conecta ao WARP
warp-cli connect

# Aguarda 5 segundos para o proxy SOCKS5 ficar online
sleep 5
echo "WARP Proxy should be running on 127.0.0.1:40000"
echo "=========================================="

# Inicia a aplicação Node.js
exec node addon.js