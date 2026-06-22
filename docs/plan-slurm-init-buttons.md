# Plan: Slurm Init Shortcut Buttons in SettingsForm

## Overview

Add two "Run Slurm Init" buttons to `SettingsForm.js` so admins can trigger the
`Slurm Init (Admin Only)` OMERO script directly after changing settings — without
leaving the settings page and navigating to the Run tab.

This requires a new backend endpoint, a new frontend API function, and two buttons
in the settings form UI.

---

## The Two Buttons

| Button | Label | Intent | `Reset View Tables` | When to use |
|---|---|---|---|---|
| 1 | **Run Slurm Init** | `primary` | `false` | Added models, changed paths/settings — safe, no DB rebuild |
| 2 | **Full Init (Reset DB Views)** | `warning` | `true` | After BIOMERO upgrade or schema change — rebuilds postgres analytics views |

Both buttons:
- Are **hidden entirely** for non-admin users (check `getDjangoConstants().user.isAdmin`)
- Pass the current form's `analytics_rebuild_days_ago` / `analytics_rebuild_start_time`
  values as optional script parameters (so admin can set a window and run init without
  saving config first)
- Are **fire-and-forget**: do not poll for script completion. Show a Blueprint toast on
  start. Direct admin to `Slurm Check Setup` for status.

---

## Script Reference

**Script name (as registered in OMERO):** `Slurm Init (Admin Only)`  
**Source file:** `biomero-scripts/admin/SLURM_Init_environment.py`

OMERO script parameters (passed as `inputs` dict to `svc.runScript`):

| Script param name | OMERO rtype | Notes |
|---|---|---|
| `"Init Slurm"` | `rbool(True)` | Always true |
| `"Reset View Tables"` | `rbool(False\|True)` | `False` = button 1, `True` = button 2 |
| `"Rebuild From Days Ago"` | `rint(N)` | Optional — from Analytics form state |
| `"Rebuild From Date"` | `rstring("YYYY-MM-DD")` | Optional — from Analytics form state, ignored if Days Ago is set |

`"Extra Config file (optional!)"` — omit entirely (leave out of inputs dict).

---

## Implementation Steps

### Step 1 — Backend: new view in `admin_views.py`

Add after the existing `admin_config` view. Follow the exact same decorator pattern.

```python
@login_required()
@require_http_methods(["POST"])
def run_slurm_init(request, conn=None, **kwargs):
    """
    Trigger the 'Slurm Init (Admin Only)' OMERO script.
    Admin-only. Fire-and-forget — returns immediately after launching the script.
    
    POST body (JSON):
      reset_view_tables: bool  — whether to drop+rebuild analytics view tables
      rebuild_days_ago: int|null  — optional rolling window for analytics rebuild
      rebuild_from_date: str|null  — optional absolute date cutoff (YYYY-MM-DD)
    """
    from omero.rtypes import rbool, rint, rstring, unwrap

    try:
        current_user = conn.getUser()
        username = current_user.getName()
        user_id = current_user.getId()
        is_admin = conn.isAdmin()
        if not is_admin:
            logger.error(f"Unauthorized slurm-init request for user {user_id}:{username}")
            return JsonResponse({"error": "Unauthorized request"}, status=403)

        data = json.loads(request.body)
        reset_view_tables = bool(data.get("reset_view_tables", False))
        rebuild_days_ago = data.get("rebuild_days_ago")   # int or None
        rebuild_from_date = data.get("rebuild_from_date")  # str or None

        svc = conn.getScriptService()
        scripts = svc.getScripts()
        script = None
        for s in scripts:
            if unwrap(s.getName()) == "Slurm Init (Admin Only)":
                script = s
                break

        if not script:
            return JsonResponse(
                {"error": "Script 'Slurm Init (Admin Only)' not found on server"},
                status=404
            )

        script_id = int(unwrap(script.id))
        inputs = {
            "Init Slurm": rbool(True),
            "Reset View Tables": rbool(reset_view_tables),
        }
        if rebuild_days_ago is not None:
            try:
                inputs["Rebuild From Days Ago"] = rint(int(rebuild_days_ago))
            except (ValueError, TypeError):
                pass
        if rebuild_from_date:
            inputs["Rebuild From Date"] = rstring(str(rebuild_from_date))

        proc = svc.runScript(script_id, inputs, None)
        job_id = unwrap(proc.getJob().id)
        logger.info(
            f"Slurm Init started by {username} (reset_view_tables={reset_view_tables}), "
            f"job_id={job_id}"
        )
        return JsonResponse({"status": "started", "job_id": job_id})

    except Exception as e:
        logger.error(f"Error running Slurm Init: {str(e)}")
        return JsonResponse({"error": str(e)}, status=500)
```

