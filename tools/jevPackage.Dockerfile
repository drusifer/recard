# The Jev processes as a container image (`make export-jev-image`), built
# from dist/jev/ as its own context - the same files a person copies to a
# box by hand (D174), plus Node and Chromium.
#
# Default: a LISTENING game master (US-150) named by GM_NAME. Any table
# brings it over with "/invite <GM_NAME>". Override the command to run
# `jev-table` / `jev-player` instead (see README.md).
FROM node:24-bookworm-slim

# tini as PID 1: forwards SIGTERM to node and reaps the many processes a
# headless Chromium leaves behind.
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
# Exact pins come from package.json (D174's builder writes the versions
# the repo has installed). Playwright's own Chromium headless shell, so
# browser and driver versions always match.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install --omit=dev --no-audit --no-fund \
    && npx playwright install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

COPY . .
# Bot logs go to build/; the app runs as the unprivileged node user.
RUN mkdir -p build && chown -R node:node /app
USER node

ENV GM_NAME=patch
# The static server a spectator's browser loads the app from (jev-table / --code mode).
EXPOSE 8230
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", "exec node tools/jevGameMaster.mjs --name \"$GM_NAME\""]
