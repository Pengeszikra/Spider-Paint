# spider-paint Cloud Run: embed the immutable source commit at image build time.
# Local Docker contexts include .git; CI may supply --build-arg SPIDER_PAINT_GIT_SHA.
FROM node:22-alpine AS source
RUN apk add --no-cache git
WORKDIR /app
COPY . .
ARG SPIDER_PAINT_GIT_SHA=""
ARG COMMIT_SHA=""
RUN set -eu; \
    sha="$SPIDER_PAINT_GIT_SHA"; \
    if [ -z "$sha" ]; then sha="$COMMIT_SHA"; fi; \
    if [ -z "$sha" ] && [ -d .git ]; then sha="$(git rev-parse HEAD 2>/dev/null || true)"; fi; \
    if [ -n "$sha" ]; then \
      echo "$sha" | grep -Eiq '^[0-9a-f]{7,40}$' || (echo 'Invalid commit SHA' >&2; exit 1); \
      printf '%s\n' "$sha" > mcp/build-sha.txt; \
    fi; \
    rm -rf .git
FROM node:22-alpine
WORKDIR /app
COPY --from=source /app/ ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "bin/cloud-run.mjs"]
