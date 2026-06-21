#!/bin/bash

echo "=========================================="
echo "Starting D-Bus system bus..."
# Inicia o barramento de sistema necessário para o warp-cli
mkdir -p /run/dbus
dbus-daemon --system --nofork &
sleep 2

echo "Starting Cloudflare WARP Daemon..."
# Inicia o serviço do WARP em background
warp-svc &
sleep 3

echo "Configuring Cloudflare WARP..."
# CORREÇÃO: Adicionar --accept-tos em todos os comandos
warp-cli --accept-tos registration new || true
warp-cli --accept-tos mode proxy
warp-cli --accept-tos connect

# Aguarda 5 segundos para o proxy SOCKS5 ficar online
sleep 5
echo "WARP Proxy should be running on 127.0.0.1:40000"
echo "=========================================="

# Inicia a aplicação Node.js
exec node addon.js