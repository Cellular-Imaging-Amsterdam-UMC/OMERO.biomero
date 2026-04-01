# Bugfix and UX Improvements Design

**Date:** 2026-04-01
**Scope:** 8 issues across frontend UX, performance, metadata, and training pipeline

---

## Overview

This spec covers a batch of fixes and improvements organized into three tiers:

1. **Blocker fix** — Cellpose training permission error
2. **Performance fix** — Slow annotation table listing (in `omero_annotate_ai` package)
3. **Frontend UX improvements** — Annotation tab, preview tab, training tab

---

## Issue #8: Cellpose Training Permission Error (Blocker)

### Problem

Cellpose 4.x calls `cache_CPSAM_model_path()` on init, which runs `MODEL_DIR.mkdir(parents=True, exist_ok=True)` on `CELLPOSE_LOCAL_MODELS_PATH`. The Dockerfile sets this to `/tmp/models/cellpose/`, but Singularity containers are read-only — writes to `/tmp` fail with `PermissionError`.

The sbatch script binds `{models_path}:/tmp/models`, but cellpose appends its own `cellpose/` subdirectory, and the bind mount doesn't make `/tmp/models/cellpose` writable inside the container's read-only filesystem.

### Fix

Cellpose uses `CELLPOSE_LOCAL_MODELS_PATH` **as-is** — no subdirectory appended. `cache_CPSAM_model_path()` calls `MODEL_DIR.mkdir(parents=True, exist_ok=True)` then downloads model files directly into that directory (e.g., `MODEL_DIR/cpsam`).

**In `W_Segmentation-Cellpose4/Dockerfile`:**
- Change `ENV CELLPOSE_LOCAL_MODELS_PATH=/tmp/models/cellpose/` to `ENV CELLPOSE_LOCAL_MODELS_PATH=/data/models/cellpose/`

**In `biomero-scripts/__workflows/SLURM_Run_Training.py`:**
- Change the models bind from `--bind {models_path}:/tmp/models` to `--bind {models_path}:/data/models`
- Override env var at runtime: add `--env CELLPOSE_LOCAL_MODELS_PATH=/data/models/cellpose` to the Singularity run command
- Ensure `mkdir -p {models_path}/cellpose` on the host side before the bind (already done for the old path)

**In `W_Segmentation-Cellpose4/train.py`:**
- Update model search paths that reference `/tmp/models` to use `/data/models` instead

### Verification

- Rebuild container with `--no-cache`
- Run training job, confirm cellpose starts without PermissionError
- Confirm trained model is persisted to SLURM models dir

---

## Issue #6: Slow Annotation Table Listing (omero_annotate_ai)

### Problem

`list_user_tables()` in `omero_annotate_ai/omero/omero_utils.py` has an N+1 query pattern:

1. Gets ALL FileAnnotation IDs on the container (not just tables)
2. For each annotation, calls `ezomero.get_table()` — loading the **entire table into memory** just to check if it's valid
3. Then fetches FileAnnotation metadata with multiple getter calls

Result: 6N+ OMERO queries where N is total annotations (not just tables). Slow even on small datasets.

### Fix (in `omero_annotate_ai` package at `../omero_annotate_ai/`)

The root cause: `list_user_tables()` in `omero_utils.py` calls `ezomero.get_file_annotation_ids(conn, container_type, container_id)` **without** the `ns` parameter. This returns ALL FileAnnotations on the container, then tries `ezomero.get_table()` on each one (expensive table-open operation) just to check validity.

`ezomero.get_file_annotation_ids()` already supports namespace filtering via its `ns` parameter — it delegates to `target_object.listAnnotations(ns)` which filters server-side in a single call.

**Fix — two changes in `list_user_tables()`:**

1. **Pass namespace to `get_file_annotation_ids()`**: Add `ns=TRACKING_TABLE_NAMESPACE` (or whatever namespace is used for tracking tables). This filters server-side, returning only tracking table FileAnnotations.

2. **Replace `get_table()` with mimetype check**: Instead of opening each table to check validity, check `file_ann.getFile().getMimetype() == "OMERO.tables"`. This avoids loading table contents entirely.

```python
# Before (N+1 queries):
annotations = ezomero.get_file_annotation_ids(conn, container_type, container_id)
for ann_id in annotations:
    table = ezomero.get_table(conn, ann_id)  # loads entire table!
    ...

# After (single query):
annotations = ezomero.get_file_annotation_ids(conn, container_type, container_id, ns=NS)
for ann_id in annotations:
    file_ann = conn.getObject("FileAnnotation", ann_id)
    if file_ann.getFile().getMimetype() == "OMERO.tables":
        ...  # extract metadata from file_ann, no table load
```

Similarly fix `list_annotations_by_namespace()` which has the same pattern — calls `get_file_annotation_ids` without `ns`, then filters client-side.

### Additional: Return summary stats

To support the preview tab showing annotation set info (images annotated, total images), the listing endpoint should return summary stats per table. Two options:

- **Option A:** Store summary in FileAnnotation description as JSON (updated on each save). Fast read, eventually consistent.
- **Option B:** Load table on-demand when user selects a set. Accurate but slower per-set.

Recommended: **Option A** for the listing view (fast), with Option B as fallback when user selects a set (accurate count).

