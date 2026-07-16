# Django APIs and Backend Testing

## Trace the Request Boundary

- Register plugin routes in `omero_biomero/urls.py` and place behavior in the
  nearest domain view module. Extract a helper when database or serialization
  logic is shared; do not turn `biomero_views.py` into a catch-all.
- Follow the existing OMERO decorator style. Page views generally use
  `@login_required()` plus `@render_response()`; JSON APIs require
  `@login_required()` and return `JsonResponse`.
- Treat the injected `conn` as the authority for the current OMERO user, group,
  administrator status, and object access.

## Security and API Behavior

- Derive user IDs, usernames, and authorization scope from `conn`. Never trust a
  client-supplied user identifier to widen access.
- Validate method, required fields, types, ranges, enumerations, page sizes, and
  search length before doing expensive work. Return consistent `400`, `403`,
  `404`, `405`, or service-error responses.
- Parameterize all SQL values. Keep filtering, deterministic ordering, counting,
  and pagination in the database when result sets can grow.
- Use stable tie-breakers for latest-row or paged queries. Test repeated status
  events and equal timestamps rather than assuming timestamps are unique.
- Return object-shaped JSON with documented names and explicit pagination
  metadata. Normalize UUIDs, datetimes, JSON-text columns, and nullable values at
  the server boundary when that simplifies every client.
- Log exceptions with diagnostic context server-side, but return a generic error
  message. Never expose a database URL, credentials, SQL text, filesystem path,
  traceback, or raw driver exception.
- Preserve CSRF checks for state-changing requests. Keep GET endpoints read-only.
- Encode or validate identifiers used in generated URLs; whitelist object types
  rather than concatenating arbitrary values.

## Database Connections

- Reuse the repository's installed database stack and established connection
  pattern. Declare a dependency directly if OMERO.biomero imports it directly;
  do not rely silently on an unrelated transitive dependency.
- Bound connection and query work, close resources with context managers, and
  use health checks/timeouts for pooled connections.
- Keep deployment URL formats backward compatible when replacing a connection
  mechanism. Do not log the URL.

## Backend Tests

- Always use the repository-local virtual environment for Python package
  installation and tests. On Windows invoke `venv\Scripts\python.exe`; on
  POSIX invoke `venv/bin/python`. Never use bare `python`, `pip`, or a different
  active environment for repository verification.
- If the local environment is missing Django, OMERO, the package, or test
  dependencies, install the editable project and `requirements.txt` into that
  same `venv` before testing. Use `python -m pip` through the explicit virtual
  environment interpreter so installation and execution cannot diverge.
- Add tests beside the nearest view tests under `omero_biomero/tests/`.
- Reuse the OMERO and importer stubs in `conftest.py`. Build a fake `conn` whose
  user, group, and admin behavior is explicit for each authorization case.
- Test the public response and bound query parameters, not only helper calls.
- Cover current-user scoping, invalid input, missing configuration, unavailable
  dependencies, sanitized failures, serialization, deterministic pagination,
  and the reported regression.
- Use a real database integration test when correctness depends on a PostgreSQL
  feature such as window functions, interval handling, or dialect-specific SQL.

Prepare the existing local environment on Windows when needed:

```powershell
.\venv\Scripts\python.exe -m pip install -e . -r requirements.txt
.\venv\Scripts\python.exe manage.py test omero_biomero.tests.test_biomero_views
.\venv\Scripts\python.exe manage.py test
```

On Windows, `omero-web` may pull `zeroc-ice` into an unsupported local C++ build.
If that full install fails specifically at Ice, keep using the same `venv`: install
the project editable with `--no-deps`, install `requirements.txt` plus the direct
imports needed by the selected tests, and run pytest so `tests/conftest.py` loads
the repository's OMERO/importer stubs before Django setup. Do not present this
stubbed environment as a production dependency check.

```powershell
.\venv\Scripts\python.exe -m pip install --no-deps -e .
.\venv\Scripts\python.exe -m pip install -r requirements.txt Django PyJWT `
  psycopg2-binary requests numpy PyYAML
.\venv\Scripts\python.exe -m pytest omero_biomero\tests\test_biomero_views.py -q
```

On POSIX, use the equivalent `./venv/bin/python` commands. Run the narrow module
or test first, then the full suite. If installation or an existing import-time
network fetch fails, report the exact failure and passing test count; do not
switch interpreters or claim the suite passed. CI also performs a production
frontend build, so backend-only changes must not break packaging.
