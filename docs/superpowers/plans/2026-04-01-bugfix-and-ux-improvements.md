# Bugfix and UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 issues spanning training pipeline, performance, and frontend UX across 4 repos.

**Architecture:** Independent fixes that can be committed and deployed separately. The only dependency is Task 2 (performance fix) before Task 7 (preview overlay). Each task targets specific files with minimal blast radius.

**Tech Stack:** Python (Django, OMERO API, ezomero), React (BlueprintJS), Singularity containers, SLURM sbatch scripts.

---

## File Structure

### `omero_annotate_ai` (package — `../omero_annotate_ai/`)
- Modify: `src/omero_annotate_ai/omero/omero_utils.py` — fix `list_user_tables()` and `list_annotations_by_namespace()`

### `W_Segmentation-Cellpose4` (container — `../W_Segmentation-Cellpose4/`)
- Modify: `Dockerfile` — change `CELLPOSE_LOCAL_MODELS_PATH`
- Modify: `train.py` — update model search/persist paths

### `biomero-scripts` (SLURM scripts — `../biomero-scripts/`)
- Modify: `__workflows/SLURM_Run_Training.py` — update bind mount and add env override

### `OMERO.biomero` (this repo)
- Modify: `webapp/src/biomero/annotate/components/TrackingTableView.js` — grouped patch listing
- Modify: `webapp/src/biomero/annotate/components/AnnotateTab.js` — skip popover, ROI guard
- Modify: `webapp/src/biomero/annotate/components/AnnotationSetPicker.js` — conditional "new" option
- Modify: `webapp/src/biomero/annotate/components/PreviewTab.js` — annotation set selection + overlay
- Modify: `webapp/src/biomero/annotate/components/PreviewViewer.js` — render annotation set ROIs
- Modify: `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js` — pass showCreateNew={false}

---

### Task 1: Fix Cellpose Training Permission Error (#8)

**Files:**
- Modify: `../W_Segmentation-Cellpose4/Dockerfile:16`
- Modify: `../W_Segmentation-Cellpose4/train.py:247-288`
- Modify: `../biomero-scripts/__workflows/SLURM_Run_Training.py:401-434`

- [ ] **Step 1: Update Dockerfile — change CELLPOSE_LOCAL_MODELS_PATH**

In `../W_Segmentation-Cellpose4/Dockerfile`, change line 16:

```dockerfile
# Before:
ENV CELLPOSE_LOCAL_MODELS_PATH=/tmp/models/cellpose/

# After:
ENV CELLPOSE_LOCAL_MODELS_PATH=/data/models/cellpose/
```

Also update line 45 (the mkdir):

```dockerfile
# Before:
RUN mkdir -p ${CELLPOSE_LOCAL_MODELS_PATH} && chmod 777 ${CELLPOSE_LOCAL_MODELS_PATH}

# After:
RUN mkdir -p /tmp/models/cellpose && chmod 777 /tmp/models/cellpose
```

Note: We keep the RUN mkdir for the Docker build layer (needed during `pip install cellpose` which may try to cache). But at runtime in Singularity, `CELLPOSE_LOCAL_MODELS_PATH` points to `/data/models/cellpose/` which is writable via bind mount.

- [ ] **Step 2: Update train.py — fix model search and persist paths**

In `../W_Segmentation-Cellpose4/train.py`, update `find_trained_model()` (line 247-250):

```python
# Before:
search_dirs = [
    os.path.join(train_dir, "models"),
    os.environ.get("CELLPOSE_LOCAL_MODELS_PATH",
                    "/tmp/models/cellpose/"),
]

# After:
search_dirs = [
    os.path.join(train_dir, "models"),
    os.environ.get("CELLPOSE_LOCAL_MODELS_PATH",
                    "/data/models/cellpose/"),
]
```

Update `save_model()` (lines 281-288):

```python
# Before:
    # Try to persist to /tmp/models for reuse across runs
    persist_dir = f"/tmp/models/{model_id}"

# After:
    # Try to persist to /data/models for reuse across runs
    persist_dir = f"/data/models/{model_id}"
```

- [ ] **Step 3: Update SLURM_Run_Training.py — bind mount and env override**

In `../biomero-scripts/__workflows/SLURM_Run_Training.py`, update the models bind (around line 401-405):

