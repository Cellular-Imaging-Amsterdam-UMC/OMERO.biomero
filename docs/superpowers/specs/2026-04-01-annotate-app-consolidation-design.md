# Annotate App Consolidation — Design Spec

**Date**: 2026-04-01
**Status**: Draft
**Scope**: Merge best features from prediction app into annotate app, simplify storage and data model

---

## Problem Statement

The OMERO.biomero webapp has two apps (`prediction/` and `annotate/`) with overlapping functionality:
- 7 near-duplicate components
- Two different annotation storage models (MapAnnotation JSON vs GeoJSON + ROI + label TIFF)
- Dual-truth config storage (YAML + OMERO HDF5 table) that drifts out of sync
- ROI objects leak across annotation sets (no namespace isolation)
- Prediction app has superior channel/contrast management not available in annotate

## Goals

1. Single, clean annotate app with the best features from both apps
2. Single source of truth per concern (manifest for config+progress, GeoJSON for geometry)
3. Professional code design — each component does one thing well
4. No backward compatibility — clean slate implementation

## Non-Goals

- Modifying the prediction app (stays as-is, cleaned up later)
- 3D annotation support (future feature)
- Batch "extend set" operations (future feature)
- Migration of existing annotation sets

---

## Data Model

### 1. ChannelPresentation (new pydantic model in omero_annotate_ai)

Records exactly how an image channel is presented to the annotator. Lives at the image level — all patches of the same image share the same normalization to avoid contrast issues in dark patches.

```python
class ChannelPresentation(BaseModel):
    """How an image channel is presented for annotation/training."""
    channel_index: int
    visible: bool = True
    contrast_start: float  # absolute pixel intensity
    contrast_end: float    # absolute pixel intensity
    color: str = "#FFFFFF" # hex color
```

Added as an optional field on `ImageAnnotation`:

```python
class ImageAnnotation(BaseModel):
    # ... existing fields unchanged ...
    channel_presentation: Optional[List[ChannelPresentation]] = None
```

`FeatureType` list added to `AnnotationConfig`:

```python
class AnnotationConfig(BaseModel):
    # ... existing fields unchanged ...
    feature_types: List[FeatureType] = []
```

### 2. JSON Manifest (replaces YAML config + OMERO HDF5 table)

`AnnotationConfig` serialized to JSON via new `to_json()` / `from_json()` methods. Stored as a single JSON `FileAnnotation` on the dataset/plate.

- **Namespace**: `omero.biomero.manifest.{set_id}`
- **Filename**: `{config_name}_{set_id}.json` (e.g. `nuclei_segmentation_20260401_143022.json`)
- **set_id**: Timestamp-based with milliseconds + 4-char random suffix (e.g. `20260401_143022_483_a7f2`), generated at creation time, stable across updates

Contains:
- Workflow config (study, methodology, spatial coverage, training split, AI model)
- Unit list with progress (`ImageAnnotation` records with `processed` flag)
- Channel presentation per image (on each `ImageAnnotation`) — cached copy, GeoJSON is the per-image truth
- Feature types (annotation classes with names and colors, e.g. `[{name: "cell", color: "#FF0000"}, {name: "nucleus", color: "#00FF00"}]`)

