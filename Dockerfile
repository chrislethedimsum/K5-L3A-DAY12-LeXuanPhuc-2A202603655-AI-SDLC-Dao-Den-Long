FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts/run.mjs ./scripts/run.mjs
COPY --from=builder /app/game.contract.json ./game.contract.json
EXPOSE 4173
CMD ["node", "scripts/run.mjs", "--host", "0.0.0.0", "--port", "4173"]
