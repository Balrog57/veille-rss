FROM node:20-alpine AS base

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

COPY scripts/pull-ollama-model.sh ./scripts/pull-ollama-model.sh
COPY src/ ./src/

EXPOSE 4000

CMD ["node", "src/index.js"]