```python
# Before:
    models_bind = ""
    models_path = ""
    if slurmClient.slurm_models_path:
        models_path = f"{slurmClient.slurm_models_path}/{model_path}"
        models_bind = f"--bind {models_path}:/tmp/models"

# After:
    models_bind = ""
    models_path = ""
    if slurmClient.slurm_models_path:
        models_path = f"{slurmClient.slurm_models_path}/{model_path}"
        models_bind = f"--bind {models_path}:/data/models"
```

Update the mkdir and singularity run command (around line 430-434):

```bash
# Before:
mkdir -p {models_path}/cellpose 2>/dev/null || true
singularity run --nv {data_bind} {models_bind} \\
    --env TRAINING_MODE=true \\
    "{image_path}/{sif_name}" \\

# After:
mkdir -p {models_path}/cellpose 2>/dev/null || true
singularity run --nv {data_bind} {models_bind} \\
    --env TRAINING_MODE=true \\
    --env CELLPOSE_LOCAL_MODELS_PATH=/data/models/cellpose \\
    "{image_path}/{sif_name}" \\
```

- [ ] **Step 4: Commit changes across repos**

```bash
cd ../W_Segmentation-Cellpose4
git add Dockerfile train.py
git commit -m "fix: use /data/models instead of /tmp/models for cellpose model cache

Singularity containers have read-only /tmp. Cellpose uses
CELLPOSE_LOCAL_MODELS_PATH as-is (no subdirectory appended).
Bind mount now targets /data/models which is writable."

cd ../biomero-scripts
git add __workflows/SLURM_Run_Training.py
git commit -m "fix: update model bind mount to /data/models for Singularity compatibility"
```

- [ ] **Step 5: Rebuild and deploy container**

```bash
cd ../W_Segmentation-Cellpose4
docker build --no-cache -t cellpose4-train .
docker save cellpose4-train -o ~/cellpose4-train.tar
docker cp ~/cellpose4-train.tar slurmctld:/data/cellpose4-train.tar
docker exec slurmctld singularity build --force /data/my-scratch/singularity_images/workflows/cellpose4/w_segmentation-cellpose4_latest.sif docker-archive:/data/cellpose4-train.tar
docker exec slurmctld rm /data/cellpose4-train.tar
rm ~/cellpose4-train.tar
```

- [ ] **Step 6: Verify training works**

Run a training job from the UI. Confirm:
- No `PermissionError` on `/tmp/models/cellpose`
- Cellpose starts and trains successfully
- Model is persisted to SLURM models dir

---

### Task 2: Fix Slow Table Listing in omero_annotate_ai (#6)

**Files:**
- Modify: `../omero_annotate_ai/src/omero_annotate_ai/omero/omero_utils.py:21-81` (`list_user_tables`)
- Modify: `../omero_annotate_ai/src/omero_annotate_ai/omero/omero_utils.py:275-313` (`list_annotations_by_namespace`)

- [ ] **Step 1: Fix `list_user_tables()` — add namespace filter and remove get_table()**

Replace the function body in `../omero_annotate_ai/src/omero_annotate_ai/omero/omero_utils.py` lines 21-81:

```python
def list_user_tables(conn, container_type: str = None, container_id: int = None,
                     namespace: str = None) -> List[Dict]:
    """List all OMERO.tables accessible to the user.

    Args:
        conn: OMERO connection
        container_type: Optional container type to filter by ('dataset', 'project', etc.)
        container_id: Optional container ID to filter by
        namespace: Optional namespace to filter by (recommended for performance)

    Returns:
        List of dictionaries with table information
    """
    if conn is None:
        print("Cannot list tables: OMERO connection is None")
        return []

    tables = []

    try:
        if container_type and container_id:
            # Get file annotation IDs — pass namespace for server-side filtering
            annotations = ezomero.get_file_annotation_ids(
                conn, container_type.capitalize(), container_id, ns=namespace
            )

            for ann_id in annotations:
                try:
                    file_ann = conn.getObject("FileAnnotation", ann_id)
                    if not file_ann or not hasattr(file_ann, 'getFile'):
                        continue

                    original_file = file_ann.getFile()
                    if not original_file:
                        continue

                    # Check mimetype to confirm this is an OMERO.table
                    # without loading the table contents
                    mimetype = original_file.getMimetype()
                    if mimetype != "OMERO.tables":
                        continue

                    file_name = original_file.getName() or f"table_{ann_id}"
                    created = ""
                    try:
                        date = file_ann.getDate()
                        if date:
                            created = date.isoformat()
                    except Exception:
                        pass

                    tables.append({
                        'id': ann_id,
                        'name': file_name,
                        'created': created,
                        'container_type': container_type,
                        'container_id': container_id,
                        'description': file_ann.getDescription() or "",
                        'namespace': file_ann.getNs() or ""
                    })
                except Exception:
                    continue
        else:
            print("Tip: Specify container_type and container_id for more efficient search")

    except Exception as e:
        print(f"Error listing tables: {e}")

    return tables
```

