# Annotate App Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the best features from the prediction app into the annotate app, replace dual-truth storage (YAML + OMERO table) with a single JSON manifest + per-image GeoJSON, and remove ROI/label creation from the annotation save flow.

**Architecture:** Two storage artifacts replace six: a JSON manifest (AnnotationConfig serialized) on the dataset for workflow state, and per-image GeoJSON FileAnnotations for polygon geometry. The omero_annotate_ai pydantic schema is extended with ChannelPresentation and FeatureType models. The web backend becomes a thin wrapper around omero_annotate_ai persistence functions.

**Tech Stack:** Python/pydantic (omero_annotate_ai), Django (OMERO.biomero backend), React/Blueprint.js (frontend), pixi (Python dev environment), yarn/webpack (frontend build)

**Spec:** `docs/superpowers/specs/2026-04-01-annotate-app-consolidation-design.md`

**Repos:**
- `omero_annotate_ai`: `/var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai`
- `OMERO.biomero`: `/var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero`

---

## Phase 1: omero_annotate_ai — New Models and Serialization

### Task 1: Add ChannelPresentation and FeatureType models

**Files:**
- Modify: `omero_annotate_ai/src/omero_annotate_ai/core/annotation_config.py:34` (near ImageAnnotation)
- Test: `omero_annotate_ai/tests/test_config.py`

- [x] **Step 1: Write failing tests for ChannelPresentation**

Add to `omero_annotate_ai/tests/test_config.py` after line 745:

```python
@pytest.mark.unit
class TestChannelPresentation:
    """Tests for ChannelPresentation model."""

    def test_create_with_required_fields(self):
        from omero_annotate_ai.core.annotation_config import ChannelPresentation
        cp = ChannelPresentation(channel_index=0, contrast_start=100.0, contrast_end=4500.0)
        assert cp.channel_index == 0
        assert cp.visible is True
        assert cp.contrast_start == 100.0
        assert cp.contrast_end == 4500.0
        assert cp.color == "#FFFFFF"

    def test_create_with_all_fields(self):
        from omero_annotate_ai.core.annotation_config import ChannelPresentation
        cp = ChannelPresentation(
            channel_index=1, visible=False,
            contrast_start=0.0, contrast_end=255.0, color="#00FF00"
        )
        assert cp.visible is False
        assert cp.color == "#00FF00"

    def test_serialization_round_trip(self):
        from omero_annotate_ai.core.annotation_config import ChannelPresentation
        cp = ChannelPresentation(channel_index=0, contrast_start=100.0, contrast_end=4500.0, color="#FF0000")
        data = cp.model_dump()
        cp2 = ChannelPresentation(**data)
        assert cp == cp2
```

- [x] **Step 2: Write failing tests for FeatureType**

Add below the TestChannelPresentation class:

```python
@pytest.mark.unit
class TestFeatureType:
    """Tests for FeatureType model."""

    def test_create(self):
        from omero_annotate_ai.core.annotation_config import FeatureType
        ft = FeatureType(name="cell", color="#FF0000")
        assert ft.name == "cell"
        assert ft.color == "#FF0000"

    def test_serialization_round_trip(self):
        from omero_annotate_ai.core.annotation_config import FeatureType
        ft = FeatureType(name="nucleus", color="#00FF00")
        data = ft.model_dump()
        ft2 = FeatureType(**data)
        assert ft == ft2
```

- [x] **Step 3: Run tests to verify they fail**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_config.py::TestChannelPresentation tests/test_config.py::TestFeatureType -v`

Expected: ImportError — ChannelPresentation and FeatureType not defined yet.

- [x] **Step 4: Implement ChannelPresentation and FeatureType models**

Add before `class ImageAnnotation(BaseModel):` (line 34) in `omero_annotate_ai/src/omero_annotate_ai/core/annotation_config.py`:

```python
class ChannelPresentation(BaseModel):
    """How an image channel is presented for annotation/training.

    Records the exact rendering parameters used when annotating,
    ensuring reproducibility and correct normalization for training.
    Lives at the image level — all patches share the same normalization.
    """
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

- [x] **Step 5: Add channel_presentation to ImageAnnotation**

In the `ImageAnnotation` class (around line 34, now shifted), add after the last existing field:

```python
    channel_presentation: Optional[List[ChannelPresentation]] = None
```

Add `from typing import List` import if not already present (it should be).

- [x] **Step 6: Add feature_types to AnnotationConfig**

In the `AnnotationConfig` class (around line 549, now shifted), add after the `tags` field:

```python
    feature_types: List[FeatureType] = Field(default_factory=list)
```

- [x] **Step 7: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_config.py::TestChannelPresentation tests/test_config.py::TestFeatureType -v`

Expected: All 5 tests PASS.

- [x] **Step 8: Run full test suite to check nothing is broken**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/ -v`

Expected: All existing tests still pass.

- [x] **Step 9: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai
git add src/omero_annotate_ai/core/annotation_config.py tests/test_config.py
git commit -m "feat: add ChannelPresentation and FeatureType pydantic models

ChannelPresentation records how channels are rendered during annotation
(contrast, visibility, color) at the image level. FeatureType defines
annotation classes (name + color) at the annotation set level."
```

---

### Task 2: Add to_json() / from_json() to AnnotationConfig

**Files:**
- Modify: `omero_annotate_ai/src/omero_annotate_ai/core/annotation_config.py` (AnnotationConfig class)
- Test: `omero_annotate_ai/tests/test_config.py`

- [x] **Step 1: Write failing tests**

Add to `tests/test_config.py`:

```python
import json
from pathlib import Path
import tempfile

