# Multi-Annotation Set Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multiple independent annotation sets per dataset/plate with isolated storage, a set picker UI, simplified annotation sidebar, unified training tab with validation, and annotation set overview in Preview.

**Architecture:** Each annotation set maps 1:1 to an AnnotationConfig + OMERO tracking table. GeoJSON FileAnnotations are namespaced by table_id for isolation. The frontend gets a set picker in ConfigureTab, object count summary replacing the flat annotation list, and a merged Training tab with readiness validation. All storage uses standard OMERO objects (FileAnnotations, ROIs, OMERO.tables, namespaces).

**Tech Stack:** Python/Django (backend views), React/JavaScript (frontend), OMERO API, omero_annotate_ai library, Blueprint.js UI components

**Spec:** `docs/superpowers/specs/2026-03-31-multi-annotation-sets-design.md`

---

## File Structure

### Files to Modify

| File | Responsibility | Changes |
|------|---------------|---------|
| `omero_biomero/annotate_ai_views.py` | Backend annotation endpoints | Add `validate_training_readiness()` endpoint, ensure GeoJSON namespace uses `table_id` |
| `omero_biomero/training_views.py` | Backend training endpoints | Add training validation endpoint |
| `omero_biomero/urls.py` | URL routing | Add validation endpoint URL |
| `webapp/src/apiService.js` | Frontend API client | Add `validateTrainingReadiness()` function |
| `webapp/src/biomero/annotate/AnnotateApp.js` | Tab registration, shared state | Add set name to state, header bar, merge training tabs |
| `webapp/src/biomero/annotate/components/ConfigureTab.js` | Config form + table management | Add set picker dropdown at top |
| `webapp/src/biomero/annotate/components/AnnotateViewer.js` | Canvas + annotation tools | Replace flat annotation list with object count summary |
| `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js` | SLURM training | Merge into unified TrainingTab with validation checklist |
| `webapp/src/biomero/annotate/components/PreviewTab.js` | Image browsing | Add annotation sets list |

### Files to Create

| File | Responsibility |
|------|---------------|
| `webapp/src/biomero/annotate/components/AnnotationSetPicker.js` | Reusable dropdown for selecting/creating annotation sets |
| `webapp/src/biomero/annotate/components/TrainingValidation.js` | Training readiness checklist component |
| `omero_biomero/tests/test_annotate_ai_views.py` | Backend tests for annotation views |

### Files to Delete

| File | Reason |
|------|--------|
| `webapp/src/biomero/annotate/components/TrainingTab.js` | Merged into unified TrainingBiomeroTab (renamed) |

---

## Task 1: Backend — Training Validation Endpoint

**Files:**
- Modify: `omero_biomero/annotate_ai_views.py`
- Modify: `omero_biomero/urls.py`
- Create: `omero_biomero/tests/test_annotate_ai_views.py`

This task adds an endpoint that checks whether an annotation set has enough annotated images in each split (train/val/test) to proceed with training.

- [ ] **Step 1: Write the test file with validation tests**

Create `omero_biomero/tests/test_annotate_ai_views.py`:

