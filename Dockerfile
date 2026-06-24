FROM node:20-slim

# Installs system dependencies, curl, dbus (required for warp-cli)
# and build toolchain (python3, make, g++) required by lzma-native.
RUN apt-get update && apt-get install -y \
        curl gnupg lsb-release sudo net-tools dbus \
        python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add Cloudflare repository and install WARP
RUN curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg \
    | gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" \
    | tee /etc/apt/sources.list.d/cloudflare-client.list
RUN apt-get update && apt-get install -y cloudflare-warp \
    && rm -rf /var/lib/apt/lists/*

# Working Directory
WORKDIR /usr/src/app

# Copies package*.json and installs dependencies (includes native build step)
COPY package*.json ./
RUN npm install --omit=dev

# Copies the rest of the project
COPY . .

EXPOSE 10000

# Script to start D-Bus + WARP + Node
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
