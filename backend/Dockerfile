FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused npm run build

# Keep migration tooling separate from the API runtime.
FROM build AS migrate
USER node
CMD ["npm", "run", "prisma:migrate:deploy"]

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
# Strip dev declarations first: Prisma CLI is otherwise retained as an optional client peer.
RUN npm pkg delete devDependencies && npm ci --omit=dev --omit=peer && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 5000
CMD ["node", "dist/main.js"]
