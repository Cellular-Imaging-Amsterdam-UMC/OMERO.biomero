# Configuration and Deployment Surfaces

## Keep Sources of Truth Aligned

- Trace each setting from its source through parsing, Django context or API,
  React state, admin controls, documentation, and deployment configuration.
- Match existing parsing and naming conventions. Preserve the old default so an
  existing deployment behaves the same unless it opts in.
- When a setting is editable in
  `webapp/src/biomero/components/SettingsForm.js`, keep its label, helper text,
  default, environment override, scope, and validation consistent with the
  backend and shipped configuration.
- Remove obsolete settings completely only when authorized: runtime reads,
  template data attributes, frontend consumers, tests, package dependencies,
  documentation, and deployment environment entries are separate touch points.

## Templates and Dependencies

- Treat `omero_biomero/templates/omero_biomero/webclient_plugins/react_app.html`
  as the bridge between OMERO.web and React. Escape values correctly and expose
  only data the browser needs.
- Put reusable browser constants in the existing `WEBCLIENT`/constants path
  instead of repeatedly reading DOM attributes in feature components.
- If Python or JavaScript source imports a package directly, declare it in
  `setup.py` or `webapp/package.json` and update the lockfile as appropriate.
  Remove a dependency only after repository-wide search proves it is unused.

## Generated Frontend Assets

- Edit `webapp/src` rather than generated files under
  `omero_biomero/static/omero_biomero/assets`.
- Never run `build`, `clear-assets`, or start `watch`; the developer-owned
  `corepack yarn watch` process handles generated assets.
- Treat manifest, hashed bundle, source map, license, and replaced-hash changes
  as watcher output. Preserve them and report unexpected changes; never
  hand-edit hashes or the asset manifest.

## Sibling Repositories

- Configuration can span sibling checkouts such as `biomero` and `NL-BIOMERO`.
  Inspect them when present, but do not modify another repository unless the
  user placed it in scope.
- Report exact follow-up surfaces when cross-repository edits are out of scope.
  Typical examples are deployment Compose environment variables,
  `web/slurm-config.ini`, Docker build arguments, and BIOMERO core documentation.
- Verify each repository's worktree separately and preserve unrelated changes.