@pytest.mark.unit
class TestAnnotationConfigJSON:
    """Tests for JSON serialization of AnnotationConfig."""

    def _make_config(self):
        from omero_annotate_ai.core.annotation_config import (
            AnnotationConfig, FeatureType, ChannelPresentation,
            StudyContext, DatasetInfo, AnnotationMethodology,
            SpatialCoverage, TrainingConfig, AIModelConfig,
            WorkflowConfig, OutputConfig, OMEROConfig, ImageAnnotation,
        )
        config = AnnotationConfig(
            name="test_workflow",
            study=StudyContext(title="Test", description="Test study"),
            dataset=DatasetInfo(source_description="test"),
            annotation_methodology=AnnotationMethodology(annotation_criteria="test"),
            spatial_coverage=SpatialCoverage(channels=[0]),
            training=TrainingConfig(),
            ai_model=AIModelConfig(),
            workflow=WorkflowConfig(),
            output=OutputConfig(),
            omero=OMEROConfig(container_type="dataset", container_id=1),
            feature_types=[FeatureType(name="cell", color="#FF0000")],
        )
        ann = ImageAnnotation(image_id=1, image_name="img1")
        ann.channel_presentation = [
            ChannelPresentation(channel_index=0, contrast_start=100, contrast_end=4500, color="#00FF00")
        ]
        config.annotations.append(ann)
        return config

    def test_to_json_returns_valid_json(self):
        config = self._make_config()
        json_str = config.to_json()
        data = json.loads(json_str)
        assert data["name"] == "test_workflow"
        assert len(data["feature_types"]) == 1
        assert data["feature_types"][0]["name"] == "cell"

    def test_from_json_string(self):
        config = self._make_config()
        json_str = config.to_json()
        loaded = type(config).from_json(json_str)
        assert loaded.name == config.name
        assert len(loaded.feature_types) == 1
        assert loaded.feature_types[0].name == "cell"
        assert len(loaded.annotations) == 1
        assert loaded.annotations[0].channel_presentation[0].contrast_start == 100

    def test_from_json_dict(self):
        config = self._make_config()
        data = json.loads(config.to_json())
        loaded = type(config).from_json(data)
        assert loaded.name == config.name

    def test_from_json_file(self):
        config = self._make_config()
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(config.to_json())
            f.flush()
            loaded = type(config).from_json(Path(f.name))
        assert loaded.name == config.name

    def test_round_trip_preserves_all_fields(self):
        config = self._make_config()
        json_str = config.to_json()
        loaded = type(config).from_json(json_str)
        # Compare via dict to check all fields
        assert config.to_dict() == loaded.to_dict()
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_config.py::TestAnnotationConfigJSON -v`

Expected: AttributeError — to_json/from_json not defined.

- [x] **Step 3: Implement to_json() and from_json()**

Add to the `AnnotationConfig` class in `annotation_config.py`, near the existing `to_yaml()` method (around line 899):

```python
    def to_json(self, **kwargs) -> str:
        """Serialize to JSON string.

        Uses the same dict representation as to_dict(), ensuring
        consistency with YAML serialization.
        """
        return json.dumps(self.to_dict(), default=str, **kwargs)

    @classmethod
    def from_json(cls, json_source: Union[str, Path, dict]) -> "AnnotationConfig":
        """Load from JSON string, file path, or dict.

        Args:
            json_source: JSON string, Path to .json file, or dict.

        Returns:
            Hydrated AnnotationConfig instance.
        """
        if isinstance(json_source, dict):
            return cls.from_dict(json_source)
        if isinstance(json_source, Path) or (
            isinstance(json_source, str) and not json_source.strip().startswith("{")
        ):
            path = Path(json_source)
            with open(path) as f:
                data = json.load(f)
            return cls.from_dict(data)
        data = json.loads(json_source)
        return cls.from_dict(data)
```

Add `import json` at the top of the file if not already present.

- [x] **Step 4: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_config.py::TestAnnotationConfigJSON -v`

Expected: All 5 tests PASS.

- [x] **Step 5: Run full test suite**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/ -v`

Expected: All tests pass.

- [x] **Step 6: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai
git add src/omero_annotate_ai/core/annotation_config.py tests/test_config.py
git commit -m "feat: add to_json/from_json serialization to AnnotationConfig

JSON is the primary serialization format for the web app manifest.
Supports string, dict, and file path inputs. Delegates to existing
to_dict/from_dict for consistency with YAML serialization."
```

---

### Task 3: Add OMERO manifest persistence functions

**Files:**
- Modify: `omero_annotate_ai/src/omero_annotate_ai/omero/omero_functions.py`
- Test: `omero_annotate_ai/tests/test_omero_functions.py`

- [x] **Step 1: Write failing tests for save/load manifest**

Add to `omero_annotate_ai/tests/test_omero_functions.py`:

```python
import json
from unittest.mock import MagicMock, patch, PropertyMock
from omero_annotate_ai.core.annotation_config import (
    AnnotationConfig, StudyContext, DatasetInfo, AnnotationMethodology,
    SpatialCoverage, TrainingConfig, AIModelConfig, WorkflowConfig,
    OutputConfig, OMEROConfig, FeatureType,
)


def _make_test_config(set_id="20260401_143022_483_a7f2"):
    config = AnnotationConfig(
        name="test_workflow",
        study=StudyContext(title="Test", description="Test"),
        dataset=DatasetInfo(source_description="test"),
        annotation_methodology=AnnotationMethodology(annotation_criteria="test"),
        spatial_coverage=SpatialCoverage(channels=[0]),
        training=TrainingConfig(),
        ai_model=AIModelConfig(),
        workflow=WorkflowConfig(),
        output=OutputConfig(),
        omero=OMEROConfig(container_type="dataset", container_id=1),
        feature_types=[FeatureType(name="cell", color="#FF0000")],
    )
    return config


@pytest.mark.unit
class TestManifestPersistence:
    """Tests for JSON manifest save/load/list/delete on OMERO."""

    def test_generate_set_id_is_unique(self):
        from omero_annotate_ai.omero.omero_functions import generate_set_id
        ids = {generate_set_id() for _ in range(100)}
        assert len(ids) == 100  # all unique

    def test_manifest_namespace(self):
        from omero_annotate_ai.omero.omero_functions import manifest_namespace
        ns = manifest_namespace("abc123")
        assert ns == "omero.biomero.manifest.abc123"

    def test_geojson_namespace(self):
        from omero_annotate_ai.omero.omero_functions import geojson_namespace
        ns = geojson_namespace("abc123")
        assert ns == "omero.biomero.annotations.abc123"
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestManifestPersistence -v`

Expected: ImportError — functions not defined.

- [x] **Step 3: Implement namespace helpers and set_id generator**

Add to `omero_annotate_ai/src/omero_annotate_ai/omero/omero_functions.py` near the top (after existing imports and constants):

```python
import json
import random
import string
from datetime import datetime

MANIFEST_NS_PREFIX = "omero.biomero.manifest."
GEOJSON_NS_PREFIX = "omero.biomero.annotations."


def generate_set_id() -> str:
    """Generate a unique set_id: timestamp with milliseconds + 4-char random suffix."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:20]  # trim microseconds to millis
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"{ts}_{suffix}"


def manifest_namespace(set_id: str) -> str:
    """Return the OMERO namespace for a manifest FileAnnotation."""
    return f"{MANIFEST_NS_PREFIX}{set_id}"


def geojson_namespace(set_id: str) -> str:
    """Return the OMERO namespace for GeoJSON FileAnnotations."""
    return f"{GEOJSON_NS_PREFIX}{set_id}"
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestManifestPersistence -v`

Expected: All 3 tests PASS.

- [x] **Step 5: Write failing tests for save_manifest_to_omero and load_manifest_from_omero**

Add to the TestManifestPersistence class in `tests/test_omero_functions.py`:

