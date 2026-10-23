# Sitio de marketing de Sanar y Criar en un contenedor (Railway u otro hosting de
# contenedores): compila Astro y lo sirve con Caddy en el puerto $PORT (8080 por defecto).
# El TLS lo pone la plataforma delante (Railway); este contenedor habla HTTP.
#
# Las variables PUBLIC_* terminan en el HTML/JS, así que se pasan al compilar
# (Railway entrega las variables del servicio como argumentos de compilación).
# SITE_ORIGIN y PLATFORM_ORIGIN se leen al arrancar (cabeceras y redirecciones).

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

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