- [ ] **Step 2: Fix `list_annotations_by_namespace()` — use ns parameter**

Replace the function body in `../omero_annotate_ai/src/omero_annotate_ai/omero/omero_utils.py` lines 275-313:

```python
def list_annotations_by_namespace(conn, object_type: str, object_id: int,
                                namespace: str) -> List[Dict]:
    """List annotations by namespace.

    Args:
        conn: OMERO connection
        object_type: Type of object ('Image', 'Dataset', etc.)
        object_id: ID of object
        namespace: Namespace to filter by

    Returns:
        List of annotation dictionaries
    """
    annotations = []

    try:
        # Pass namespace for server-side filtering
        ann_ids = ezomero.get_file_annotation_ids(conn, object_type, object_id, ns=namespace)

        for ann_id in ann_ids:
            try:
                file_ann = conn.getObject("FileAnnotation", ann_id)
                if file_ann:
                    annotations.append({
                        'id': ann_id,
                        'namespace': file_ann.getNs(),
                        'description': file_ann.getDescription() or "",
                        'file_name': file_ann.getFile().getName() if file_ann.getFile() else "",
                        'file_size': file_ann.getFile().getSize() if file_ann.getFile() else 0
                    })
            except Exception:
                continue

        print(f"Found {len(annotations)} annotations with namespace '{namespace}'")

    except Exception as e:
        print(f"Error listing annotations: {e}")

    return annotations
```

- [ ] **Step 3: Update callers to pass namespace where known**

Check if any callers of `list_user_tables()` in the `omero_annotate_ai` package or `OMERO.biomero` should pass a namespace. The function signature is backwards-compatible (namespace defaults to None).

Run: `grep -r "list_user_tables" ../omero_annotate_ai/ ../OMERO.biomero/`

For any call site in `annotate_ai_views.py` that lists tracking tables, add the namespace parameter if known.

- [ ] **Step 4: Commit**

```bash
cd ../omero_annotate_ai
git add src/omero_annotate_ai/omero/omero_utils.py
git commit -m "perf: use namespace filtering and mimetype check in table listing

Eliminates N+1 query pattern where get_table() loaded entire table
contents just to check validity. Now uses server-side ns= filter
and OMERO.tables mimetype check instead."
```

---

### Task 3: Remove "New Annotation Set" from Training Tab (#5)

**Files:**
- Modify: `webapp/src/biomero/annotate/components/AnnotationSetPicker.js:15,56`
- Modify: `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js:313-319`

- [ ] **Step 1: Add `showCreateNew` prop to AnnotationSetPicker**

In `webapp/src/biomero/annotate/components/AnnotationSetPicker.js`, add the prop and conditionally render the option:

```jsx
const AnnotationSetPicker = ({
  tables = [],
  selectedTableId,
  onSelectTable,
  onCreateNew,
  loading = false,
  disabled = false,
  showCreateNew = true,
}) => {
```

And change line 56 from:

```jsx
        <option value="__new__">+ New annotation set</option>
```

To:

```jsx
        {showCreateNew && (
          <option value="__new__">+ New annotation set</option>
        )}
```

- [ ] **Step 2: Pass `showCreateNew={false}` in TrainingBiomeroTab**

In `webapp/src/biomero/annotate/components/TrainingBiomeroTab.js`, update the AnnotationSetPicker usage (around line 313):

```jsx
              <AnnotationSetPicker
                tables={annotationSets}
                selectedTableId={selectedAnnotationSet?.id}
                onSelectTable={(table) => setSelectedAnnotationSet(table)}
                onCreateNew={() => {}}
                loading={false}
                showCreateNew={false}
              />
```