```python
    def test_save_manifest_to_omero(self):
        from omero_annotate_ai.omero.omero_functions import (
            save_manifest_to_omero, manifest_namespace,
        )
        conn = MagicMock()
        dataset = MagicMock()
        conn.getObject.return_value = dataset

        file_ann = MagicMock()
        file_ann.getId.return_value = 42
        conn.createFileAnnfromLocalFile.return_value = file_ann

        config = _make_test_config()
        set_id = "20260401_143022_483_a7f2"

        result = save_manifest_to_omero(conn, config, "dataset", 1, set_id)
        assert result == 42
        conn.createFileAnnfromLocalFile.assert_called_once()
        # Check that namespace was set correctly
        call_kwargs = conn.createFileAnnfromLocalFile.call_args
        assert manifest_namespace(set_id) in str(call_kwargs)

    def test_load_manifest_from_omero(self):
        from omero_annotate_ai.omero.omero_functions import (
            load_manifest_from_omero, manifest_namespace,
        )
        config = _make_test_config()
        json_bytes = config.to_json().encode("utf-8")

        file_ann = MagicMock()
        file_ann.getNs.return_value = manifest_namespace("test_set")
        file_ann.getFileInChunks.return_value = [json_bytes]
        file_ann.getId.return_value = 42

        dataset = MagicMock()
        dataset.listAnnotations.return_value = [file_ann]
        conn = MagicMock()
        conn.getObject.return_value = dataset

        loaded = load_manifest_from_omero(conn, "dataset", 1, "test_set")
        assert loaded is not None
        assert loaded.name == "test_workflow"
        assert len(loaded.feature_types) == 1

    def test_load_manifest_not_found(self):
        from omero_annotate_ai.omero.omero_functions import load_manifest_from_omero
        dataset = MagicMock()
        dataset.listAnnotations.return_value = []
        conn = MagicMock()
        conn.getObject.return_value = dataset

        result = load_manifest_from_omero(conn, "dataset", 1, "nonexistent")
        assert result is None

    def test_list_manifests_from_omero(self):
        from omero_annotate_ai.omero.omero_functions import (
            list_manifests_from_omero, manifest_namespace, MANIFEST_NS_PREFIX,
        )
        config = _make_test_config()
        json_bytes = config.to_json().encode("utf-8")

        file_ann = MagicMock()
        file_ann.getNs.return_value = manifest_namespace("set_001")
        file_ann.getFileInChunks.return_value = [json_bytes]
        file_ann.getId.return_value = 10

        dataset = MagicMock()
        dataset.listAnnotations.return_value = [file_ann]
        conn = MagicMock()
        conn.getObject.return_value = dataset

        manifests = list_manifests_from_omero(conn, "dataset", 1)
        assert len(manifests) == 1
        assert manifests[0]["set_id"] == "set_001"
        assert manifests[0]["name"] == "test_workflow"
```

- [x] **Step 6: Run tests to verify they fail**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestManifestPersistence -v`

Expected: ImportError for save_manifest_to_omero, load_manifest_from_omero, list_manifests_from_omero.

- [x] **Step 7: Implement save_manifest_to_omero**

Add to `omero_functions.py`:

```python
def save_manifest_to_omero(
    conn, config, container_type: str, container_id: int, set_id: str
) -> int:
    """Save AnnotationConfig as a JSON FileAnnotation on a container.

    Replaces any existing manifest with the same set_id namespace.
    Returns the FileAnnotation ID.
    """
    ns = manifest_namespace(set_id)
    container = conn.getObject(container_type.capitalize(), container_id)
    if not container:
        raise ValueError(f"{container_type} {container_id} not found")

    # Remove existing manifest with same namespace
    to_delete = []
    for ann in container.listAnnotations():
        if hasattr(ann, "getNs") and ann.getNs() == ns:
            to_delete.append(ann.getId())
    if to_delete:
        try:
            conn.deleteObjects("Annotation", to_delete, wait=True)
        except Exception:
            pass

    # Write JSON to temp file and upload
    filename = f"{config.name}_{set_id}.json"
    import tempfile, os
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", prefix=filename.replace(".json", "_"), delete=False
    ) as tmp:
        tmp.write(config.to_json())
        tmp_path = tmp.name

    try:
        file_ann = conn.createFileAnnfromLocalFile(
            tmp_path, mimetype="application/json", ns=ns
        )
        container.linkAnnotation(file_ann)
        return file_ann.getId()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
```

- [x] **Step 8: Implement load_manifest_from_omero**

```python
def load_manifest_from_omero(conn, container_type: str, container_id: int, set_id: str):
    """Load an AnnotationConfig manifest by set_id from a container.

    Returns None if not found.
    """
    from omero_annotate_ai.core.annotation_config import AnnotationConfig

    ns = manifest_namespace(set_id)
    container = conn.getObject(container_type.capitalize(), container_id)
    if not container:
        return None

    for ann in container.listAnnotations():
        if hasattr(ann, "getNs") and ann.getNs() == ns:
            try:
                content = b"".join(ann.getFileInChunks())
                data = json.loads(content)
                return AnnotationConfig.from_json(data)
            except Exception:
                continue
    return None
```

- [x] **Step 9: Implement list_manifests_from_omero**

```python
def list_manifests_from_omero(conn, container_type: str, container_id: int) -> list:
    """List all manifest summaries on a container.

    Returns list of dicts: {set_id, name, created, progress}.
    """
    from omero_annotate_ai.core.annotation_config import AnnotationConfig

    container = conn.getObject(container_type.capitalize(), container_id)
    if not container:
        return []

    manifests = []
    for ann in container.listAnnotations():
        ns = getattr(ann, "getNs", lambda: None)()
        if ns and ns.startswith(MANIFEST_NS_PREFIX):
            set_id = ns[len(MANIFEST_NS_PREFIX):]
            try:
                content = b"".join(ann.getFileInChunks())
                data = json.loads(content)
                config = AnnotationConfig.from_json(data)
                progress = config.get_progress_summary()
                manifests.append({
                    "set_id": set_id,
                    "name": config.name,
                    "created": str(config.created),
                    "progress": progress,
                    "annotation_id": ann.getId(),
                })
            except Exception:
                continue
    return manifests
```

- [x] **Step 10: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestManifestPersistence -v`

Expected: All 7 tests PASS.

- [x] **Step 11: Write failing test for delete_manifest_from_omero**

Add to TestManifestPersistence:

```python
    def test_delete_manifest_from_omero(self):
        from omero_annotate_ai.omero.omero_functions import (
            delete_manifest_from_omero, manifest_namespace, geojson_namespace,
        )
        config = _make_test_config()
        json_bytes = config.to_json().encode("utf-8")

        # Mock manifest FileAnnotation on dataset
        manifest_ann = MagicMock()
        manifest_ann.getNs.return_value = manifest_namespace("set_001")
        manifest_ann.getFileInChunks.return_value = [json_bytes]
        manifest_ann.getId.return_value = 10

        dataset = MagicMock()
        dataset.listAnnotations.return_value = [manifest_ann]

        # Mock GeoJSON FileAnnotation on image
        geojson_ann = MagicMock()
        geojson_ann.getNs.return_value = geojson_namespace("set_001")
        geojson_ann.getId.return_value = 20

        image = MagicMock()
        image.listAnnotations.return_value = [geojson_ann]

        conn = MagicMock()
        conn.getObject.side_effect = lambda t, i: dataset if t == "Dataset" else image

        result = delete_manifest_from_omero(conn, "dataset", 1, "set_001")
        assert result is True
        # Should have called deleteObjects for both manifest and geojson
        assert conn.deleteObjects.call_count >= 1
```

- [x] **Step 12: Implement delete_manifest_from_omero**

Add to `omero_functions.py`:

```python
def delete_manifest_from_omero(
    conn, container_type: str, container_id: int, set_id: str
) -> bool:
    """Delete a manifest and all associated GeoJSON FileAnnotations.

    Loads the manifest to find image IDs, then deletes GeoJSON files
    on each image before deleting the manifest itself.
    """
    from omero_annotate_ai.core.annotation_config import AnnotationConfig

    # Load manifest to find image IDs
    config = load_manifest_from_omero(conn, container_type, container_id, set_id)
    if config:
        image_ids = {ann.image_id for ann in config.annotations}
        ns = geojson_namespace(set_id)
        for image_id in image_ids:
            image = conn.getObject("Image", image_id)
            if not image:
                continue
            to_delete = [
                a.getId() for a in image.listAnnotations()
                if hasattr(a, "getNs") and a.getNs() == ns
            ]
            if to_delete:
                try:
                    conn.deleteObjects("Annotation", to_delete, wait=True)
                except Exception:
                    pass

    # Delete the manifest itself
    container = conn.getObject(container_type.capitalize(), container_id)
    if not container:
        return False
    mns = manifest_namespace(set_id)
    to_delete = [
        a.getId() for a in container.listAnnotations()
        if hasattr(a, "getNs") and a.getNs() == mns
    ]
    if to_delete:
        try:
            conn.deleteObjects("Annotation", to_delete, wait=True)
        except Exception:
            return False
    return True
```