```python
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase


def _raw(func_name):
    from omero_biomero import annotate_ai_views as av

    fn = getattr(av, func_name)
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


class TestValidateTrainingReadiness(TestCase):
    """Tests for the validate_training_readiness endpoint."""

    def _make_request(self, table_id=None):
        request = MagicMock()
        request.method = "GET"
        request.GET = {}
        if table_id is not None:
            request.GET["table_id"] = str(table_id)
        return request

    def _make_conn_with_table(self, rows):
        """Build a mock conn that returns an OMERO table with the given rows.

        Each row is a dict with keys: category, processed.
        category is "training", "validation", or "test".
        """
        conn = MagicMock()

        # Build DataFrame-like structure that ezomero.get_table returns
        import pandas as pd

        data = {
            "image_id": list(range(len(rows))),
            "image_name": [f"img_{i}" for i in range(len(rows))],
            "processed": [r["processed"] for r in rows],
            "train": [r["category"] == "training" for r in rows],
            "validate": [r["category"] == "validation" for r in rows],
        }
        df = pd.DataFrame(data)
        return conn, df

    @patch("omero_biomero.annotate_ai_views.ezomero")
    def test_missing_table_id_returns_400(self, mock_ez):
        fn = _raw("validate_training_readiness")
        request = self._make_request(table_id=None)
        conn = MagicMock()
        resp = fn(request, conn=conn)
        self.assertEqual(resp.status_code, 400)

    @patch("omero_biomero.annotate_ai_views.ezomero")
    def test_no_training_annotations_returns_blocker(self, mock_ez):
        fn = _raw("validate_training_readiness")
        rows = [
            {"category": "training", "processed": False},
            {"category": "training", "processed": False},
            {"category": "validation", "processed": True},
        ]
        conn, df = self._make_conn_with_table(rows)
        mock_ez.get_table.return_value = df

        request = self._make_request(table_id=42)
        resp = fn(request, conn=conn)
        data = json.loads(resp.content)

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(data["ready"])
        blocker_checks = [c for c in data["checks"] if c["level"] == "blocker"]
        self.assertTrue(any("training" in c["message"].lower() for c in blocker_checks))

    @patch("omero_biomero.annotate_ai_views.ezomero")
    def test_no_validation_annotations_returns_blocker(self, mock_ez):
        fn = _raw("validate_training_readiness")
        rows = [
            {"category": "training", "processed": True},
            {"category": "training", "processed": True},
            {"category": "validation", "processed": False},
        ]
        conn, df = self._make_conn_with_table(rows)
        mock_ez.get_table.return_value = df

        request = self._make_request(table_id=42)
        resp = fn(request, conn=conn)
        data = json.loads(resp.content)

        self.assertFalse(data["ready"])
        blocker_checks = [c for c in data["checks"] if c["level"] == "blocker"]
        self.assertTrue(any("validation" in c["message"].lower() for c in blocker_checks))

    @patch("omero_biomero.annotate_ai_views.ezomero")
    def test_no_test_annotations_returns_warning(self, mock_ez):
        fn = _raw("validate_training_readiness")
        rows = [
            {"category": "training", "processed": True},
            {"category": "validation", "processed": True},
            {"category": "test", "processed": False},
        ]
        conn, df = self._make_conn_with_table(rows)
        mock_ez.get_table.return_value = df

        request = self._make_request(table_id=42)
        resp = fn(request, conn=conn)
        data = json.loads(resp.content)

        self.assertTrue(data["ready"])
        warning_checks = [c for c in data["checks"] if c["level"] == "warning"]
        self.assertTrue(any("test" in c["message"].lower() for c in warning_checks))

    @patch("omero_biomero.annotate_ai_views.ezomero")
    def test_all_splits_annotated_returns_ready(self, mock_ez):
        fn = _raw("validate_training_readiness")
        rows = [
            {"category": "training", "processed": True},
            {"category": "training", "processed": True},
            {"category": "validation", "processed": True},
            {"category": "test", "processed": True},
        ]
        conn, df = self._make_conn_with_table(rows)
        mock_ez.get_table.return_value = df

        request = self._make_request(table_id=42)
        resp = fn(request, conn=conn)
        data = json.loads(resp.content)

        self.assertTrue(data["ready"])
        blockers = [c for c in data["checks"] if c["level"] == "blocker"]
        self.assertEqual(len(blockers), 0)

    @patch("omero_biomero.annotate_ai_views.ezomero")
    def test_few_training_images_returns_warning(self, mock_ez):
        fn = _raw("validate_training_readiness")
        rows = [
            {"category": "training", "processed": True},
            {"category": "training", "processed": True},
            {"category": "validation", "processed": True},
        ]
        conn, df = self._make_conn_with_table(rows)
        mock_ez.get_table.return_value = df

        request = self._make_request(table_id=42)
        resp = fn(request, conn=conn)
        data = json.loads(resp.content)

        self.assertTrue(data["ready"])
        warnings = [c for c in data["checks"] if c["level"] == "warning"]
        self.assertTrue(
            any("few" in c["message"].lower() or "only" in c["message"].lower() for c in warnings)
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -m pytest omero_biomero/tests/test_annotate_ai_views.py -v`

Expected: FAIL — `validate_training_readiness` does not exist yet.

- [ ] **Step 3: Implement the validation endpoint**

Add to `omero_biomero/annotate_ai_views.py` (after the `get_progress` function, near end of file):

