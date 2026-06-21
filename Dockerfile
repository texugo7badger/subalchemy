FROM node:20-slim

# Instala dependências do sistema, curl e dbus (necessário para o warp-cli)
RUN apt-get update && apt-get install -y curl gnupg lsb-release sudo net-tools dbus

# Adiciona o repositório da Cloudflare e instala o WARP
RUN curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/cloudflare-client.list
RUN apt-get update && apt-get install -y cloudflare-warp

# Define o diretório de trabalho
WORKDIR /usr/src/app

# Copia os arquivos do projeto
COPY package*.json ./
RUN npm install
COPY . .

# Expõe a porta (Render usa 10000 por padrão)
EXPOSE 10000

# Script para iniciar o WARP e o Node
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]