**Required imports** already present in `admin_views.py`: `json`, `logging`, `JsonResponse`.  
New import needed: `from omero.rtypes import rbool, rint, rstring, unwrap`

---

### Step 2 — Backend: register URL in `urls.py`

Add inside the `# Admin URLs` block, after the existing `admin_config` entry:

```python
path(
    "api/biomero/admin/slurm-init/",
    admin_views.run_slurm_init,
    name="admin_slurm_init",
),
```

---

### Step 3 — Frontend: add URL constant in `constants.js`

In the `urls` object inside `getDjangoConstants()`, add after `api_config`:

```js
api_slurm_init: "/omero_biomero/api/biomero/admin/slurm-init/",
```

---

### Step 4 — Frontend: new API function in `apiService.js`

Add after the existing `postConfig` function:

```js
/**
 * Trigger the 'Slurm Init (Admin Only)' OMERO script.
 * Fire-and-forget — returns {status: "started", job_id: N} immediately.
 */
export const runSlurmInit = async ({
  resetViewTables = false,
  rebuildDaysAgo = null,
  rebuildFromDate = null,
} = {}) => {
  const { urls } = getDjangoConstants();
  const csrfToken = window.csrftoken;
  const payload = {
    reset_view_tables: resetViewTables,
    rebuild_days_ago: rebuildDaysAgo,
    rebuild_from_date: rebuildFromDate,
  };
  return apiRequest(urls.api_slurm_init, "POST", payload, {
    headers: { "X-CSRFToken": csrfToken },
  });
};
```

---

### Step 5 — Frontend: update `SettingsForm.js`

#### 5a. Import `runSlurmInit`

```js
import {
  checkModelVersions,
  clearGitHubCache,
  slugify,
  fetchWorkflowMetadata,
  runSlurmInit,        // ADD
} from "../../apiService";
```

Also import `getDjangoConstants` to check admin status:

```js
import { getDjangoConstants } from "../../constants";  // ADD if not already imported
```

#### 5b. Add state

Add alongside the other state declarations:

```js
const [initLoading, setInitLoading] = useState(false);
const [initResult, setInitResult] = useState(null); // { success: bool, message: string } | null
```

#### 5c. Add handler

Add before the `return (...)`:

```jsx
const handleRunInit = async (resetViewTables) => {
  setInitLoading(true);
  setInitResult(null);
  try {
    const rebuildDaysAgo = settingsForm.ANALYTICS?.analytics_rebuild_days_ago
      ? parseInt(settingsForm.ANALYTICS.analytics_rebuild_days_ago, 10)
      : null;
    const rebuildFromDate = settingsForm.ANALYTICS?.analytics_rebuild_start_time || null;
    await runSlurmInit({ resetViewTables, rebuildDaysAgo, rebuildFromDate });
    setInitResult({
      success: true,
      message: resetViewTables
        ? "Full Slurm Init started (DB views will be rebuilt). Check Slurm Check Setup for status."
        : "Slurm Init started. Check Slurm Check Setup for status.",
    });
  } catch (err) {
    setInitResult({
      success: false,
      message: `Slurm Init failed: ${err?.response?.data?.error || err.message}`,
    });
  } finally {
    setInitLoading(false);
  }
};
```

#### 5d. Add buttons to the JSX

Place **below** the existing Save/Undo `<ButtonGroup>`, inside the same `<Card>`, visible
only to admins. Read `isAdmin` from `getDjangoConstants()` at the top of the render
(or derive it once outside the component and pass it in — keep it simple).

