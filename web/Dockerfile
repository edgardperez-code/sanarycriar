# Sitio de marketing de Sanar y Criar en un contenedor (Railway u otro hosting de
# contenedores). Compila Astro; Caddy sirve las páginas estáticas en $PORT (8080 por
# defecto) y pasa /blog, /blog/* y /_server-islands/* a Node (Astro bajo demanda) en
# 127.0.0.1:$SSR_PORT, dentro del mismo contenedor (deploy/start.sh, con tini).
# El TLS lo pone la plataforma delante (Railway); este contenedor habla HTTP.
#
# Las variables PUBLIC_* terminan en el HTML/JS, así que se pasan al compilar
# (Railway entrega las variables del servicio como argumentos de compilación).
# SITE_ORIGIN, PLATFORM_ORIGIN, APEX_HOST y LH_API_INTERNAL se leen al arrancar.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG PUBLIC_LH_PLATFORM
ARG PUBLIC_LH_API
ARG PUBLIC_LH_ORG_ID=1
ARG PUBLIC_SITE_URL
ARG PUBLIC_FREE_CLASS_URL
ARG PUBLIC_BOOKING_URL
RUN npm run build

FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
RUN apk add --no-cache tini
COPY --from=caddy:2-alpine /usr/bin/caddy /usr/bin/caddy
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/start.sh /app/start.sh
# Node and Caddy run as the image's unprivileged "node" user: the app files stay
# root-owned (read only for it); Caddy only writes its state under /config and
# /data, and 8080 needs no privileges.
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh \
  && mkdir -p /config /data && chown node:node /config /data
ENV NODE_ENV=production SSR_PORT=4321 XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
USER node
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
