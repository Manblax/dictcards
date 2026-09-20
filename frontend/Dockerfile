FROM node:22-bookworm-slim AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM dependencies AS build

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG INTERNAL_API_URL=http://backend:3001

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL

COPY next.config.mjs postcss.config.mjs tsconfig.json ./
COPY app ./app
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY types ./types
COPY scripts/update-geoip.mjs ./scripts/update-geoip.mjs
RUN npm run geoip:update
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG INTERNAL_API_URL=http://backend:3001

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_API_URL=$INTERNAL_API_URL

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/.next ./.next
COPY --from=build /app/.geoip/data ./.geoip/data
COPY lib/geoip-database.mjs ./lib/geoip-database.mjs
COPY scripts/update-geoip.mjs ./scripts/update-geoip.mjs
RUN mkdir -p .geoip/tmp
COPY next.config.mjs ./

EXPOSE 3000

CMD ["npm", "run", "start"]
