FROM node:lts-trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl wget python3 python3-requests git jq netcat-openbsd \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g opencode-ai

ENTRYPOINT ["opencode"]