- [x] **Step 13: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestManifestPersistence -v`

Expected: All 8 tests PASS.

- [x] **Step 14: Run full test suite**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/ -v`

Expected: All tests pass.

- [x] **Step 12: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai
git add src/omero_annotate_ai/omero/omero_functions.py tests/test_omero_functions.py
git commit -m "feat: add JSON manifest OMERO persistence functions

save_manifest_to_omero, load_manifest_from_omero, list_manifests_from_omero
store AnnotationConfig as namespaced JSON FileAnnotations on containers.
Replaces YAML config + OMERO HDF5 table with a single artifact."
```

---

### Task 4: Add GeoJSON OMERO persistence functions

**Files:**
- Modify: `omero_annotate_ai/src/omero_annotate_ai/omero/omero_functions.py`
- Test: `omero_annotate_ai/tests/test_omero_functions.py`

- [x] **Step 1: Write failing tests**

Add to `tests/test_omero_functions.py`:

```python
@pytest.mark.unit
class TestGeoJSONPersistence:
    """Tests for GeoJSON save/load on OMERO images."""

    def _make_geojson(self, patch=None):
        feature = {
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]},
            "properties": {"objectType": "annotation", "featureType": "cell", "plane": {"c": 0, "z": 0, "t": 0}},
        }
        if patch:
            feature["properties"]["patch"] = patch
        return {
            "type": "FeatureCollection",
            "channel_presentation": [{"channel_index": 0, "visible": True, "contrast_start": 0, "contrast_end": 255, "color": "#FFFFFF"}],
            "features": [feature],
        }

    def test_save_geojson_to_omero(self):
        from omero_annotate_ai.omero.omero_functions import save_geojson_to_omero
        conn = MagicMock()
        image = MagicMock()
        image.getName.return_value = "test_image"
        conn.getObject.return_value = image
        file_ann = MagicMock()
        file_ann.getId.return_value = 99
        conn.createFileAnnfromLocalFile.return_value = file_ann

        geojson = self._make_geojson()
        result = save_geojson_to_omero(conn, 1, geojson, "set_001")
        assert result == 99

    def test_load_geojson_from_omero(self):
        from omero_annotate_ai.omero.omero_functions import (
            load_geojson_from_omero, geojson_namespace,
        )
        geojson = self._make_geojson()
        json_bytes = json.dumps(geojson).encode("utf-8")

        file_ann = MagicMock()
        file_ann.getNs.return_value = geojson_namespace("set_001")
        file_ann.getFileInChunks.return_value = [json_bytes]

        image = MagicMock()
        image.listAnnotations.return_value = [file_ann]
        conn = MagicMock()
        conn.getObject.return_value = image

        loaded = load_geojson_from_omero(conn, 1, "set_001")
        assert loaded is not None
        assert loaded["type"] == "FeatureCollection"
        assert len(loaded["features"]) == 1

    def test_load_geojson_not_found(self):
        from omero_annotate_ai.omero.omero_functions import load_geojson_from_omero
        image = MagicMock()
        image.listAnnotations.return_value = []
        conn = MagicMock()
        conn.getObject.return_value = image

        result = load_geojson_from_omero(conn, 1, "nonexistent")
        assert result is None

    def test_save_geojson_accumulates_patches(self):
        """Saving GeoJSON with a new patch should merge with existing features."""
        from omero_annotate_ai.omero.omero_functions import (
            save_geojson_to_omero, geojson_namespace, merge_geojson_patches,
        )
        existing = self._make_geojson(patch={"x": 0, "y": 0, "width": 512, "height": 512})
        new_patch = self._make_geojson(patch={"x": 512, "y": 0, "width": 512, "height": 512})

        merged = merge_geojson_patches(existing, new_patch)
        assert len(merged["features"]) == 2

    def test_merge_geojson_replaces_same_patch(self):
        """Saving GeoJSON for the same patch should replace, not duplicate."""
        from omero_annotate_ai.omero.omero_functions import merge_geojson_patches
        existing = self._make_geojson(patch={"x": 0, "y": 0, "width": 512, "height": 512})
        updated = self._make_geojson(patch={"x": 0, "y": 0, "width": 512, "height": 512})
        updated["features"][0]["properties"]["featureType"] = "nucleus"

        merged = merge_geojson_patches(existing, updated)
        assert len(merged["features"]) == 1
        assert merged["features"][0]["properties"]["featureType"] == "nucleus"
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestGeoJSONPersistence -v`

Expected: ImportError.

- [x] **Step 3: Implement merge_geojson_patches**

Add to `omero_functions.py`:

```python
def merge_geojson_patches(existing: dict, new: dict) -> dict:
    """Merge new GeoJSON features into existing, replacing features for the same patch.

    Features are matched by their patch property (x, y, width, height).
    Features without a patch property are treated as full-image and always replaced.
    Channel presentation is taken from the new GeoJSON (latest truth).
    """
    result = {
        "type": "FeatureCollection",
        "channel_presentation": new.get("channel_presentation", existing.get("channel_presentation", [])),
        "features": [],
    }

    # Index new features by patch key
    def patch_key(feature):
        p = feature.get("properties", {}).get("patch")
        if p:
            return (p["x"], p["y"], p["width"], p["height"])
        return None  # full-image feature

    new_patches = {}
    for f in new.get("features", []):
        key = patch_key(f)
        if key not in new_patches:
            new_patches[key] = []
        new_patches[key].append(f)

    # Keep existing features whose patch is NOT in the new set
    for f in existing.get("features", []):
        key = patch_key(f)
        if key not in new_patches:
            result["features"].append(f)

    # Add all new features
    for features in new_patches.values():
        result["features"].extend(features)

    return result
