// OpenNext adapter config for the yggdrasight-landing worker (infra/workers.manifest.ts).
// Same as gumpbox-landing: the landing build has no ISR or on-demand revalidation, so
// prerendered pages are read from the worker's static assets: no R2/KV cache resource.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
