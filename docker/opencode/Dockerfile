# OpenCode Agent — Docker image
# Base: official OpenCode image
FROM ghcr.io/anomalyco/opencode:latest

# ── Runtime env ──
# Prevent OpenCode from auto-updating inside the container
ENV OPENCODE_DISABLE_AUTOUPDATE=true
# Bind to all interfaces so the host (or other containers) can reach it
ENV OPENCODE_HOSTNAME=0.0.0.0
# Default port — overridable at runtime via -e OPENCODE_PORT=N
ENV OPENCODE_PORT=4096

# The workspace directory (bind-mounted at runtime)
WORKDIR /workspace

# Expose the server port
EXPOSE 4096

# ── Entrypoint ──
# Runs opencode in headless server mode.
# Auth + config are bind-mounted read-only from the host at runtime.
# Sessions DB lives in a per-container tmpfs or named volume (see docker-compose.yml).
ENTRYPOINT ["sh", "-c", "opencode serve --hostname ${OPENCODE_HOSTNAME} --port ${OPENCODE_PORT}"]
