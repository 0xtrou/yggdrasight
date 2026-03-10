/**
 * Utilities for spawning Docker containers from API routes.
 *
 * When services run inside Docker containers they cannot reach the host via
 * `localhost`; they must use the special DNS name `host.docker.internal` that
 * maps to the host's gateway address.  Use `toContainerUri` when passing a
 * MongoDB (or any other) URI from the host process into a container.
 */

/**
 * Rewrite a connection URI so that it is reachable from inside a Docker
 * container that is attached to a bridge network.
 *
 * Replaces every occurrence of `localhost` (and `127.0.0.1`) with
 * `host.docker.internal`, which is available on Docker Desktop and on Linux
 * when the container is started with
 * `--add-host host.docker.internal:host-gateway`.
 */
export function toContainerUri(uri: string): string {
  return uri
    .replace(/localhost/g, 'host.docker.internal')
    .replace(/127\.0\.0\.1/g, 'host.docker.internal')
}
