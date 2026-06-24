#!/bin/bash
set -e

echo "=========================================="
echo "Starting D-Bus system bus..."
mkdir -p /run/dbus
dbus-daemon --system --nofork &
sleep 2

echo "Starting Cloudflare WARP Daemon..."
warp-svc > /dev/null 2>&1 &
sleep 3

echo "Configuring Cloudflare WARP..."
warp-cli --accept-tos registration new || true
warp-cli --accept-tos mode proxy
warp-cli --accept-tos connect

sleep 5
echo "WARP Proxy is running on 127.0.0.1:40000"
echo "=========================================="

exec node addon.js
