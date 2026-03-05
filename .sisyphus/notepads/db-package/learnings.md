# DB Package Learnings

## Conventions Discovered
- `@oculus/core` exports enums from `src/enums/index.ts` — types/schemas dirs exist but are empty (being built in parallel)
- Monorepo uses `workspace:*` protocol for internal deps
- All packages use `"main": "./src/index.ts"` (no build step, consumed raw via bundler)
- `tsconfig.base.json` uses `moduleResolution: "Bundler"`, `module: "ESNext"`, `target: "ES2022"`
- Package tsconfigs use `paths` for workspace resolution: `"@oculus/core": ["../core/src/index.ts"]`

## Patterns Applied
- Next.js hot-reload safe MongoDB connection via `global._mongooseCache` pattern
- All schemas use `{ timestamps: true, strict: true }` 
- toJSON transform: removes `_id`/`__v`, exposes `id` — REST API standard
- `Schema.Types.Mixed` for flexible fields (`indicators`, `sourceRaw`, `config`)
- Model export uses `mongoose.models.X || mongoose.model(...)` pattern for hot-reload safety
- SignalProvider toJSON strips `credentials` for security
- Enums imported from `@oculus/core` used as `Object.values()` for Mongoose enum validation

## File Structure
```
packages/db/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── connection.ts
    └── models/
        ├── index.ts
        ├── signal.model.ts
        ├── project.model.ts
        ├── milestone.model.ts
        └── provider.model.ts
```
