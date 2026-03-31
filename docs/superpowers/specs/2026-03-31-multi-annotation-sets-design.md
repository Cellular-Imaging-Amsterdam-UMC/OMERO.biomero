# Multi-Annotation Set Workflow Design

**Date:** 2026-03-31
**Status:** Approved
**Branch:** feature/model-path

## Summary

Extend OMERO.biomero's annotation workflow to support multiple independent annotation sets per dataset/plate. Users can create, name, and switch between annotation sets — enabling different annotation tasks (nuclei vs cell membranes), iterative refinement, and collaborative annotation within OMERO groups.

## Goals

1. Multiple annotation sets per container (dataset/plate/screen)
2. Complete isolation between sets — working on set B never shows annotations from set A
3. Clear, biologist-friendly terminology and UI
4. Training validation that guides users with plain-language feedback
5. GeoJSON as single source of truth for annotations
6. Build on OMERO's native data model — use standard OMERO objects (FileAnnotations, ROIs, OMERO.tables, namespaces, AnnotationLinks) rather than custom workarounds. The design should feel like a natural extension of OMERO, not a parallel system bolted on top.

## Non-Goals (Future Work)

- Merging annotation sets
- Consensus/comparison between annotators
- Per-user attribution tracking
- AI-assisted annotation within the Annotate tab (running a model to pre-populate polygons)
- Multi-class annotation workflows (classification as a second pass)

---

## 1. Data Model

### One Annotation Set = One AnnotationConfig + One Tracking Table

- Each set has a **user-provided name** (e.g., "nuclei_segmentation"), ensured unique per container via `generate_unique_table_name()` from `omero_annotate_ai`
- The AnnotationConfig YAML is stored as a FileAnnotation on the container with namespace `openmicroscopy.org/omero/annotate/config`
- The tracking table is named `annotate_ai_{set_name}` and linked to the container
- Multiple configs/tables can coexist on the same container — `list_annotation_tables()` already supports listing them

### Annotation Storage

- **GeoJSON FileAnnotation** is the source of truth, namespaced per set: `omero.biomero.annotations.{table_id}` (using table_id avoids special character issues in names)
- **OMERO ROIs** are created for user convenience (viewable in other OMERO clients) but are not authoritative. ROIs include a namespace tag linking them to their set to prevent leakage between sets.
- **Label masks are NOT stored** — generated on-the-fly from GeoJSON polygons at training time using `cv2.fillPoly`

### Set Isolation

- When loading an image in the Annotate tab, only GeoJSON matching the active set's `table_id` is fetched
- Annotations from other sets are completely invisible during annotation
- Each tracking table independently tracks progress for its set

---

## 2. Tab Structure & User Flow

**Tabs:** Preview | Configure | Annotate | Training

### Preview Tab

- **Existing:** Browse images, run prediction models for quick testing (standalone, not tied to annotation sets)
- **New:** Show a read-only list of existing annotation sets for the selected container — name, progress, creation date. Informational only, no editing or creating sets.

### Configure Tab

- **Top section: Annotation Set Picker** — dropdown listing existing sets with progress (e.g., "nuclei_seg — 45/50 images"), plus "+ New set" option
- **Smart defaults:**
  - If no sets exist → form is ready for creating a new set (no picker shown, or empty dropdown)
  - If sets exist → user picks one to continue (config fields auto-populate) or creates a new one
- Creating a new set requires a **unique name**
- Config fields below: study context, spatial coverage, train/val/test splits, etc. (from `omero_annotate_ai` AnnotationConfig)

### Annotate Tab

- Scoped to the active annotation set
- **Image list** (left sidebar): filterable by All/Pending/Done
- **Annotation tools** (middle sidebar): contrast, brush/trace/SAM tools, Add/Subtract mode
- **Object summary** (sidebar): shows count (e.g., "47 objects") — no flat list of individual objects
- Individual object management happens on the canvas: click to select, delete to remove
- **"Avoid Overlap" toggle** — defaults to ON
- Default: single class (no class picker clutter). Multi-class support defined in Configure if needed, but the common case is segmentation with one object type.
- **Persistent header bar:** shows active set name + progress across Annotate and Training tabs

### Training Tab

- **Dropdown to select annotation set** to train on
- **On selection → auto-validate** the set (see Section 4)
- If validation passes → show training parameters + "Start Training" button
- If validation has blockers → disable button, show what to fix
- Merges the two current training tabs (Training + Training biomero) into one. The user selects a workflow from a dropdown (which lists available SLURM workflows). If no SLURM connection is available, falls back to the simple local prediction training.

---

## 3. Terminology

| Term | Definition |
|------|-----------|
| **Annotation Set** | A named collection of annotations for a container (e.g., "nuclei_round1"). One config + one tracking table. |
| **Class** | A category of thing being labeled (e.g., "Nucleus", "Cell body"). Replaces "Feature". Default: single class. |
| **Object** | One drawn polygon/shape on the canvas — an instance of a class. |
| **Image Annotation** | All objects drawn on a single image within a set (across all classes). |

**Hierarchy:** Annotation Set → Images → Image Annotation → Objects

---

## 4. Training Validation

When the user selects an annotation set on the Training tab, validation runs automatically. If performance is a concern, a "Validate" button can be added as fallback.

### Validation Rules

| Check | Level | User-Facing Message |
|-------|-------|-------------------|
| No training images annotated | **Blocker** | "None of your training images have annotations yet. Go to the Annotate tab to start labeling." |
| No validation images annotated | **Blocker** | "Validation images are needed to monitor training progress. Annotate at least a few validation images." |
| No test images annotated | **Warning** | "Without test images, you won't be able to evaluate your model's performance on unseen data." |
| Very few training images (<5) | **Warning** | "Only X training images annotated. More annotations generally improve model quality." |
| All splits sufficiently annotated | **Pass** | Ready to train |

- **Blockers** (red) disable the "Start Training" button
- **Warnings** (yellow) allow training but inform the user
- **Passes** (green) confirm readiness
- All messages written for biologists — no ML jargon, actionable guidance pointing to the correct tab

---

## 5. Collaborative Annotation

- Relies on **OMERO group permissions** — if a user can see the dataset, they can see and edit its annotation sets
- No additional access control, locking, or per-user attribution for now
- Multiple users in the same group can work on the same or different annotation sets

---

## 6. On-the-Fly Label Mask Generation

When training starts:

1. Iterate through the tracking table's processed images
2. For each image, load its GeoJSON FileAnnotation
3. Rasterize polygons to a label mask (numpy int32 array) using `cv2.fillPoly`
4. Each polygon gets a unique integer label (1, 2, 3, ...), background = 0
5. Pass masks directly to the training script — no stored TIFF files

This keeps storage lean and maintains GeoJSON as the single source of truth.

---

## 7. Key Dependencies

- **`omero_annotate_ai` package** — provides AnnotationConfig, tracking table management, `generate_unique_table_name()`, `list_annotation_tables()`, `link_table_to_containers()`
- **OMERO API** — FileAnnotation storage, ROI creation, group permissions
- **Frontend** — React components in `webapp/src/biomero/annotate/`
- **Backend** — Django views in `omero_biomero/annotate_ai_views.py`, `omero_biomero/training_views.py`
