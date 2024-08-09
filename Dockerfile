FROM node:alpine as builder

ARG MUSA_GITHUB_PAT
ENV MUSA_GITHUB_PAT=${MUSA_GITHUB_PAT}

WORKDIR /app
COPY package*.json ./
COPY .npmrc ./
RUN npm i

COPY . ./
RUN npm rebuild esbuild && npm run build

RUN chmod +x /app/start.sh

# https://docs.docker.com/develop/develop-images/multistage-build/#use-multi-stage-builds
FROM node:alpine
RUN apk update && apk add ca-certificates iptables ip6tables && rm -rf /var/cache/apk/*

# Copy binary to production image.
COPY --from=builder /app/start.sh /app/start.sh
COPY --from=builder /app/.env /app/.env
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/users.json /app/dist/users.json

# Copy Tailscale binaries from the tailscale image on Docker Hub.
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /app/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /app/tailscale
RUN mkdir -p /var/run/tailscale /var/cache/tailscale /var/lib/tailscale

EXPOSE 3000

# Run on container startup.
CMD ["sh", "-ac", ". /app/.env && /app/start.sh"]