```

- [x] **Step 4: Implement save_geojson_to_omero and load_geojson_from_omero**

```python
def save_geojson_to_omero(
    conn, image_id: int, geojson: dict, set_id: str
) -> int:
    """Save GeoJSON FeatureCollection as FileAnnotation on an image.

    If a GeoJSON for this set_id already exists on the image, merges
    patch features (replaces same-patch, accumulates different patches).
    Returns the FileAnnotation ID.
    """
    ns = geojson_namespace(set_id)
    image = conn.getObject("Image", image_id)
    if not image:
        raise ValueError(f"Image {image_id} not found")

    # Load existing and merge if present
    existing = load_geojson_from_omero(conn, image_id, set_id)
    if existing:
        geojson = merge_geojson_patches(existing, geojson)

    # Remove old FileAnnotation
    to_delete = []
    for ann in image.listAnnotations():
        if hasattr(ann, "getNs") and ann.getNs() == ns:
            to_delete.append(ann.getId())
    if to_delete:
        try:
            conn.deleteObjects("Annotation", to_delete, wait=True)
        except Exception:
            pass

    # Write and upload
    image_name = image.getName() or f"image_{image_id}"
    filename = f"{image_name}_{set_id}.geojson"
    import tempfile, os
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".geojson", prefix=filename.replace(".geojson", "_"), delete=False
    ) as tmp:
        json.dump(geojson, tmp)
        tmp_path = tmp.name

    try:
        file_ann = conn.createFileAnnfromLocalFile(
            tmp_path, mimetype="application/json", ns=ns
        )
        image.linkAnnotation(file_ann)
        return file_ann.getId()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def load_geojson_from_omero(conn, image_id: int, set_id: str):
    """Load GeoJSON FeatureCollection by set_id namespace from an image.

    Returns None if not found.
    """
    ns = geojson_namespace(set_id)
    image = conn.getObject("Image", image_id)
    if not image:
        return None

    for ann in image.listAnnotations():
        if hasattr(ann, "getNs") and ann.getNs() == ns:
            try:
                content = b"".join(ann.getFileInChunks())
                return json.loads(content)
            except Exception:
                continue
    return None
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/test_omero_functions.py::TestGeoJSONPersistence -v`

Expected: All 5 tests PASS.

- [x] **Step 6: Run full test suite**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai && pixi run -e dev pytest tests/ -v`

Expected: All tests pass.

- [x] **Step 7: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/omero_annotate_ai
git add src/omero_annotate_ai/omero/omero_functions.py tests/test_omero_functions.py
git commit -m "feat: add GeoJSON OMERO persistence with patch accumulation

save_geojson_to_omero, load_geojson_from_omero store per-image GeoJSON
FileAnnotations. merge_geojson_patches handles accumulation: new patches
are added, same-patch features are replaced."
```

---

## Phase 2: OMERO.biomero Backend — New Endpoints

### Task 5: Add manifest API endpoints

**Files:**
- Modify: `OMERO.biomero/omero_biomero/annotate_ai_views.py`
- Modify: `OMERO.biomero/omero_biomero/urls.py`
- Modify: `OMERO.biomero/webapp/src/apiService.js`

- [x] **Step 1: Add manifest view functions to annotate_ai_views.py**

Add near the top of the file (after existing imports):

```python
from omero_annotate_ai.omero.omero_functions import (
    generate_set_id, save_manifest_to_omero, load_manifest_from_omero,
    list_manifests_from_omero, delete_manifest_from_omero,
    save_geojson_to_omero, load_geojson_from_omero,
    manifest_namespace, geojson_namespace, merge_geojson_patches,
)
```

Then add the new view functions:

```python
@login_required()
@require_POST
def save_manifest(request, conn=None, **kwargs):
    """Save or update an AnnotationConfig manifest as JSON FileAnnotation."""
    try:
        data = json.loads(request.body)
        container_type = data.get("container_type", "dataset")
        container_id = int(data["container_id"])
        set_id = data.get("set_id") or generate_set_id()

        lib = _get_omero_annotate_ai()
        AnnotationConfig = lib["AnnotationConfig"]
        config = AnnotationConfig.from_json(data["config"])

        group_id = data.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        ann_id = save_manifest_to_omero(conn, config, container_type, container_id, set_id)
        return JsonResponse({"success": True, "set_id": set_id, "annotation_id": ann_id})
    except Exception as e:
        logger.exception("save_manifest failed")
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def load_manifest(request, conn=None, **kwargs):
    """Load a manifest by set_id from a container."""
    try:
        container_type = request.GET.get("container_type", "dataset")
        container_id = int(request.GET["container_id"])
        set_id = request.GET["set_id"]

        group_id = request.GET.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        config = load_manifest_from_omero(conn, container_type, container_id, set_id)
        if config is None:
            return JsonResponse({"error": "Manifest not found"}, status=404)
        return JsonResponse({"config": json.loads(config.to_json()), "set_id": set_id})
    except Exception as e:
        logger.exception("load_manifest failed")
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_GET
def list_manifests(request, conn=None, **kwargs):
    """List all manifests for a container."""
    try:
        container_type = request.GET.get("container_type", "dataset")
        container_id = int(request.GET["container_id"])

        group_id = request.GET.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        manifests = list_manifests_from_omero(conn, container_type, container_id)
        return JsonResponse({"manifests": manifests})
    except Exception as e:
        logger.exception("list_manifests failed")
        return JsonResponse({"error": str(e)}, status=500)


@login_required()
@require_POST
def delete_manifest(request, conn=None, **kwargs):
    """Delete a manifest and its associated GeoJSON files."""
    try:
        data = json.loads(request.body)
        container_type = data.get("container_type", "dataset")
        container_id = int(data["container_id"])
        set_id = data["set_id"]

        group_id = data.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        success = delete_manifest_from_omero(conn, container_type, container_id, set_id)
        return JsonResponse({"success": success})
    except Exception as e:
        logger.exception("delete_manifest failed")
        return JsonResponse({"error": str(e)}, status=500)
```

- [x] **Step 2: Add URL patterns**

In `OMERO.biomero/omero_biomero/urls.py`, add in the annotate AI URLs section (around line 123):

```python
    url(r'^api/annotate/save_manifest/$', views_annotate.save_manifest, name='save_manifest'),
    url(r'^api/annotate/load_manifest/$', views_annotate.load_manifest, name='load_manifest'),
    url(r'^api/annotate/list_manifests/$', views_annotate.list_manifests, name='list_manifests'),
    url(r'^api/annotate/delete_manifest/$', views_annotate.delete_manifest, name='delete_manifest'),
```

- [x] **Step 3: Add frontend API functions**

Add to `OMERO.biomero/webapp/src/apiService.js`:

```javascript
// Manifest API
export const saveManifest = async (containerType, containerId, config, setId = null, groupId = null) => {
  return apiRequest("/omero_biomero/api/annotate/save_manifest/", "POST", {
    container_type: containerType,
    container_id: containerId,
    config,
    set_id: setId,
    group_id: groupId,
  });
};

export const loadManifest = async (containerType, containerId, setId, groupId = null) => {
  const params = new URLSearchParams({
    container_type: containerType,
    container_id: containerId,
    set_id: setId,
  });
  if (groupId) params.set("group_id", groupId);
  return apiRequest(`/omero_biomero/api/annotate/load_manifest/?${params}`, "GET");
};

export const listManifests = async (containerType, containerId, groupId = null) => {
  const params = new URLSearchParams({
    container_type: containerType,
    container_id: containerId,
  });
  if (groupId) params.set("group_id", groupId);
  return apiRequest(`/omero_biomero/api/annotate/list_manifests/?${params}`, "GET");
};

export const deleteManifest = async (containerType, containerId, setId, groupId = null) => {
  return apiRequest("/omero_biomero/api/annotate/delete_manifest/", "POST", {
    container_type: containerType,
    container_id: containerId,
    set_id: setId,
    group_id: groupId,
  });
};
```

- [x] **Step 4: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add omero_biomero/annotate_ai_views.py omero_biomero/urls.py webapp/src/apiService.js
git commit -m "feat: add manifest CRUD endpoints

save_manifest, load_manifest, list_manifests, delete_manifest endpoints
wrap omero_annotate_ai persistence functions. Frontend API functions added."
```

---

### Task 6: Simplify save_annotation and fetch_annotation endpoints