```python
@login_required()
def validate_training_readiness(request, conn=None, **kwargs):
    """Check if an annotation set has sufficient data for training.

    GET params:
        table_id: tracking table ID

    Returns JSON with:
        ready: bool — True if no blockers
        checks: list of {check, level, message} dicts
        summary: {train_total, train_done, val_total, val_done, test_total, test_done}
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET only"}, status=405)

    table_id = request.GET.get("table_id")
    if not table_id:
        return JsonResponse({"error": "table_id required"}, status=400)

    try:
        table_id = int(table_id)
        df = ezomero.get_table(conn, table_id)
    except Exception as e:
        return JsonResponse({"error": f"Could not read table: {e}"}, status=404)

    # Count per split
    train_mask = df["train"] == True
    val_mask = df["validate"] == True
    # Test = rows that are neither train nor validate
    test_mask = ~train_mask & ~val_mask

    train_total = int(train_mask.sum())
    train_done = int((train_mask & (df["processed"] == True)).sum())
    val_total = int(val_mask.sum())
    val_done = int((val_mask & (df["processed"] == True)).sum())
    test_total = int(test_mask.sum())
    test_done = int((test_mask & (df["processed"] == True)).sum())

    checks = []

    # Blocker: no training annotations
    if train_done == 0:
        checks.append({
            "check": "training_annotations",
            "level": "blocker",
            "message": "None of your training images have annotations yet. "
                       "Go to the Annotate tab to start labeling.",
        })
    elif train_done < 5:
        checks.append({
            "check": "training_count",
            "level": "warning",
            "message": f"Only {train_done} training images annotated. "
                       "More annotations generally improve model quality.",
        })
    else:
        checks.append({
            "check": "training_annotations",
            "level": "pass",
            "message": f"{train_done} training images annotated.",
        })

    # Blocker: no validation annotations
    if val_total > 0 and val_done == 0:
        checks.append({
            "check": "validation_annotations",
            "level": "blocker",
            "message": "Validation images are needed to monitor training progress. "
                       "Annotate at least a few validation images.",
        })
    elif val_total > 0:
        checks.append({
            "check": "validation_annotations",
            "level": "pass",
            "message": f"{val_done} validation images annotated.",
        })

    # Warning: no test annotations
    if test_total > 0 and test_done == 0:
        checks.append({
            "check": "test_annotations",
            "level": "warning",
            "message": "Without test images, you won't be able to evaluate "
                       "your model's performance on unseen data.",
        })
    elif test_total > 0:
        checks.append({
            "check": "test_annotations",
            "level": "pass",
            "message": f"{test_done} test images annotated.",
        })

    has_blockers = any(c["level"] == "blocker" for c in checks)

    return JsonResponse({
        "ready": not has_blockers,
        "checks": checks,
        "summary": {
            "train_total": train_total,
            "train_done": train_done,
            "val_total": val_total,
            "val_done": val_done,
            "test_total": test_total,
            "test_done": test_done,
        },
    })
```

- [ ] **Step 4: Add the URL pattern**

Add to `omero_biomero/urls.py` in the annotate section (after the progress URL):

```python
url(
    r"^api/annotate/validate_training/$",
    views_annotate.validate_training_readiness,
    name="annotate_validate_training",
),
```

Also add the import alias if not present:
```python
from omero_biomero import annotate_ai_views as views_annotate
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -m pytest omero_biomero/tests/test_annotate_ai_views.py -v`

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add omero_biomero/tests/test_annotate_ai_views.py omero_biomero/annotate_ai_views.py omero_biomero/urls.py
git commit -m "feat: add training readiness validation endpoint with tests"
```

---

## Task 2: Frontend — AnnotationSetPicker Component

**Files:**
- Create: `webapp/src/biomero/annotate/components/AnnotationSetPicker.js`
- Modify: `webapp/src/apiService.js`

A reusable dropdown component that lists existing annotation sets for a container, showing name + progress, with a "+ New set" option. Used by ConfigureTab and TrainingTab.

- [ ] **Step 1: Add `validateTrainingReadiness` API function**

Add to `webapp/src/apiService.js` in the annotate section (after `getAnnotateProgress`):

```javascript
export const validateTrainingReadiness = async (tableId) => {
  const endpoint = `/omero_biomero/api/annotate/validate_training/?table_id=${tableId}`;
  const response = await apiRequest(endpoint, "GET");
  return response;
};
```

- [ ] **Step 2: Create AnnotationSetPicker component**

Create `webapp/src/biomero/annotate/components/AnnotationSetPicker.js`:

```javascript
import React from "react";
import { HTMLSelect, Button, FormGroup, Intent, Tag } from "@blueprintjs/core";

/**
 * Dropdown for selecting an existing annotation set or creating a new one.
 *
 * Props:
 *   tables: array of { id, name, ... } from listTrackingTables()
 *   selectedTableId: currently selected table ID (or null)
 *   onSelectTable: (table) => void — called with the full table object, or null for "new"
 *   onCreateNew: () => void — called when user picks "+ New annotation set"
 *   loading: bool
 *   disabled: bool
 */
const AnnotationSetPicker = ({
  tables = [],
  selectedTableId,
  onSelectTable,
  onCreateNew,
  loading = false,
  disabled = false,
}) => {
  const handleChange = (e) => {
    const value = e.target.value;
    if (value === "__new__") {
      onCreateNew();
    } else if (value === "") {
      onSelectTable(null);
    } else {
      const table = tables.find((t) => String(t.id) === value);
      if (table) onSelectTable(table);
    }
  };

  return (
    <FormGroup
      label="Annotation Set"
      helperText={
        tables.length === 0 && !loading
          ? "No annotation sets yet. Create one below."
          : undefined
      }
    >
      <HTMLSelect
        value={selectedTableId ? String(selectedTableId) : ""}
        onChange={handleChange}
        disabled={disabled || loading}
        fill
      >
        <option value="">— Select annotation set —</option>
        {tables.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.name || `Set #${t.id}`}
          </option>
        ))}
        <option value="__new__">+ New annotation set</option>
      </HTMLSelect>
    </FormGroup>
  );
};

