# Importer and Converter Debugging

Use this reference only when an OMERO.biomero issue crosses into the
BIOMERO.importer or biomero-converter runtime.

## Discover the Runtime First

- Determine whether the deployment uses Docker Compose or raw Podman before
  choosing commands. For Compose, run `docker compose config --services` and
  `docker compose ps`; for Podman, inspect the deployment environment/scripts
  and run `podman ps` before assuming container names.
- Inspect Compose volumes and environment to discover mounted source, log paths,
  database services, and the configured converter image.
- Correlate one import UUID across the web request, tracking database, importer
  logs, per-run CLI stderr, converter output, and OMERO objects. Query the
  associated `imports_preprocessing.container`; that stored image reference is
  authoritative for the order and may differ from the currently configured tag.
- Start with read-only diagnostics. Do not restart services, rebuild images, or
  run mutating SQL unless the requested task includes that action.

## Rebuild and Load the Converter

The importer runs the converter with rootless Podman. Its internal image store
is ephemeral, so reload the image after rebuilding it or recreating the importer
container.

Build from the converter build context, then return to the deployment root to
load the image into the running importer:

```bash
docker build -t cellularimagingcf/biomero-converter:latest .
docker save cellularimagingcf/biomero-converter:latest | \
  docker compose exec -T biomero-importer podman load
```

For a raw-Podman deployment, use its discovered importer container instead:

```bash
podman save cellularimagingcf/biomero-converter:latest | \
  podman exec -i $IMPORTER_CONTAINER podman load
```

Confirm the actual runtime, service/container name, and stored order image tag
before running these commands. Verify the loaded image ID and digest inside the
importer; a host image with the same tag is not automatically visible in the
nested Podman store.

## Deploy Importer Source Changes

If importer source is bind-mounted, file changes appear immediately but the
Python process may retain imported modules. Restart only the importer service:

```bash
docker compose restart biomero-importer
```

If the source is copied into an image instead, rebuild that service. Confirm the
mounted or copied path with `docker compose config` instead of relying on a
developer-specific filesystem path.

## Logs

Start with Compose logs:

```bash
docker compose logs --since 10m biomero-importer
docker compose logs -f biomero-importer
```

Use the Compose volume configuration to find host log files. Inspect the main
application log for polling, preprocessing selection, and registration, then
the `cli.<UUID>*.errs` file for the failing worker. Search by the same UUID and
record the first causal error, not only downstream retries.

## Read-Only OMERO Database Checks

Discover the database service first, then connect with the deployment's actual
credentials. A common Compose command is:

```bash
docker compose exec database psql -U omero -d omero
```

Check unexpected PlateAcquisition rows:

```sql
SELECT id, plate, name
FROM plateacquisition
WHERE plate = <PLATE_ID>;
```

For Incucyte imports, unexpected rows can create duplicate timepoint folders.

Locate images belonging to a plate:

```sql
SELECT ws.id AS wellsample_id, ws.well, ws.image
FROM wellsample ws
JOIN well w ON ws.well = w.id
WHERE w.plate = <PLATE_ID>;
```

Verify per-plane relative timestamps:

```sql
SELECT id, thez, thec, thet, deltat
FROM planeinfo
WHERE pixels IN (
    SELECT id FROM pixels WHERE image = <IMAGE_ID>
)
ORDER BY thet;
```

Expected `deltat` values are seconds from the start, for example `0`, `43200`,
and `86400` for 12-hour intervals.

## OMERO Physical Units

Pass raw numeric values to OMERO physical-unit model constructors. Do not wrap
them in gateway `rdouble()` or `rint()` helpers:

```python
from omero.model import TimeI
from omero.model.enums import UnitsTime

p_info.deltaT = TimeI(delta_t_seconds, UnitsTime.SECOND)
```

Wrapping `delta_t_seconds` in `rdouble()` changes the value type and can fail
when the update service persists the model.