**Files:**
- Modify: `OMERO.biomero/omero_biomero/annotate_ai_views.py:706` (save_annotation)
- Modify: `OMERO.biomero/omero_biomero/annotate_ai_views.py:1155` (fetch_annotation)

- [x] **Step 1: Rewrite save_annotation**

Replace the existing `save_annotation` function (line 706) with a simplified version that only writes GeoJSON and updates the manifest:

```python
@login_required()
@require_POST
def save_annotation(request, conn=None, **kwargs):
    """Save annotation GeoJSON for an image and update the manifest.

    Accepts a GeoJSON FeatureCollection payload. Saves it as a namespaced
    FileAnnotation on the image (accumulating patches). Updates the manifest
    to mark the unit as processed and cache channel presentation.
    """
    try:
        data = json.loads(request.body)
        image_id = int(data["image_id"])
        set_id = data["set_id"]
        geojson = data["annotations"]  # GeoJSON FeatureCollection
        unit_index = data.get("unit_index")
        channel_presentation = data.get("channel_presentation")

        group_id = data.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        # Save GeoJSON (accumulates patches automatically)
        ann_id = save_geojson_to_omero(conn, image_id, geojson, set_id)

        # Update manifest if unit_index provided
        if unit_index is not None and data.get("container_type") and data.get("container_id"):
            config = load_manifest_from_omero(
                conn, data["container_type"], int(data["container_id"]), set_id
            )
            if config and unit_index < len(config.annotations):
                unit = config.annotations[unit_index]
                unit.processed = True
                from datetime import datetime
                unit.annotation_updated_at = datetime.now().isoformat()
                if not unit.annotation_created_at:
                    unit.annotation_created_at = unit.annotation_updated_at
                if channel_presentation:
                    from omero_annotate_ai.core.annotation_config import ChannelPresentation
                    unit.channel_presentation = [
                        ChannelPresentation(**cp) for cp in channel_presentation
                    ]
                save_manifest_to_omero(
                    conn, config, data["container_type"], int(data["container_id"]), set_id
                )

        return JsonResponse({"success": True, "annotation_id": ann_id})
    except Exception as e:
        logger.exception("save_annotation failed")
        return JsonResponse({"error": str(e)}, status=500)
```

- [x] **Step 2: Rewrite fetch_annotation**

Replace the existing `fetch_annotation` function (line 1155) with a simplified version:

```python
@login_required()
@require_GET
def fetch_annotation(request, conn=None, **kwargs):
    """Fetch GeoJSON annotations for an image by set_id.

    Returns a GeoJSON FeatureCollection or empty collection.
    """
    try:
        image_id = int(request.GET["image"])
        set_id = request.GET.get("set_id")

        group_id = request.GET.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        if not set_id:
            return JsonResponse({"type": "FeatureCollection", "features": []})

        geojson = load_geojson_from_omero(conn, image_id, set_id)
        if geojson:
            return JsonResponse(geojson)
        return JsonResponse({"type": "FeatureCollection", "features": []})
    except Exception as e:
        logger.exception("fetch_annotation failed")
        return JsonResponse({"error": str(e)}, status=500)
```

- [x] **Step 3: Update apiService.js to use set_id instead of table_id**

Update the frontend API calls in `webapp/src/apiService.js`:

```javascript
export const saveAnnotateAnnotation = async (
  imageId, annotations, setId, unitIndex, containerType, containerId,
  channelPresentation = null, groupId = null
) => {
  return apiRequest("/omero_biomero/api/annotate/save_annotation/", "POST", {
    image_id: imageId,
    annotations,
    set_id: setId,
    unit_index: unitIndex,
    container_type: containerType,
    container_id: containerId,
    channel_presentation: channelPresentation,
    group_id: groupId,
  });
};

export const fetchAnnotateAnnotation = async (imageId, setId) => {
  return apiRequest(
    `/omero_biomero/api/annotate/fetch_annotation/?image=${imageId}&set_id=${setId}`,
    "GET",
  );
};
```

- [x] **Step 4: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add omero_biomero/annotate_ai_views.py webapp/src/apiService.js
git commit -m "feat: simplify save/fetch annotation to GeoJSON-only

save_annotation now only writes GeoJSON and updates manifest.
No ROI creation, no label TIFF, no tracking table update.
fetch_annotation uses set_id namespace, no ROI fallback."
```

---

### Task 7: Add add_patch endpoint

**Files:**
- Modify: `OMERO.biomero/omero_biomero/annotate_ai_views.py`
- Modify: `OMERO.biomero/omero_biomero/urls.py`
- Modify: `OMERO.biomero/webapp/src/apiService.js`

- [x] **Step 1: Add add_patch view function**

Add to `annotate_ai_views.py`:

```python
@login_required()
@require_POST
def add_patch(request, conn=None, **kwargs):
    """Add a new patch unit to an existing manifest.

    Generates a random patch position for the given image, adds it as
    a new ImageAnnotation unit to the manifest, and saves.
    """
    try:
        data = json.loads(request.body)
        container_type = data.get("container_type", "dataset")
        container_id = int(data["container_id"])
        set_id = data["set_id"]
        image_id = int(data["image_id"])
        image_name = str(data["image_name"])
        image_width = int(data["image_width"])
        image_height = int(data["image_height"])

        group_id = data.get("group_id")
        if group_id:
            conn.setGroupForSession(int(group_id))

        config = load_manifest_from_omero(conn, container_type, container_id, set_id)
        if not config:
            return JsonResponse({"error": "Manifest not found"}, status=404)

        # Get patch size from spatial coverage config
        patch_w, patch_h = config.spatial_coverage.patch_size
        patch_w = min(patch_w, image_width)
        patch_h = min(patch_h, image_height)

        # Generate random patch position
        import random
        max_x = max(0, image_width - patch_w)
        max_y = max(0, image_height - patch_h)
        patch_x = random.randint(0, max_x) if max_x > 0 else 0
        patch_y = random.randint(0, max_y) if max_y > 0 else 0

        # Determine channel/z/t from existing units for this image
        existing = [a for a in config.annotations if a.image_id == image_id]
        channel = existing[0].channel if existing else (config.spatial_coverage.channels[0] if config.spatial_coverage.channels else -1)
        z_slice = existing[0].z_slice if existing else -1
        timepoint = existing[0].timepoint if existing else -1

        from omero_annotate_ai.core.annotation_config import ImageAnnotation
        new_unit = ImageAnnotation(
            image_id=image_id,
            image_name=image_name,
            is_patch=True,
            patch_x=patch_x,
            patch_y=patch_y,
            patch_width=patch_w,
            patch_height=patch_h,
            channel=channel,
            z_slice=z_slice,
            timepoint=timepoint,
            category="training",
        )
        config.annotations.append(new_unit)
        save_manifest_to_omero(conn, config, container_type, container_id, set_id)

        return JsonResponse({
            "success": True,
            "unit": new_unit.model_dump(),
            "unit_index": len(config.annotations) - 1,
        })
    except Exception as e:
        logger.exception("add_patch failed")
        return JsonResponse({"error": str(e)}, status=500)
```

- [x] **Step 2: Add URL pattern**

In `urls.py`, add:

```python
    url(r'^api/annotate/add_patch/$', views_annotate.add_patch, name='add_patch_manifest'),