- [ ] **Step 3: Build and verify**

```bash
cd webapp && yarn build
```

Open the Training tab, select "Annotate config" data mode, confirm the dropdown no longer shows "+ New annotation set".

- [ ] **Step 4: Commit**

```bash
git add webapp/src/biomero/annotate/components/AnnotationSetPicker.js
git add webapp/src/biomero/annotate/components/TrainingBiomeroTab.js
git commit -m "fix: remove 'new annotation set' option from training tab

Users should create annotation sets in the Configure tab."
```

---

### Task 4: Fix ROI Duplication After Completion (#3)

**Files:**
- Modify: `webapp/src/biomero/annotate/components/AnnotateTab.js:142-146,417-438`

- [ ] **Step 1: Add allDone guard to state and handlers**

In `webapp/src/biomero/annotate/components/AnnotateTab.js`, add a computed `allDone` flag and use it to guard the buttons. After line 111 (after `patchesForImage`), add:

```javascript
  const allDone = units.length > 0 && units.every((u) => u.processed);
```

- [ ] **Step 2: Add early return guard to handleSaveAndNext**

At the top of `handleSaveAndNext` (line 142), add after the existing guard:

```javascript
  const handleSaveAndNext = async () => {
    if (allDone) return;
    if (!selectedUnit || annotations.length === 0) {
```

- [ ] **Step 3: Disable buttons when allDone**

Update the buttons section (around line 418-438). Change the `disabled` prop on "Done (empty)" button (line 422):

```jsx
            disabled={!selectedUnit || saving || allDone}
```

Change the `disabled` prop on "Skip" button (line 429):

```jsx
            disabled={!selectedUnit || saving || allDone}
```

Change the `disabled` prop on "Save & Next" button (line 436):

```jsx
            disabled={!selectedUnit || saving || annotations.length === 0 || allDone}
```

- [ ] **Step 4: Build and verify**

```bash
cd webapp && yarn build
```

- [ ] **Step 5: Commit**

```bash
git add webapp/src/biomero/annotate/components/AnnotateTab.js
git commit -m "fix: disable Save/Skip buttons after all units completed

Prevents duplicate ROI creation when pressing Next after the
completion popup."
```

---

### Task 5: Replace Done/Skip with Popover (#2)

**Files:**
- Modify: `webapp/src/biomero/annotate/components/AnnotateTab.js:1-2,33,417-439`

- [ ] **Step 1: Add popover state and import Popover2/Menu from BlueprintJS**

At the top of `AnnotateTab.js`, update imports (line 2):

```javascript
import { H4, Card, Button, Spinner, Callout, NumericInput, ButtonGroup, Menu, MenuItem, Popover2 } from "@blueprintjs/core";
```

Note: If the project uses `@blueprintjs/popover2`, import from there instead. Check existing imports in the codebase. If `Popover2` is not available, use `Popover` from `@blueprintjs/core`.

Add popover state after the other state declarations (after line 37):

```javascript
  const [skipPopoverOpen, setSkipPopoverOpen] = useState(false);
```

- [ ] **Step 2: Replace the three buttons with two**

Replace the button section (lines 417-439) with:

```jsx
        <div className="flex gap-2">
          <Popover2
            isOpen={skipPopoverOpen}
            onClose={() => setSkipPopoverOpen(false)}
            placement="bottom-end"
            content={
              <Menu>
                <MenuItem
                  icon="arrow-right"
                  text="Skip for now"
                  onClick={() => {
                    setSkipPopoverOpen(false);
                    handleSkipForLater();
                  }}
                />
                <MenuItem
                  icon="disable"
                  text="No labels (done)"
                  onClick={() => {
                    setSkipPopoverOpen(false);
                    handleMarkEmpty();
                  }}
                />
              </Menu>
            }
          >
            <Button
              icon="arrow-right"
              text="Skip"
              rightIcon="caret-down"
              onClick={() => setSkipPopoverOpen(!skipPopoverOpen)}
              disabled={!selectedUnit || saving || allDone}
            />
          </Popover2>
          <Button
            intent="primary"
            icon="floppy-disk"
            text="Save & Next"
            onClick={handleSaveAndNext}
            disabled={!selectedUnit || saving || annotations.length === 0 || allDone}
            loading={saving}
          />
        </div>
```