```jsx
{getDjangoConstants().user.isAdmin && (
  <>
    <H5>Run Slurm Init</H5>
    <div className="bp5-form-group">
      <div className="bp5-form-content">
        <div className="bp5-form-helper-text">
          Trigger the Slurm Init script directly. Use <strong>Run Slurm Init</strong> after
          changing settings or adding models. Use <strong>Full Init</strong> only after a
          BIOMERO upgrade — it drops and rebuilds the analytics database views.
          Check <strong>Slurm Check Setup</strong> for status after running.
        </div>
      </div>
    </div>
    <ButtonGroup>
      <Tooltip
        content="Apply new settings and pull new container images. Safe — does not reset analytics data."
        placement="bottom"
      >
        <Button
          icon={initLoading ? <Spinner size={16} /> : "refresh"}
          intent="primary"
          disabled={initLoading}
          onClick={() => handleRunInit(false)}
        >
          Run Slurm Init
        </Button>
      </Tooltip>
      <Tooltip
        content="Full rebuild including postgres view tables. Required after BIOMERO upgrades. Analytics history will be replayed from scratch."
        placement="bottom"
      >
        <Button
          icon={initLoading ? <Spinner size={16} /> : "database"}
          intent="warning"
          disabled={initLoading}
          onClick={() => handleRunInit(true)}
        >
          Full Init (Reset DB Views)
        </Button>
      </Tooltip>
    </ButtonGroup>
    {initResult && (
      <div
        className={`bp5-form-helper-text mt-2 ${
          initResult.success ? "text-green-600" : "text-red-500"
        }`}
      >
        <Icon
          icon={initResult.success ? "tick-circle" : "error"}
          size={11}
          className="mr-1 align-middle"
        />
        {initResult.message}
      </div>
    )}
  </>
)}
```

---

## Style Rules (for the implementing agent)

This file follows strict style constraints — **do not deviate**:

1. **No `style={}` inline props** — use BlueprintJS component props or Tailwind `className` only.
2. **BlueprintJS v5 (`@blueprintjs/core`)** — already imported: `Tag`, `Icon`, `Button`, `ButtonGroup`, `Tooltip`, `Spinner`, `H5`, `H6`, `Switch`, `FormGroup`, `InputGroup`, `Card`. Do not add new imports unless truly necessary.
3. **Tailwind CSS** — only where BlueprintJS doesn't cover it: `font-mono`, `mt-2`, `mr-1`, `align-middle`, `cursor-help`, `text-red-500`, `text-green-600`, `text-gray-600`, `text-orange-500`.
4. **Helper text blocks** — always use `<div className="bp5-form-group"><div className="bp5-form-content"><div className="bp5-form-helper-text">...</div></div></div>` for descriptive text above a section or switch. Never use a bare `<div className="bp5-form-helper-text">` after a switch — description goes **before** the switch.
5. **Section headings** — use `<H6>` for subsections, `<H5>` for major sections. BlueprintJS `H5`/`H6` components only, not raw `<h5>`/`<h6>`.
6. **`RequiresInitTag`** — inline badge placed beside the title text inside `<H6>...<RequiresInitTag /></H6>` or beside a field label in `renderEditableField`. Never on its own line below a heading.
7. **`EnvVarNote`** — use `<EnvVarNote vars={["VAR_NAME"]} />` inside `helperText` of `renderEditableField`. It renders as `<span className="block">` so it inherits helper-text font size.
8. **`ExampleNote`** — use `<ExampleNote>value</ExampleNote>` inside `helperText`. Same sizing rule.
9. **`initResult` feedback** — use `bp5-form-helper-text` class with a Tailwind color modifier (`text-green-600` / `text-red-500`) and a small `Icon` — consistent with the ModelCard green tick pattern.
10. **No new helper components** — reuse existing `EnvVarNote`, `ExampleNote`, `RequiresInitTag`. The init button area does not need any new ones.

---

## Files to Modify

| File | Change |
|---|---|
| `omero_biomero/admin_views.py` | Add `run_slurm_init` view |
| `omero_biomero/urls.py` | Add `api/biomero/admin/slurm-init/` route |
| `webapp/src/constants.js` | Add `api_slurm_init` URL |
| `webapp/src/apiService.js` | Add `runSlurmInit()` export |
| `webapp/src/biomero/components/SettingsForm.js` | Import, state, handler, JSX |

## Files for Reference (read-only)

| File | What to read |
|---|---|
| `omero_biomero/analyzer_views.py` lines 21–145 | Full pattern: find script by name → build inputs → `svc.runScript` |
| `omero_biomero/admin_views.py` lines 1–70 | Admin view decorator pattern, `conn.isAdmin()`, error handling |
| `webapp/src/apiService.js` lines 272–300 | `postConfig` — exact `apiRequest` POST + CSRF pattern to copy |
| `biomero-scripts/admin/SLURM_Init_environment.py` lines 50–115 | Script param names and types |