Does NOT contain:
- Polygon geometry (that's in per-image GeoJSON)
- ROI IDs or label IDs (not generated during annotation)

### 3. GeoJSON per Image (one file per image per annotation set)

Stored as `FileAnnotation` on the OMERO image.

- **Namespace**: `omero.biomero.annotations.{set_id}`
- **Filename**: `{image_name}_{set_id}.geojson`

Structure:
```json
{
  "type": "FeatureCollection",
  "channel_presentation": [
    {
      "channel_index": 0,
      "visible": true,
      "contrast_start": 100,
      "contrast_end": 4500,
      "color": "#00FF00"
    }
  ],
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[x1, y1], [x2, y2], ...]]
      },
      "properties": {
        "objectType": "annotation",
        "featureType": "cell",
        "plane": {"c": 0, "z": 0, "t": 0},
        "patch": {"x": 0, "y": 256, "width": 512, "height": 512}
      }
    }
  ]
}
```

Key design decisions:
- All patches of the same image are in one file (features have `patch` property to identify which patch region)
- Channel presentation at top level (image-level normalization, not per-patch)
- **GeoJSON is the source of truth for channel presentation per image** — the manifest stores a cached copy for quick access without loading all GeoJSON files
- Accumulates on save — new patches add features, existing patches replace their features (matched by patch coordinates)

### 4. What's Removed

| Artifact | Reason |
|----------|--------|
| YAML config FileAnnotation | Replaced by JSON manifest |
| OMERO HDF5 tracking table | Replaced by unit list in JSON manifest |
| ROI objects on save | Not needed; caused cross-set leakage |
| Label TIFF on save | Deferred to training time (generated from GeoJSON) |
| MapAnnotation JSON (prediction) | Prediction app untouched but not used by annotate |

---

## Backend API

### New Endpoints

| Endpoint | Method | Input | Output | Purpose |
|----------|--------|-------|--------|---------|
| `save_manifest` | POST | AnnotationConfig JSON | `{success, set_id}` | Create or update JSON manifest FileAnnotation |
| `load_manifest` | GET | `?container_type&container_id&set_id` | AnnotationConfig JSON | Load manifest by set_id |
| `list_manifests` | GET | `?container_type&container_id` | `{manifests: [{set_id, name, created, progress}]}` | List annotation sets for a container |
| `delete_manifest` | POST | `{set_id, container_type, container_id}` | `{success}` | Delete manifest + all associated GeoJSON files |

### Modified Endpoints

**`save_annotation`** — simplified to:
1. Write GeoJSON FileAnnotation on image (namespaced by set_id)
2. Accumulate: load existing GeoJSON, merge new features for this patch, save
3. Update manifest to mark unit as processed and store channel presentation
4. Return `{success}`

**`fetch_annotation`** — simplified to:
1. Load GeoJSON FileAnnotation by namespace
2. Return FeatureCollection or empty
3. No ROI fallback

**`add_patch`** — simplified to:
1. Add new `ImageAnnotation` unit to manifest
2. Save manifest
3. Return updated unit list

### Removed Endpoints

- `manage_config` (YAML upload/download)
- `create_tracking_table` (OMERO table creation)
- `fetchAllImageAnnotations` (no-namespace ROI loader)

---

## Frontend Architecture

### Component Changes

**Upgraded from prediction app:**

| Component | What's ported |
|-----------|--------------|
| `ImageChannelControls.js` | Replace annotate version with prediction's: 0-100% scales, auto-scale button, numeric inputs + RangeSlider, channel locking |
| `GeometryUtils.js` | Add `appendToAnnotations()` function from prediction (polygon union for append mode) |
| `AnnotateViewer.js` | Add append mode from prediction's AnnotationViewer (merge overlapping same-type annotations) |

All ported code goes into `annotate/components/` and `annotate/utils/`. No shared directory.

**Annotation object management — click-to-select on canvas:**

The AnnotateViewer sidebar shows only feature type classes with count badges (no per-object list). To delete an individual annotation:
1. Switch to pan tool (or a new "select" tool)
2. Click an annotation polygon on the canvas — it gets a highlight outline and "Selected: cell #5" appears in the panel
3. Press Delete/Backspace to remove it
4. Click empty space to deselect

This requires canvas hit-testing (point-in-polygon check against all annotations). The classes panel stays compact regardless of annotation count.

**Simplified:**

| Component | Change |
|-----------|--------|
| `AnnotateTab.js` | Uses manifest API instead of tracking table. Simple unit list sidebar. "Add Patch" updates manifest. |
| `ConfigureTab.js` | Creates manifest (no tracking table). Shows existing sets. Read-only for active sets. |
| `PreviewViewer.js` | Remove `fetchAllImageAnnotations`. GeoJSON overlay by namespace only. |
| `TrainingBiomeroTab.js` | Reads from manifest instead of tracking table (minimal change). |

**Removed:**

| Component | Reason |
|-----------|--------|
| `TrackingTableView.js` | Replaced by simpler unit list reading from manifest |
| `AnnotationSetPicker.js` | Replaced by manifest list in ConfigureTab |

### Annotation Set Growth UX

- **ConfigureTab**: Creates initial annotation set (spatial coverage, train/val/test split, patch settings). Generates initial units including random patches if configured.
- **AnnotateTab**: "Add Patch" button for the current image — generates a single random patch (same size as configured in spatial coverage), adds a unit to the manifest, and saves. The randomness avoids user bias in patch placement.
- Both update the same manifest
- Batch extension (add patches to all images, add new images) is a future feature

---

## omero_annotate_ai Package Changes

### New Models

```python
class ChannelPresentation(BaseModel):
    """How an image channel is presented for annotation/training."""
    channel_index: int
    visible: bool = True
    contrast_start: float
    contrast_end: float
    color: str = "#FFFFFF"

class FeatureType(BaseModel):
    """An annotation class (e.g. cell, nucleus, background)."""
    name: str
    color: str  # hex color, e.g. "#FF0000"
```

`FeatureType` list is stored on `AnnotationConfig` (annotation set level). Individual GeoJSON features reference them by name via the `featureType` property.

### New Methods on AnnotationConfig

```python
def to_json(self, **kwargs) -> str:
    """Serialize to JSON string."""

@classmethod
def from_json(cls, json_source: Union[str, Path, dict]) -> "AnnotationConfig":
    """Load from JSON string, file path, or dict."""
```

### New OMERO Persistence Functions

```python
def save_manifest_to_omero(conn, config: AnnotationConfig, container_type: str, container_id: int, set_id: str) -> int:
    """Save AnnotationConfig as JSON FileAnnotation. Returns annotation ID."""

def load_manifest_from_omero(conn, container_type: str, container_id: int, set_id: str) -> Optional[AnnotationConfig]:
    """Load manifest by set_id from container."""

def list_manifests_from_omero(conn, container_type: str, container_id: int) -> List[dict]:
    """List all manifests on a container (set_id, name, created, progress summary)."""

def delete_manifest_from_omero(conn, container_type: str, container_id: int, set_id: str) -> bool:
    """Delete manifest + associated GeoJSON FileAnnotations."""

def save_geojson_to_omero(conn, image_id: int, geojson: dict, set_id: str) -> int:
    """Save GeoJSON FeatureCollection as FileAnnotation on image. Replaces existing for same set_id."""

def load_geojson_from_omero(conn, image_id: int, set_id: str) -> Optional[dict]:
    """Load GeoJSON by set_id namespace from image."""
```

### Existing Methods — Unchanged

- `to_yaml()` / `from_yaml()` — kept for human export/notebook use
- `to_dataframe()` / `from_dataframe()` — kept for notebook OMERO table workflows
- `to_mifa_metadata()` / `to_bioimage_io_rdf()` — kept for standards export
- `validate_annotations_against_config()` — kept for validation

### Tests

All new models and methods tested in `tests/test_config.py` (per CLAUDE.md guidelines):
- `TestChannelPresentation` — model validation, serialization
- `TestAnnotationConfigJSON` — to_json/from_json round-trip, edge cases
- `TestManifestOMERO` — save/load/list/delete with mocked OMERO connection
- `TestGeoJSONOMERO` — save/load with patch accumulation, namespace isolation

---

## Implementation Order

1. **omero_annotate_ai**: ChannelPresentation model + JSON serialization + OMERO persistence functions + tests
2. **Backend endpoints**: New manifest endpoints + simplified save/fetch + remove legacy
3. **Frontend components**: Port ImageChannelControls + append mode, update AnnotateViewer
4. **Frontend tabs**: Simplify ConfigureTab, AnnotateTab, PreviewViewer, TrainingBiomeroTab
5. **Cleanup**: Remove dead code (TrackingTableView, AnnotationSetPicker, old API calls, ROI/label code paths)