This removes the "Done (empty)" button entirely. The "Skip" button now opens a popover with two options.

- [ ] **Step 3: Build and verify**

```bash
cd webapp && yarn build
```

Open the Annotate tab. Verify:
- Only "Skip" and "Save & Next" buttons visible
- Clicking "Skip" opens a popover with "Skip for now" and "No labels (done)"
- "Skip for now" moves to next without saving
- "No labels (done)" marks as processed
- Popover closes on outside click

- [ ] **Step 4: Commit**

```bash
git add webapp/src/biomero/annotate/components/AnnotateTab.js
git commit -m "feat: replace Done/Skip buttons with popover menu

Consolidates 'Done (empty)' and 'Skip' into a single Skip button
with a popover offering 'Skip for now' and 'No labels (done)'."
```

---

### Task 6: Grouped Patch Listing in TrackingTableView (#1)

**Files:**
- Modify: `webapp/src/biomero/annotate/components/TrackingTableView.js`

- [ ] **Step 1: Add grouping logic**

In `TrackingTableView.js`, replace the component body. After the `filteredUnits` computation (line 18), add grouping logic:

```javascript
  // Group filtered units by image_id for hierarchical display
  const groupedUnits = (() => {
    const groups = [];
    const groupMap = new Map();

    filteredUnits.forEach((unit) => {
      const key = unit.image_id;
      if (!groupMap.has(key)) {
        const group = {
          image_id: key,
          image_name: unit.image_name,
          units: [],
        };
        groupMap.set(key, group);
        groups.push(group);
      }
      groupMap.get(key).units.push(unit);
    });

    return groups;
  })();
```

- [ ] **Step 2: Replace flat table rows with grouped rendering**

Replace the `<tbody>` section (lines 76-131) with:

```jsx
          <tbody>
            {groupedUnits.map((group) => (
              <React.Fragment key={`group-${group.image_id}`}>
                {/* Image header row */}
                <tr
                  className="cursor-pointer"
                  style={{ background: "transparent" }}
                  onClick={() => {
                    // Navigate to first unit in this group
                    const firstUnit = group.units[0];
                    if (firstUnit) onSelectUnit(firstUnit._originalIndex);
                  }}
                >
                  <td
                    colSpan={4}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      paddingTop: 8,
                      paddingBottom: 4,
                    }}
                    title={group.image_name}
                  >
                    {group.image_name}
                  </td>
                </tr>
                {/* Unit rows (patches or full images) */}
                {group.units.map((unit) => {
                  const actualIndex = unit._originalIndex;
                  const isSelected = actualIndex === selectedIndex;
                  return (
                    <tr
                      key={actualIndex}
                      className={`cursor-pointer ${
                        isSelected ? "bg-blue-100" : ""
                      } ${unit.processed ? "opacity-60" : ""}`}
                      onClick={() => onSelectUnit(actualIndex)}
                    >
                      <td
                        className="text-xs truncate max-w-[120px]"
                        style={{ paddingLeft: unit.is_patch ? 24 : 8 }}
                        title={unit.image_name}
                      >
                        {unit.is_patch ? (
                          <span style={{ color: "#666", fontSize: 10 }}>
                            Patch ({unit.patch_x},{unit.patch_y})
                          </span>
                        ) : (
                          <span style={{ fontSize: 11 }}>Full image</span>
                        )}
                      </td>
                      <td>
                        <Tag
                          minimal
                          small
                          intent={
                            unit.category === "training"
                              ? "primary"
                              : unit.category === "validation"
                                ? "warning"
                                : "none"
                          }
                        >
                          {(unit.category || "train").slice(0, 3)}
                        </Tag>
                      </td>
                      <td className="text-xs">
                        {unit.channel}/{unit.z_slice}/{unit.timepoint}
                      </td>
                      <td>
                        {unit.processed ? (
                          <Icon icon="tick-circle" intent="success" size={14} />
                        ) : (
                          <Icon icon="circle" className="text-gray-300" size={14} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
```

- [ ] **Step 3: Build and verify**

```bash
cd webapp && yarn build
```

Open the Annotate tab with a dataset that has patches. Verify:
- Image names appear as group headers
- Patches are indented below their parent image
- Clicking header selects first patch
- Filter (All/Pending/Done) still works

