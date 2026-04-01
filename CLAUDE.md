# CLAUDE.md - OMERO.biomero

## Development workflow

After making changes, always rebuild and deploy:

1. **Rebuild webapp assets** (if frontend changed): `cd webapp && yarn build`
2. **Deploy to OMERO web container**: `bash omero-init.sh` (from project root)

Both steps are required for frontend changes — yarn build compiles React/webpack assets into `omero_biomero/static/`, and `omero-init.sh` installs packages and restarts OMERO web in the Docker container (`nl-biomero-omeroweb-1`).

For backend-only changes (Python files under `omero_biomero/`), only `bash omero-init.sh` is needed since packages are installed in editable mode.

### Biomero (SlurmClient) package

If the `biomero` library itself has changed (local repo at `../biomero/`), run:

```bash
bash ../NL-BIOMERO/biomeroworker/biomeroworker-init.sh
cd ../NL-BIOMERO && docker compose -f docker-compose-dev.yml restart biomeroworker
```

The biomero package is volume-mounted into the biomeroworker container but needs `pip install -e` to be picked up. The omeroweb container does NOT mount biomero — it uses the pip-installed version from its Docker image.

### omero_annotate_ai package

Local repo at `../omero_annotate_ai/`. Installed in editable mode in the omeroweb container. After changes, run `bash omero-init.sh` to pick them up.

Tests: `cd ../omero_annotate_ai && pixi run -e dev python -m pytest tests/ -p no:napari -v`

### SLURM scripts (biomero-scripts)

The `biomero-scripts` repo is volume-mounted at `../biomero-scripts/` -> `/opt/omero/server/OMERO.server/lib/scripts/biomero` on the omeroserver. Changes are picked up on next script load — no rebuild needed.

### Training container (W_Segmentation-Cellpose4)

To rebuild and deploy the training container:

```bash
cd ../W_Segmentation-Cellpose4
docker build --no-cache -t cellpose4-train .
docker save cellpose4-train -o ~/cellpose4-train.tar
docker cp ~/cellpose4-train.tar slurmctld:/data/cellpose4-train.tar
docker exec slurmctld singularity build --force /data/my-scratch/singularity_images/workflows/cellpose4/w_segmentation-cellpose4_latest.sif docker-archive:/data/cellpose4-train.tar
docker exec slurmctld rm /data/cellpose4-train.tar
rm ~/cellpose4-train.tar
```

Use `--no-cache` when `train.py` or `entrypoint.sh` changed — Docker caches COPY layers aggressively.

**Important**: Singularity containers are read-only. All write paths in `train.py` must use the `--outfolder` (bound to `/data`) not `/tmp`. The `--writable-tmpfs` flag does NOT work on this SLURM cluster (fuse-overlayfs broken).

## Architecture notes

### Storage model (annotation consolidation)

Two storage artifacts per annotation set:

1. **JSON Manifest** — `AnnotationConfig` from `omero_annotate_ai` serialized to JSON. Stored as a `FileAnnotation` on the dataset/plate with namespace `omero.biomero.manifest.{set_id}`. Contains workflow config, unit list with progress, feature types, and cached channel presentation per image.

2. **GeoJSON per image** — One `FileAnnotation` per image per annotation set with namespace `omero.biomero.annotations.{set_id}`. Contains all polygon annotations (across patches) with channel presentation at the top level. Patches are identified by `patch` property on each feature.

**set_id** is a timestamp + random suffix (e.g. `20260401_143022_483_a7f2`), stable across updates.

**What's NOT stored on annotation save**: ROI objects, label TIFFs. Label masks are generated at training time from GeoJSON.

### Data flow

- **ConfigureTab** creates the manifest via `saveManifest` API
- **AnnotateTab** reads units from the manifest, saves GeoJSON per image via `saveAnnotateAnnotation`, updates manifest to mark units processed
- **PreviewViewer** loads annotation overlays from GeoJSON by set_id namespace
- **AnnotateApp** manages `setId` and `manifest` state, computes progress from `manifest.annotations`

### Key backend endpoints (annotate)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `save_manifest` | POST | Create/update JSON manifest |
| `load_manifest` | GET | Load manifest by set_id |
| `list_manifests` | GET | List annotation sets for a container |
| `delete_manifest` | POST | Delete manifest + GeoJSON files |
| `save_annotation` | POST | Save GeoJSON + update manifest progress |
| `fetch_annotation` | GET | Load GeoJSON by set_id namespace |
| `add_patch` | POST | Add random patch unit to manifest |

All manifest/GeoJSON persistence logic lives in `omero_annotate_ai.omero.omero_functions` — the Django views are thin wrappers.

### Channel normalization

Image-level normalization (not per-patch) to avoid contrast issues in dark patches. Stored as `channel_presentation` on `ImageAnnotation` in the manifest (cached) and in the GeoJSON file (source of truth). The `ImageChannelControls` component uses 0-100% scales that are converted to absolute pixel values for the OMERO render URL.

### Training pipeline

Training flow: UI (TrainingBiomeroTab) -> Django (training_views.py) -> OMERO Script Service -> SLURM_Run_Training.py (biomero-scripts) -> sbatch (custom inline script) -> Singularity container (W_Segmentation-Cellpose4)

- `SLURM_Run_Training.py` builds its own sbatch script (not the inference job script) with proper `/data` and models binds
- After training completes, the script persists the model to the SLURM models dir via SSH and uploads results to OMERO
- SLURM dev cluster nodes have 5GB RAM limit — don't request more in sbatch
- Model files on SLURM need `chmod 644` to be readable inside Singularity containers

## Design docs

- Spec: `docs/superpowers/specs/2026-04-01-annotate-app-consolidation-design.md`
- Plan: `docs/superpowers/plans/2026-04-01-annotate-app-consolidation.md`