```

- [x] **Step 3: Add frontend API function**

Add to `apiService.js`:

```javascript
export const addPatchToManifest = async (
  containerType, containerId, setId, imageId, imageName, imageWidth, imageHeight, groupId = null
) => {
  return apiRequest("/omero_biomero/api/annotate/add_patch/", "POST", {
    container_type: containerType,
    container_id: containerId,
    set_id: setId,
    image_id: imageId,
    image_name: imageName,
    image_width: imageWidth,
    image_height: imageHeight,
    group_id: groupId,
  });
};
```

- [x] **Step 4: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add omero_biomero/annotate_ai_views.py omero_biomero/urls.py webapp/src/apiService.js
git commit -m "feat: add add_patch endpoint for manifest-based patch creation

Generates random patch position using spatial coverage config,
adds unit to manifest, and saves. Replaces tracking table add_patch."
```

---

## Phase 3: Frontend — Port Components and Update Viewers

### Task 8: Port ImageChannelControls from prediction

**Files:**
- Source: `OMERO.biomero/webapp/src/biomero/prediction/components/ImageChannelControls.js`
- Target: `OMERO.biomero/webapp/src/biomero/annotate/components/ImageChannelControls.js`

- [x] **Step 1: Copy prediction's ImageChannelControls to annotate**

Read the prediction version and copy it over to replace the annotate version. The prediction version has: 0-100% scales, auto-scale button, numeric inputs + RangeSlider, channel locking.

- [x] **Step 2: Verify the component works with annotate's PreviewViewer**

Update PreviewViewer.js imports if needed to match the new prop names (channelScales instead of channelWindows, etc.).

- [x] **Step 3: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/components/ImageChannelControls.js
git commit -m "feat: port prediction's ImageChannelControls to annotate

Replaces simple slider-only version with richer controls:
0-100% scales, auto-scale button, numeric inputs, channel locking."
```

---

### Task 9: Add appendToAnnotations to GeometryUtils

**Files:**
- Source: `OMERO.biomero/webapp/src/biomero/prediction/utils/GeometryUtils.js`
- Target: `OMERO.biomero/webapp/src/biomero/annotate/utils/GeometryUtils.js`

- [x] **Step 1: Copy appendToAnnotations function from prediction's GeometryUtils**

Read the prediction version's `appendToAnnotations` function and add it to the annotate version's `GeometryUtils.js`.

- [x] **Step 2: Export the new function**

Ensure `appendToAnnotations` is exported from the annotate GeometryUtils.

- [x] **Step 3: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/utils/GeometryUtils.js
git commit -m "feat: add appendToAnnotations polygon union to GeometryUtils

Ported from prediction app. Enables append mode: merging overlapping
annotations of the same feature type."
```

---

### Task 10: Add click-to-select and append mode to AnnotateViewer

**Files:**
- Modify: `OMERO.biomero/webapp/src/biomero/annotate/components/AnnotateViewer.js`

- [x] **Step 1: Add selectedAnnotation state and canvas hit-testing**

Add to AnnotateViewer state:

```javascript
const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
```

Add point-in-polygon hit test function:

```javascript
const pointInPolygon = (x, y, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

const handleCanvasClickSelect = (e) => {
  const pt = getCanvasPoint(e);
  // Check annotations in reverse order (top-most first)
  for (let i = annotations.length - 1; i >= 0; i--) {
    if (pointInPolygon(pt.x, pt.y, annotations[i].points)) {
      setSelectedAnnotationId(annotations[i].id);
      return;
    }
  }
  setSelectedAnnotationId(null);
};
```

- [x] **Step 2: Add Delete key handler**

```javascript
useEffect(() => {
  const handleKeyDown = (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotationId) {
      onAnnotationsChange(annotations.filter(a => a.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [selectedAnnotationId, annotations, onAnnotationsChange]);
```

- [x] **Step 3: Draw selection highlight in the draw function**

In the canvas draw function, after drawing all annotations, add:

```javascript
// Draw selection highlight
if (selectedAnnotationId) {
  const selected = annotations.find(a => a.id === selectedAnnotationId);
  if (selected && selected.points.length > 1) {
    ctx.strokeStyle = "#4a9eed";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(selected.points[0][0], selected.points[0][1]);
    selected.points.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
```

- [x] **Step 4: Add "Selected" indicator to the sidebar**

In the sidebar, below the Classes section, add:

```jsx
{selectedAnnotationId && (() => {
  const ann = annotations.find(a => a.id === selectedAnnotationId);
  const ft = ann ? featureTypes.find(t => t.id === ann.typeId) : null;
  return (
    <div style={{ padding: 8, background: "#ffffcc", borderRadius: 4, fontSize: 12, textAlign: "center", marginTop: 8 }}>
      <em>Selected: {ft?.name || "Unknown"}</em><br />
      <span style={{ fontSize: 11, color: "#888" }}>Press Delete to remove</span>
    </div>
  );
})()}
```

- [x] **Step 5: Add append mode**

Add "append" to the mode options alongside "add" and "subtract". When mode is "append", use `appendToAnnotations` from GeometryUtils to merge new polygons with existing annotations of the same feature type.

- [x] **Step 6: Wire up pan tool click to selection**

When tool is "pan" and user clicks (not drags), call `handleCanvasClickSelect`.

- [x] **Step 7: Build and test**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

- [x] **Step 8: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/components/AnnotateViewer.js
git commit -m "feat: add click-to-select and append mode to AnnotateViewer

Click annotation on canvas to select, Delete to remove. No per-object
list needed — classes panel shows counts only.
Append mode merges overlapping same-type annotations (ported from prediction)."
```

---

## Phase 4: Frontend — Simplify Tabs

### Task 11: Simplify ConfigureTab to create manifest

**Files:**
- Modify: `OMERO.biomero/webapp/src/biomero/annotate/components/ConfigureTab.js`

- [x] **Step 1: Replace tracking table creation with manifest creation**

Update ConfigureTab to:
- Replace `createTrackingTable` call with `saveManifest`
- Replace `listTrackingTables` with `listManifests`
- Replace `deleteTrackingTable` with `deleteManifest`
- Replace `loadAnnotateConfig` with `listManifests` + `loadManifest`
- Remove AnnotationSetPicker import, use a simple select from manifest list
- On "Initialize & Start", construct AnnotationConfig JSON and call `saveManifest`

- [x] **Step 2: Build and test**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

- [x] **Step 3: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/components/ConfigureTab.js
git commit -m "feat: simplify ConfigureTab to use manifest API

Replaces YAML config + tracking table creation with single manifest save.
Lists and deletes manifests instead of tracking tables."
```

---

### Task 12: Simplify AnnotateTab to use manifest

**Files:**
- Modify: `OMERO.biomero/webapp/src/biomero/annotate/components/AnnotateTab.js`

- [x] **Step 1: Replace tracking table API with manifest API**

Update AnnotateTab to:
- Replace `getTrackingTableDetail(tableId)` with loading units from manifest (passed via props or loaded via `loadManifest`)
- Replace `saveAnnotateAnnotation` call signature to use `setId` instead of `tableId`
- Replace `markUnitProcessed` with manifest update (handled by save_annotation now)
- Replace `addPatchToTrackingTable` with manifest-based add_patch
- Replace `getAnnotateProgress` with progress computed from manifest units
- Remove TrackingTableView import, replace with simple unit list
- Build GeoJSON payload with patch property when saving patch annotations

- [x] **Step 2: Build a simple UnitList component inline**

