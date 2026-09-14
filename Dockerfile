FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
USER node
ENV HOST=0.0.0.0 PORT=8100 MODE=simulate
EXPOSE 8100
CMD ["node", "server.mjs"]
