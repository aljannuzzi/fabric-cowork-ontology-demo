FROM mcr.microsoft.com/devcontainers/javascript-node:20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM mcr.microsoft.com/devcontainers/javascript-node:20
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
EXPOSE 8080
CMD ["node", "src/server.js"]