export default AnnotationSetPicker;
```

- [ ] **Step 3: Commit**

```bash
git add webapp/src/biomero/annotate/components/AnnotationSetPicker.js webapp/src/apiService.js
git commit -m "feat: add AnnotationSetPicker component and validation API function"
```

---

## Task 3: Frontend — Integrate Set Picker into ConfigureTab

**Files:**
- Modify: `webapp/src/biomero/annotate/components/ConfigureTab.js`

Add the AnnotationSetPicker dropdown at the top of ConfigureTab. When a user selects an existing set, auto-populate the config form. When they pick "+ New", clear the form.

- [ ] **Step 1: Add import and state for set selection mode**

At the top of `ConfigureTab.js`, add the import:

```javascript
import AnnotationSetPicker from "./AnnotationSetPicker";
```

Add state variable near existing state declarations (around line 35):

```javascript
const [isNewSet, setIsNewSet] = useState(false);
const [selectedTable, setSelectedTable] = useState(null);
```

- [ ] **Step 2: Add set picker at the top of the form render**

Find the main form render section and add the AnnotationSetPicker at the very top, before the existing config fields. The picker should appear right after any container selection, before the "Name" field.

Insert before the existing form fields:

```jsx
<AnnotationSetPicker
  tables={existingTables}
  selectedTableId={selectedTable?.id || null}
  onSelectTable={(table) => {
    setSelectedTable(table);
    setIsNewSet(false);
    if (table) {
      handleLoadExistingTable(table);
    }
  }}
  onCreateNew={() => {
    setSelectedTable(null);
    setIsNewSet(true);
    // Clear form for new set
    setName("");
    setStudyTitle("");
    setStudyDescription("");
  }}
  loading={initializing}
/>
```

- [ ] **Step 3: Auto-load tables when container changes**

The existing `checkExistingTables()` function already loads tables when a container is selected. Verify it runs on container change. If no tables exist, automatically set `isNewSet = true` so the form is ready.

In the effect that calls `checkExistingTables()`, add after the tables are loaded:

```javascript
// If no tables exist, default to creating a new set
if (tables.length === 0) {
  setIsNewSet(true);
  setSelectedTable(null);
}
```

- [ ] **Step 4: Conditionally show config form**

The full config form (name, study context, spatial coverage, etc.) should only show when either:
- `isNewSet` is true (creating a new set), OR
- `selectedTable` is set (editing/viewing an existing set)

Wrap the config form fields in:

```jsx
{(isNewSet || selectedTable) && (
  <div>
    {/* existing config form fields */}
  </div>
)}
```

- [ ] **Step 5: Build and test manually**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`
Then: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && bash omero-init.sh`

Verify in browser:
- Open a dataset with no annotation sets → form shows directly with "+ New" option
- Open a dataset with existing sets → picker shows, select one → form populates
- Click "+ New annotation set" → form clears for new input

- [ ] **Step 6: Commit**

```bash
git add webapp/src/biomero/annotate/components/ConfigureTab.js
git commit -m "feat: integrate annotation set picker into ConfigureTab"
```

---

## Task 4: Frontend — Replace Flat Annotation List with Object Count

**Files:**
- Modify: `webapp/src/biomero/annotate/components/AnnotateViewer.js`

Replace the "Features" + "Annotations (N)" flat list with a clean "Classes" section showing object counts. Individual objects are managed via canvas interaction, not the sidebar.

- [ ] **Step 1: Locate the annotations list in AnnotateViewer.js**

Read the file around lines 789-898 where the Features section and Annotations list are rendered. This is the section to replace.

- [ ] **Step 2: Replace Features section with Classes section**

Replace the "Features" heading and feature type list (around lines 789-867) with a cleaner "Classes" section. Keep the functionality (add/remove feature types, color assignment) but rename "Features" to "Classes":

```jsx
{/* Classes section */}
<div style={{ marginTop: 12 }}>
  <h6 style={{ marginBottom: 8 }}>Classes</h6>
  {featureTypes.map((ft) => {
    const count = annotations.filter(
      (a) => a.typeId === ft.id
    ).length;
    return (
      <div
        key={ft.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          marginBottom: 4,
          borderRadius: 4,
          borderLeft: `3px solid ${ft.color}`,
          background:
            activeFeatureType === ft.id
              ? "rgba(45, 114, 210, 0.15)"
              : "transparent",
          cursor: "pointer",
        }}
        onClick={() => setActiveFeatureType(ft.id)}
      >
        <div
          style={{
            width: 14,
            height: 14,
            background: ft.color,
            borderRadius: 2,
          }}
        />
        <span style={{ flex: 1, fontSize: 13 }}>
          {ft.name || "Default"}
        </span>
        <Tag minimal round>
          {count}
        </Tag>
      </div>
    );
  })}
  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
    <input
      className="bp5-input"
      placeholder="Add class..."
      value={newFeatureName}
      onChange={(e) => setNewFeatureName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") addFeatureType();
      }}
      style={{ flex: 1, fontSize: 12 }}
    />
    <Button
      small
      icon="plus"
      onClick={addFeatureType}
      disabled={!newFeatureName.trim()}
    />
  </div>
