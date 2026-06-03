FROM node:22-alpine

# Instalar pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copiar archivos de workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/domain/package.json ./packages/domain/
COPY packages/infrastructure/package.json ./packages/infrastructure/

# Instalar dependencias
RUN pnpm install --frozen-lockfile --prod=false

# Copiar código fuente
COPY apps/gateway ./apps/gateway
COPY packages/domain ./packages/domain
COPY packages/infrastructure ./packages/infrastructure

# Generar Prisma Client y Compilar
RUN pnpm --filter @agentes/domain build && \
    pnpm --filter @agentes/infrastructure build && \
    cd apps/gateway && \
    npx prisma generate && \
    pnpm build

EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

CMD ["pnpm", "--filter", "gateway", "start:prod"]