- [ ] **Step 4: Commit**

```bash
git add webapp/src/biomero/annotate/components/TrackingTableView.js
git commit -m "feat: group patches by image in tracking table sidebar

Image names shown as headers with patches indented below.
Clicking header navigates to first patch."
```

---

### Task 7: Preview Tab Annotation Set Overlay (#4)

**Depends on:** Task 2 (table listing performance)

**Files:**
- Modify: `webapp/src/biomero/annotate/components/PreviewTab.js`
- Modify: `webapp/src/biomero/annotate/components/PreviewViewer.js`

- [ ] **Step 1: Add annotation set selection state to PreviewTab**

In `PreviewTab.js`, add state for selected annotation set (after line 19):

```javascript
  const [selectedAnnotationSet, setSelectedAnnotationSet] = useState(null);
```

- [ ] **Step 2: Make annotation set cards clickable with selection highlight**

Replace the annotation sets display section (lines 116-136) with:

```jsx
                   <div>
                     <h6 style={{ margin: "0 0 8px 0" }}>Annotation Sets</h6>
                     <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                       {annotationSets.map((s) => {
                         const isSelected = selectedAnnotationSet?.id === s.id;
                         return (
                           <div
                             key={s.id}
                             onClick={() =>
                               setSelectedAnnotationSet(isSelected ? null : s)
                             }
                             style={{
                               display: "flex",
                               justifyContent: "space-between",
                               alignItems: "center",
                               padding: "8px 12px",
                               background: isSelected ? "#d1e7ff" : "#f5f5f5",
                               border: isSelected
                                 ? "1px solid #4a90d9"
                                 : "1px solid transparent",
                               borderRadius: 4,
                               fontSize: 13,
                               cursor: "pointer",
                             }}
                           >
                             <span>{s.name || `Set #${s.id}`}</span>
                             {s.description && (
                               <span
                                 style={{ fontSize: 11, color: "#888", marginLeft: 8 }}
                               >
                                 {s.description}
                               </span>
                             )}
                           </div>
                         );
                       })}
                     </div>
                   </div>
```

- [ ] **Step 3: Pass selectedAnnotationSet to PreviewViewer**

In `PreviewTab.js`, update the PreviewViewer props (around line 166):

```jsx
                   <PreviewViewer
                    image={selectedImage}
                    model={selectedModel}
                    channel={selectedChannel}
                    channels={channels}
                    imageMeta={imageMeta}
                    annotationSetId={selectedAnnotationSet?.id}
                 />