</div>
```

- [ ] **Step 3: Replace the flat Annotations list with a summary**

Replace the "Annotations (N)" list (around lines 869-898) that renders "Unknown #1", "Unknown #2" items with a simple count summary:

```jsx
{/* Object count summary */}
<div style={{ marginTop: 16 }}>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}
  >
    <h6 style={{ margin: 0 }}>
      {annotations.length} object{annotations.length !== 1 ? "s" : ""}
    </h6>
    {annotations.length > 0 && (
      <Button
        small
        minimal
        intent={Intent.DANGER}
        icon="trash"
        text="Clear all"
        onClick={() => onAnnotationsChange([])}
      />
    )}
  </div>
  <p
    style={{
      fontSize: 11,
      color: "#888",
      marginTop: 4,
    }}
  >
    Click an object on the canvas to select it. Press Delete to
    remove.
  </p>
</div>
```

- [ ] **Step 4: Build and test manually**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`
Then: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && bash omero-init.sh`

Verify:
- "Features" renamed to "Classes"
- Each class shows object count in a tag
- No flat list of "Unknown #1, #2, #3..."
- "Clear all" button works
- Drawing/deleting objects on canvas still works

- [ ] **Step 5: Commit**

```bash
git add webapp/src/biomero/annotate/components/AnnotateViewer.js
git commit -m "feat: replace flat annotation list with object count summary, rename Features to Classes"
```

---

## Task 5: Frontend — TrainingValidation Component

**Files:**
- Create: `webapp/src/biomero/annotate/components/TrainingValidation.js`

A component that displays training readiness checks as a visual checklist with blockers (red), warnings (yellow), and passes (green).

- [ ] **Step 1: Create TrainingValidation component**

Create `webapp/src/biomero/annotate/components/TrainingValidation.js`:

```javascript
import React from "react";
import { Callout, Intent, Icon, Spinner } from "@blueprintjs/core";

/**
 * Displays training readiness validation results as a checklist.
 *
 * Props:
 *   validation: { ready, checks: [{check, level, message}], summary } | null
 *   loading: bool
 */
const TrainingValidation = ({ validation, loading = false }) => {
  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <Spinner size={30} />
        <p style={{ marginTop: 8, color: "#888" }}>
          Checking annotation readiness...
        </p>
      </div>
    );
  }

  if (!validation) {
    return null;
  }

  const levelConfig = {
    blocker: {
      icon: "cross",
      intent: Intent.DANGER,
      color: "#db3737",
      bg: "rgba(219, 55, 55, 0.08)",
      border: "rgba(219, 55, 55, 0.3)",
    },
    warning: {
      icon: "warning-sign",
      intent: Intent.WARNING,
      color: "#bf7326",
      bg: "rgba(191, 115, 38, 0.08)",
      border: "rgba(191, 115, 38, 0.3)",
    },
    pass: {
      icon: "tick-circle",
      intent: Intent.SUCCESS,
      color: "#0d8050",
      bg: "rgba(13, 128, 80, 0.08)",
      border: "rgba(13, 128, 80, 0.3)",
    },
  };

  const { summary } = validation;

  return (
    <div>
      {/* Summary counts */}
      {summary && (
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 16,
            padding: 12,
            background: "#f5f5f5",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <div>
            <strong>Training:</strong> {summary.train_done}/{summary.train_total}
          </div>
          <div>
            <strong>Validation:</strong> {summary.val_done}/{summary.val_total}
          </div>
          {summary.test_total > 0 && (
            <div>
              <strong>Test:</strong> {summary.test_done}/{summary.test_total}
            </div>
          )}
        </div>
      )}

      {/* Validation checks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {validation.checks.map((check, i) => {
          const cfg = levelConfig[check.level] || levelConfig.pass;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 14px",
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderRadius: 6,
              }}
            >
              <Icon
                icon={cfg.icon}
                intent={cfg.intent}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 13 }}>{check.message}</span>
            </div>
          );
        })}
      </div>

      {/* Overall status */}
      {!validation.ready && (
        <Callout intent={Intent.DANGER} style={{ marginTop: 12 }} icon="error">
          Fix the issues marked above before starting training.
        </Callout>
      )}
    </div>
  );
};