Replace TrackingTableView with a simpler list that reads units from the manifest and groups by image:

```jsx
const UnitList = ({ units, selectedIndex, onSelect }) => (
  <div className="flex flex-col gap-1 overflow-y-auto">
    {units.map((unit, i) => (
      <div
        key={i}
        className={`p-2 text-xs cursor-pointer rounded ${
          i === selectedIndex ? "bg-blue-100 border border-blue-400" : "bg-white border hover:bg-gray-50"
        } ${unit.processed ? "opacity-60" : ""}`}
        onClick={() => onSelect(i)}
      >
        <div className="font-medium">{unit.image_name}</div>
        {unit.is_patch && (
          <div className="text-gray-500">
            Patch {unit.patch_width}x{unit.patch_height} at ({unit.patch_x}, {unit.patch_y})
          </div>
        )}
        <div className="flex gap-2 text-gray-400">
          {unit.channel >= 0 && <span>C:{unit.channel}</span>}
          {unit.z_slice >= 0 && <span>Z:{unit.z_slice}</span>}
          {unit.timepoint >= 0 && <span>T:{unit.timepoint}</span>}
          <span>{unit.processed ? "Done" : "Pending"}</span>
        </div>
      </div>
    ))}
  </div>
);
```

- [x] **Step 3: Build and test**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

- [x] **Step 4: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/components/AnnotateTab.js
git commit -m "feat: simplify AnnotateTab to use manifest API

Replaces tracking table with manifest for unit management.
Simple inline UnitList replaces TrackingTableView.
Save uses set_id, GeoJSON includes patch property."
```

---

### Task 13: Simplify PreviewViewer

**Files:**
- Modify: `OMERO.biomero/webapp/src/biomero/annotate/components/PreviewViewer.js`

- [x] **Step 1: Remove fetchAllImageAnnotations usage**

Remove the `fetchAllImageAnnotations` call and the "existing ROIs" layer that loads all ROIs without namespace filtering. Keep only the annotation set overlay that uses `fetchAnnotateAnnotation` with `setId`.

- [x] **Step 2: Update fetchAnnotateAnnotation call to use set_id**

Replace `fetchAnnotateAnnotation(image.id, annotationSetId)` with `fetchAnnotateAnnotation(image.id, setId)`.

- [x] **Step 3: Build and test**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

- [x] **Step 4: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/components/PreviewViewer.js
git commit -m "fix: remove leaky fetchAllImageAnnotations from PreviewViewer

Only loads annotation set GeoJSON by set_id namespace.
Eliminates cross-set annotation contamination."
```

---

### Task 14: Update TrainingBiomeroTab to use manifest

**Files:**
- Modify: `OMERO.biomero/webapp/src/biomero/annotate/components/TrainingBiomeroTab.js`

- [x] **Step 1: Replace tracking table references with manifest**

- Replace `listTrackingTables` with `listManifests`
- Replace `validateTrainingReadiness(annotationSetId)` — validation can now be done client-side by checking manifest unit progress
- Update data source selection to reference manifest `set_id` instead of `table_id`

- [x] **Step 2: Build and test**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

- [x] **Step 3: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/components/TrainingBiomeroTab.js
git commit -m "feat: update TrainingBiomeroTab to read from manifest

Replaces tracking table listing with manifest listing.
Training readiness validated from manifest progress."
```

---

### Task 15: Update AnnotateApp to pass manifest state

**Files:**
- Modify: `OMERO.biomero/webapp/src/biomero/annotate/AnnotateApp.js`

- [x] **Step 1: Replace tableId state with setId and manifest state**

Update AnnotateApp to manage `setId` and `manifest` (AnnotationConfig JSON) instead of `tableId` and `config`. Pass these to child tabs.

- [x] **Step 2: Build and test**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

- [x] **Step 3: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add webapp/src/biomero/annotate/AnnotateApp.js
git commit -m "feat: update AnnotateApp to use manifest state

Replaces tableId/config with setId/manifest. Passes manifest
to all child tabs for consistent state management."
```

---

## Phase 5: Cleanup

### Task 16: Remove dead code

**Files:**
- Delete: `OMERO.biomero/webapp/src/biomero/annotate/components/TrackingTableView.js`
- Delete: `OMERO.biomero/webapp/src/biomero/annotate/components/AnnotationSetPicker.js`
- Modify: `OMERO.biomero/omero_biomero/annotate_ai_views.py` (remove legacy functions)
- Modify: `OMERO.biomero/omero_biomero/urls.py` (remove legacy URL patterns)
- Modify: `OMERO.biomero/webapp/src/apiService.js` (remove legacy API calls)

- [ ] **Step 1: Delete TrackingTableView.js and AnnotationSetPicker.js**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
rm webapp/src/biomero/annotate/components/TrackingTableView.js
rm webapp/src/biomero/annotate/components/AnnotationSetPicker.js
```

- [ ] **Step 2: Remove legacy backend functions from annotate_ai_views.py**

Remove or comment out:
- `_upload_config_yaml()` function
- `_load_config()` function
- `_save_config()` function
- `manage_config()` view function
- `_create_tracking_table()` function
- `manage_tracking_table()` view function
- `get_tracking_table_detail()` view function
- `_update_tracking_table_row()` function
- `get_progress()` view function
- `mark_unit_processed()` view function
- `_save_geojson_file_ann()` (replaced by omero_annotate_ai function)
- ROI/label creation code in old save_annotation

- [ ] **Step 3: Remove legacy URL patterns from urls.py**

Remove URL patterns for: `manage_config`, `manage_tracking_table`, `get_tracking_table_detail`, `get_progress`, `mark_unit_processed`.

- [ ] **Step 4: Remove legacy API functions from apiService.js**

Remove: `createAnnotateConfig`, `loadAnnotateConfig`, `createTrackingTable`, `listTrackingTables`, `getTrackingTableDetail`, `getAnnotateProgress`, `markUnitProcessed`, `addPatchToTrackingTable`, `fetchAllImageAnnotations`, `deleteTrackingTable`.

- [ ] **Step 5: Build to verify no broken imports**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

Expected: Build succeeds with no import errors.

- [ ] **Step 6: Commit**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add -A
git commit -m "chore: remove legacy tracking table, YAML config, and ROI code

Deletes TrackingTableView, AnnotationSetPicker components.
Removes manage_config, create_tracking_table, and related endpoints.
Removes legacy API functions from apiService.
All state now flows through manifest + GeoJSON."
```

---

### Task 17: Deploy and smoke test

- [ ] **Step 1: Rebuild frontend**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build
```

- [ ] **Step 2: Deploy to OMERO web container**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && bash omero-init.sh
```

- [ ] **Step 3: Smoke test the full workflow**

1. Open annotate app in browser
2. ConfigureTab: Create a new annotation set for a dataset
3. Verify manifest appears in list
4. Switch to AnnotateTab: verify units load from manifest
5. Draw annotations on an image, save
6. Verify GeoJSON saved (check in OMERO)
7. "Add Patch" on current image — verify new unit appears
8. Switch to PreviewTab: verify annotation overlay loads
9. Check that no ROIs were created on the image
10. Delete the annotation set — verify cleanup

- [ ] **Step 4: Final commit with any smoke test fixes**

```bash
cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero
git add -A
git commit -m "fix: smoke test fixes after consolidation"
```
