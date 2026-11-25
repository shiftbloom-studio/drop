# drop without Cloudflare: one Node.js process, files on disk, metadata in SQLite.
# Build: docker build -t drop .   Run: see compose.yaml and the README.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# the Node build only needs esbuild (at the version in the lockfile), not Wrangler and the rest
RUN npm install --no-save --no-package-lock --no-audit --no-fund \
      "esbuild@$(node -p "require('./package-lock.json').packages['node_modules/esbuild'].version")"
COPY src ./src
RUN npm run build:node

FROM node:26-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8787 \
    NODE_NO_WARNINGS=1
WORKDIR /app
COPY --from=build /app/dist/node ./dist/node
COPY migrations ./migrations
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/node/server.js"]