export default TrainingValidation;
```

- [ ] **Step 2: Commit**

```bash
git add webapp/src/biomero/annotate/components/TrainingValidation.js
git commit -m "feat: add TrainingValidation readiness checklist component"
```

---

## Task 6: Frontend — Unified Training Tab

**Files:**
- Modify: `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js`
- Modify: `webapp/src/biomero/annotate/AnnotateApp.js`
- Delete: `webapp/src/biomero/annotate/components/TrainingTab.js`

Merge TrainingTab (simple) and TrainingBiomeroTab (SLURM) into one unified tab. Add annotation set selector and validation checklist. Remove the old TrainingTab.

- [ ] **Step 1: Add annotation set picker and validation to TrainingBiomeroTab**

In `TrainingBiomeroTab.js`, add imports:

```javascript
import AnnotationSetPicker from "./AnnotationSetPicker";
import TrainingValidation from "./TrainingValidation";
import { listTrackingTables, validateTrainingReadiness } from "../../apiService";
```

Add state for set selection and validation (near existing state, around line 28):

```javascript
const [annotationSets, setAnnotationSets] = useState([]);
const [selectedAnnotationSet, setSelectedAnnotationSet] = useState(null);
const [validation, setValidation] = useState(null);
const [validationLoading, setValidationLoading] = useState(false);
```

- [ ] **Step 2: Add effect to load annotation sets when container changes**

Add effect to load annotation sets when the dataset/container selection changes:

```javascript
useEffect(() => {
  if (!selectedDatasets || selectedDatasets.length === 0) return;
  const datasetId = selectedDatasets[0];
  listTrackingTables("dataset", datasetId).then((resp) => {
    setAnnotationSets(resp.tables || []);
  });
}, [selectedDatasets]);
```

- [ ] **Step 3: Add effect to validate when annotation set is selected**

```javascript
useEffect(() => {
  if (!selectedAnnotationSet) {
    setValidation(null);
    return;
  }
  setValidationLoading(true);
  validateTrainingReadiness(selectedAnnotationSet.id)
    .then((resp) => setValidation(resp))
    .catch(() => setValidation(null))
    .finally(() => setValidationLoading(false));
}, [selectedAnnotationSet]);
```

- [ ] **Step 4: Add set picker and validation UI to the render**

Add the AnnotationSetPicker and TrainingValidation components before the training parameters form. The training form and "Start Training" button should only be enabled when `validation?.ready` is true:

```jsx
{/* Annotation Set Selection */}
<FormGroup label="Select annotation set to train on">
  <AnnotationSetPicker
    tables={annotationSets}
    selectedTableId={selectedAnnotationSet?.id}
    onSelectTable={(table) => setSelectedAnnotationSet(table)}
    onCreateNew={() => {}}
    loading={false}
  />
</FormGroup>

{/* Validation Checklist */}
{(selectedAnnotationSet || validationLoading) && (
  <TrainingValidation
    validation={validation}
    loading={validationLoading}
  />
)}

{/* Training form — only show when ready */}
{validation?.ready && (
  <div>
    {/* existing training parameters form */}
  </div>
)}
```

- [ ] **Step 5: Disable Start Training button when not ready**

Find the submit button and add disabled condition:

```jsx
<Button
  intent={Intent.PRIMARY}
  text="Start Training"
  onClick={handleSubmit}
  disabled={submitting || !validation?.ready}
  loading={submitting}
/>
```

- [ ] **Step 6: Update AnnotateApp.js — remove old TrainingTab, rename the merged tab**

In `AnnotateApp.js`:

Remove the import of `TrainingTab`:
```javascript
// Remove this line:
// import TrainingTab from "./components/TrainingTab";
```

Remove the old "Training" tab panel (the simple one). Keep only the TrainingBiomeroTab, but rename its tab title from "Training (biomero)" to just "Training":

```jsx
<Tab
  id="training"
  title={
    <span>
      <Icon icon="build" size={14} /> Training
    </span>
  }
  panel={<TrainingBiomeroTab config={config} tableId={tableId} />}