---

## Issue #1: Patch Listing Hierarchy in Annotation Tab

### Problem

The `TrackingTableView` sidebar shows a flat list of all units — images and patches mixed together. Hard to see which patches belong to which image.

### Fix

Group units by `image_id` in `TrackingTableView`:

- **Image header row**: Non-selectable, shows image name in muted uppercase style. Clicking the header navigates to the first patch of that image.
- **Patch rows**: Indented below their parent image, show patch coordinates and status (checkmark if done).
- Group the units array by `image_id`, render each group with header + indented children.
- Only patch rows are selectable units in the tracking table.

### Data flow

```
units[] → groupBy(image_id) → [
  { image_name, image_id, patches: [unit, unit, ...] },
  { image_name, image_id, patches: [unit, unit, ...] },
]
```

No backend changes needed — purely frontend grouping.

---

## Issue #2: Skip / No Labels Flow

### Problem

Three buttons ("Done (empty)", "Save & Next", "Skip") are confusing. "Done (empty)" meaning is unclear.

### Fix

Replace with two buttons:

1. **"Save & Next"** — saves annotations and advances (unchanged)
2. **"Skip ▾"** — opens inline popover with two options:
   - **"Skip for now"** — leaves unit pending, advances to next (current Skip behavior)
   - **"No labels (done)"** — marks unit as processed with no annotations (current "Done (empty)" behavior)

### Popover behavior

- Opens on click, dismisses on outside click or Escape
- Positioned below/near the Skip button
- After action, popover closes and advances to next unit
- Toast messages: "Skipped — will come back later" / "Marked as done — no labels"

---

## Issue #3: ROIs Persist After Completion

### Problem

After all units are annotated, a "Done" popup appears. But pressing "Save & Next" still triggers the save handler, creating duplicate ROIs on the last image. Each press creates new ROI/Label pairs with different IDs.

### Fix

- When all units are processed (`allDone` state), disable both "Save & Next" and "Skip" buttons
- The completion popup/toast is the terminal state
- Optionally: set a `completed` flag in state that the save handler checks as a guard

This is a simple state guard — if `allDone`, return early from `handleSaveAndNext()`.

---

## Issue #4: Preview Tab Annotation Set Overlay

### Problem

Preview tab lists annotation sets as text cards but doesn't render them on the image.

### Fix

- When user selects an annotation set, fetch ROIs for the currently displayed image from that set's tracking table
- Render ROI polygons as colored outlines on the `PreviewViewer` canvas, reusing the existing overlay rendering path (same as prediction overlays)
- As user browses images, fetch and render ROIs for each image
- If no ROIs exist for a given image in the set, show clean image

### Annotation set info card

Each annotation set in the listing shows:
- Set name
- Images annotated / total images (from summary stats — depends on Issue #6 fix)
- Visual indicator (progress bar or fraction)

### Depends on

- Issue #6 (performance fix) — listing must be fast to show sets with stats

---

## Issue #5: Remove "New Annotation Set" from Training Tab

### Problem

`AnnotationSetPicker` shows a "+ New annotation set" option in the training tab. Creating a new set from training tab doesn't make sense — the user should use the Configure tab for that.

### Fix

- Add a `showCreateNew` prop to `AnnotationSetPicker` (default: `true`)
- In `TrainingBiomeroTab`, pass `showCreateNew={false}`
- The `<option value="__new__">` is conditionally rendered based on this prop

One-line change in each file.

---

## Issue #7: Custom Model Not Visible in Inference Metadata

### Problem

When running inference with a custom trained model, the model identity is not stored in the result metadata (MapAnnotation) on OMERO.

### Fix

- In the inference pipeline, pass `model_id` and `model_name` through to the result metadata
- When the SLURM inference script uploads results as MapAnnotation, include:
  - `model_id`: identifier of the custom model used
  - `model_name`: human-readable name
  - `model_source`: "custom" vs "pretrained"
- The inference Django view should pass the selected model info to the script service call

### Where model info flows

```
UI (model selector) → Django (start inference) → OMERO Script params → SLURM script → result MapAnnotation
```

The model selector already knows the model ID/name. The gap is passing it through to the result annotation.

---

## Implementation Order

Recommended sequence based on dependencies and priority:

1. **#8 Cellpose training fix** — blocker, independent, quick
2. **#6 Table listing performance** — in `omero_annotate_ai` package, unblocks #4
3. **#5 Remove "new annotation set"** — trivial, independent
4. **#3 ROI duplication fix** — small, independent
5. **#2 Skip/No labels popover** — small, independent
6. **#1 Patch listing hierarchy** — medium, independent
7. **#4 Preview tab overlay** — depends on #6
8. **#7 Custom model metadata** — medium, spans multiple repos

---

## Repos Affected

| Issue | Repo |
|-------|------|
| #1, #2, #3, #4, #5 | `OMERO.biomero` (webapp frontend) |
| #6 | `omero_annotate_ai` (Python package) |
| #7 | `OMERO.biomero` (Django views) + `biomero-scripts` (SLURM scripts) |
| #8 | `W_Segmentation-Cellpose4` (Dockerfile, train.py) + `biomero-scripts` (sbatch generation) |