```

- [ ] **Step 4: Add annotation set ROI fetching to PreviewViewer**

In `PreviewViewer.js`, add the `annotationSetId` prop to the component signature (line 35-41):

```javascript
const PreviewViewer = ({
  image,
  model,
  channel = 0,
  channels = [],
  imageMeta = { sizeZ: 1, sizeT: 1 },
  annotationSetId = null,
}) => {
```

Import `fetchAnnotateAnnotation` from apiService (line 18-21):

```javascript
import {
  runPredictionPrediction,
  saveAnnotateAnnotation,
  fetchAllImageAnnotations,
  fetchAnnotateAnnotation,
} from "../../../apiService";
```

Add state for annotation set overlays (after `existingRoiVisibility` state, around line 60):

```javascript
  const [annotationSetPolygons, setAnnotationSetPolygons] = useState([]);
```

Add effect to fetch annotation set ROIs when image or set changes:

```javascript
  // Fetch ROIs from selected annotation set
  useEffect(() => {
    setAnnotationSetPolygons([]);
    if (!image || !annotationSetId) return;
    fetchAnnotateAnnotation(image.id, annotationSetId)
      .then((result) => {
        const features = result.features || [];
        const polys = features
          .map((f) => {
            const pts = f.geometry?.coordinates?.[0];
            if (!pts || pts.length < 3) return null;
            return { id: f.id, points: pts };
          })
          .filter(Boolean);
        setAnnotationSetPolygons(polys);
      })
      .catch(() => setAnnotationSetPolygons([]));
  }, [image, annotationSetId]);
```

- [ ] **Step 5: Render annotation set polygons as outlines in the SVG overlay**

Find the SVG overlay section in PreviewViewer.js where existing ROI polygons are rendered (search for `existingAnnotations` rendering). Add a similar block for annotation set polygons, right after or alongside the existing ROI rendering:

```jsx
              {/* Annotation set overlay */}
              {annotationSetPolygons.map((poly, idx) => (
                <polygon
                  key={`annset-${poly.id}`}
                  points={poly.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                  fill="none"
                  stroke={`hsl(${getRoiHue(idx)}, 80%, 60%)`}
                  strokeWidth={2 / zoom}
                  opacity={0.8}
                />
              ))}
```

- [ ] **Step 6: Build and verify**

```bash
cd webapp && yarn build
```

Open the Preview tab. Select a dataset with annotation sets. Verify:
- Annotation sets are listed as clickable cards
- Selecting a set highlights it
- ROI outlines appear on the image for the selected set
- Changing images updates the overlays
- Clicking the selected set again deselects it and removes overlays

- [ ] **Step 7: Commit**

```bash
git add webapp/src/biomero/annotate/components/PreviewTab.js
git add webapp/src/biomero/annotate/components/PreviewViewer.js
git commit -m "feat: show annotation set ROIs as overlays in preview tab

Selecting an annotation set fetches and renders its ROI polygons
as colored outlines on the preview image."
```

---

### Task 8: Custom Model Metadata in Inference Results (#7)

**Files:**
- Modify: `../biomero-scripts/__workflows/SLURM_Run_Workflow.py:760-778`

- [ ] **Step 1: Capture the selected model in run_workflow()**

In `../biomero-scripts/__workflows/SLURM_Run_Workflow.py`, in the `run_workflow()` function (around line 760-768), capture the model selection:

```python
    logger.info(f"Submitting workflow: {name}")
    workflow_version = unwrap(client.getInput(f"{name}_Version"))

    # Capture selected custom model if any
    selected_model = None
    try:
        selected_model = unwrap(client.getInput(f"{name}_Models"))
    except Exception:
        pass  # No model parameter or not set — using default

    # Extract workflow parameters
    kwargs = {}
    for k in workflow_params:
        kwargs[k] = unwrap(client.getInput(f"{name}_|_{k}"))
```

- [ ] **Step 2: Store model info in the workflow tracker metadata**

After the job is successfully submitted (around line 786), log the model info:

```python
            UI_messages += f"Submitted {name} to Slurm\
                as batch job {slurm_job_id}."
            if selected_model:
                UI_messages += f" Using custom model: {selected_model}."
                logger.info(f"Custom model selected: {selected_model}")
```

- [ ] **Step 3: Pass model info through to result import**

This requires tracing how `importResultsToOmero` works and where MapAnnotations are created. The model info needs to be stored as part of the result metadata. Find the result import function and add model_name to its MapAnnotation output.

Search for the import function:

```bash
grep -n "def importResultsToOmero" ../biomero-scripts/__workflows/SLURM_Run_Workflow.py
```

Add the `selected_model` as a parameter and include it in any MapAnnotation created during result import. The exact implementation depends on how `importResultsToOmero` creates annotations — this may require passing it through the call chain.

- [ ] **Step 4: Commit**

```bash
cd ../biomero-scripts
git add __workflows/SLURM_Run_Workflow.py
git commit -m "feat: include custom model name in inference result metadata

When running inference with a custom model, the model identity
is now captured and can be included in result annotations."
```

---

## Deploy All Frontend Changes

After completing Tasks 3-7 (frontend changes):

```bash
cd webapp && yarn build
bash omero-init.sh
```

## Implementation Order Summary

| Order | Task | Issue | Repo | Depends on |
|-------|------|-------|------|------------|
| 1 | Cellpose training fix | #8 | W_Segmentation-Cellpose4, biomero-scripts | — |
| 2 | Table listing perf | #6 | omero_annotate_ai | — |
| 3 | Remove "new set" option | #5 | OMERO.biomero (frontend) | — |
| 4 | ROI duplication fix | #3 | OMERO.biomero (frontend) | — |
| 5 | Skip/Done popover | #2 | OMERO.biomero (frontend) | Task 4 (same file) |
| 6 | Grouped patch listing | #1 | OMERO.biomero (frontend) | — |
| 7 | Preview overlay | #4 | OMERO.biomero (frontend) | Task 2 |
| 8 | Custom model metadata | #7 | biomero-scripts | — |