/>
```

Pass `config` and `tableId` as props so the Training tab knows the current annotation set context.

- [ ] **Step 7: Delete the old TrainingTab.js file**

Run: `rm webapp/src/biomero/annotate/components/TrainingTab.js`

- [ ] **Step 8: Build and test manually**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`
Then: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && bash omero-init.sh`

Verify:
- Only one "Training" tab (not two)
- Annotation set dropdown appears
- Selecting a set triggers validation
- Blockers disable the Start Training button
- Warnings show but allow training
- All green → form appears, can start training

- [ ] **Step 9: Commit**

```bash
git add webapp/src/biomero/annotate/components/TrainingBiomeroTab.js webapp/src/biomero/annotate/AnnotateApp.js
git rm webapp/src/biomero/annotate/components/TrainingTab.js
git commit -m "feat: merge training tabs into unified tab with validation checklist"
```

---

## Task 7: Frontend — Header Bar Showing Active Set

**Files:**
- Modify: `webapp/src/biomero/annotate/AnnotateApp.js`

Add a persistent header bar below the tabs showing the active annotation set name and progress. Visible on Annotate and Training tabs.

- [ ] **Step 1: Add `activeSetName` state to AnnotateApp**

In `AnnotateApp.js`, add state for the active set name (near existing state around line 24):

```javascript
const [activeSetName, setActiveSetName] = useState(null);
```

Update `handleConfigCreated` to capture the set name:

```javascript
const handleConfigCreated = (newConfig, newTableId, newUnits, newProgress) => {
  setConfig(newConfig);
  setTableId(newTableId);
  setUnits(newUnits);
  setProgress(newProgress);
  setActiveSetName(newConfig?.name || `Set #${newTableId}`);
  setActiveTab("annotate");
};
```

- [ ] **Step 2: Add header bar to the render**

Add a header bar between the tab bar and the tab panel content. Only show when `activeSetName` and `tableId` are set:

```jsx
{activeSetName && tableId && (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "8px 16px",
      background: "#e8f0fe",
      borderBottom: "1px solid #c4d4e8",
      fontSize: 13,
    }}
  >
    <Icon icon="annotation" size={14} />
    <strong>{activeSetName}</strong>
    {progress && (
      <span style={{ color: "#555" }}>
        — {progress.completed_units}/{progress.total_units} images
        annotated
      </span>
    )}
  </div>
)}
```

- [ ] **Step 3: Build and test manually**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`
Then: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && bash omero-init.sh`

Verify:
- Header bar appears after selecting/creating a set
- Shows set name and progress count
- Visible on both Annotate and Training tabs
- Updates when progress changes

- [ ] **Step 4: Commit**

```bash
git add webapp/src/biomero/annotate/AnnotateApp.js
git commit -m "feat: add persistent header bar showing active annotation set and progress"
```

---

## Task 8: Frontend — Annotation Sets List in Preview Tab

**Files:**
- Modify: `webapp/src/biomero/annotate/components/PreviewTab.js`

Add a read-only list of existing annotation sets for the selected container in the Preview tab.

- [ ] **Step 1: Read PreviewTab.js to understand current structure**

Read the full file to understand the current component layout and where to add the annotation sets list.

- [ ] **Step 2: Add imports and state**

Add imports:

```javascript
import { listTrackingTables } from "../../apiService";
```

Add state:

```javascript
const [annotationSets, setAnnotationSets] = useState([]);
const [setsLoading, setSetsLoading] = useState(false);
```

- [ ] **Step 3: Add effect to load annotation sets when container changes**

```javascript
useEffect(() => {
  if (!selectedContainer) {
    setAnnotationSets([]);
    return;
  }
  setSetsLoading(true);
  listTrackingTables(containerType, selectedContainer.id)
    .then((resp) => setAnnotationSets(resp.tables || []))
    .catch(() => setAnnotationSets([]))
    .finally(() => setSetsLoading(false));
}, [selectedContainer, containerType]);
```

Adjust the dependency variable names to match the actual prop/state names used in PreviewTab.js (e.g., `selectedDataset`, `containerId`, etc.).

- [ ] **Step 4: Add annotation sets section to the render**

Add a section below the existing container/image browser, before or alongside the prediction model runner:

```jsx
{/* Annotation Sets */}
{annotationSets.length > 0 && (
  <div style={{ marginTop: 16 }}>
    <h6>Annotation Sets</h6>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {annotationSets.map((s) => (
        <div
          key={s.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 12px",
            background: "#f5f5f5",
            borderRadius: 4,
            fontSize: 13,
          }}
        >
          <span>{s.name || `Set #${s.id}`}</span>
          <Tag minimal>{s.id}</Tag>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Build and test manually**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`
Then: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && bash omero-init.sh`

Verify:
- Preview tab shows list of annotation sets for the selected container
- Sets display name and ID
- No editing/creating actions available (read-only)
- Empty state is clean (no section shown when no sets exist)

- [ ] **Step 6: Commit**

```bash
git add webapp/src/biomero/annotate/components/PreviewTab.js
git commit -m "feat: show annotation sets list in Preview tab"
```

---

## Task 9: Backend — Ensure GeoJSON Namespace Uses table_id

**Files:**
- Modify: `omero_biomero/annotate_ai_views.py`
- Modify: `omero_biomero/tests/test_annotate_ai_views.py`

Currently GeoJSON FileAnnotations may be namespaced by `config_name`. For proper set isolation, ensure the namespace uses `table_id` instead: `omero.biomero.annotations.{table_id}`.

- [ ] **Step 1: Add test for namespace isolation**

Add to `omero_biomero/tests/test_annotate_ai_views.py`:

```python
class TestGeoJsonNamespace(TestCase):
    """Verify GeoJSON annotations are namespaced by table_id."""

    def test_geojson_namespace_uses_table_id(self):
        """The namespace for GeoJSON FileAnnotations should include the table_id."""
        from omero_biomero.annotate_ai_views import _geojson_namespace

        ns = _geojson_namespace(42)
        self.assertEqual(ns, "omero.biomero.annotations.42")

    def test_geojson_namespace_different_tables(self):
        """Different table_ids produce different namespaces."""
        from omero_biomero.annotate_ai_views import _geojson_namespace

        ns1 = _geojson_namespace(42)
        ns2 = _geojson_namespace(99)
        self.assertNotEqual(ns1, ns2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -m pytest omero_biomero/tests/test_annotate_ai_views.py::TestGeoJsonNamespace -v`

Expected: FAIL — `_geojson_namespace` does not exist.

- [ ] **Step 3: Add `_geojson_namespace` helper and update save/fetch**

Add helper function to `omero_biomero/annotate_ai_views.py` (near top, after imports):

```python
def _geojson_namespace(table_id):
    """Return the OMERO namespace for GeoJSON annotations tied to a tracking table."""
    return f"omero.biomero.annotations.{table_id}"
```

Then find all places where GeoJSON FileAnnotations are saved or fetched and ensure they use `_geojson_namespace(table_id)` instead of a config-name-based namespace. Key locations:

1. In `_save_geojson_file_ann()` — update the namespace parameter
2. In `fetch_annotation()` — update the namespace used for lookup
3. In `save_annotation()` — ensure `table_id` is passed through to the GeoJSON save

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero && python -m pytest omero_biomero/tests/test_annotate_ai_views.py -v`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add omero_biomero/annotate_ai_views.py omero_biomero/tests/test_annotate_ai_views.py
git commit -m "feat: namespace GeoJSON annotations by table_id for set isolation"
```

---

## Task 10: Frontend — Set Avoid Overlap Default to ON

**Files:**
- Modify: `webapp/src/biomero/annotate/components/AnnotateViewer.js`

- [ ] **Step 1: Find the avoidOverlap state initialization**

In `AnnotateViewer.js`, locate the state declaration for the "Avoid Overlap" toggle (around line 72-110). It likely defaults to `false`.

- [ ] **Step 2: Change default to `true`**

Change:
```javascript
const [avoidOverlap, setAvoidOverlap] = useState(false);
```
to:
```javascript
const [avoidOverlap, setAvoidOverlap] = useState(true);
```

- [ ] **Step 3: Build and verify**

Run: `cd /var/home/maartenpaul/Documents/GitHub/BIOMERO-repos/OMERO.biomero/webapp && yarn build`

Verify the "Avoid Overlap" checkbox is checked by default when opening the Annotate tab.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/biomero/annotate/components/AnnotateViewer.js
git commit -m "feat: default Avoid Overlap to ON"
```

---

## Future Work (Out of Scope for This Plan)

- **On-the-fly label mask generation:** The spec states label masks should not be stored but generated from GeoJSON at training time. Currently `save_annotation()` creates label TIFFs via `upload_rois_and_labels()`. This change requires updates to both the backend save flow (skip TIFF upload, keep ROI creation) and the SLURM training script (`SLURM_Run_Training.py` in the biomero worker). For now, label masks continue to be stored alongside GeoJSON — GeoJSON remains the source of truth, labels are a convenience cache.
- **SLURM fallback:** The spec mentions falling back to local prediction training when no SLURM connection is available. The unified Training tab currently focuses on SLURM workflows. Adding local training fallback can be done as a follow-up.

---

## Completion Checklist

After all tasks are done, verify end-to-end:

- [ ] Multiple annotation sets can be created on the same dataset
- [ ] Sets are fully isolated — switching sets shows only that set's annotations
- [ ] Training tab shows annotation set picker with validation
- [ ] Blockers prevent training, warnings allow it
- [ ] Preview tab shows annotation sets list
- [ ] Header bar shows active set name and progress
- [ ] "Features" renamed to "Classes", no flat annotation list
- [ ] Avoid Overlap defaults to ON
- [ ] All backend tests pass
- [ ] Frontend builds without errors
