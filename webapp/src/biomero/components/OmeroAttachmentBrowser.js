import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  InputGroup,
  Button,
  Icon,
  Spinner,
  Tag,
  Tabs,
  Tab,
  NonIdealState,
  Tooltip,
} from "@blueprintjs/core";
import { fetchAttachments, invalidateAttachmentsCache } from "../../apiService";
import { useAppContext } from "../../AppContext";
import OmeroAttachmentTreeBrowser from "./OmeroAttachmentTreeBrowser";

/**
 * Browse OMERO file annotations (attachments) and select one or more.
 *
 * Props:
 *   formats    {string[]}  File extensions to pre-filter server-side, e.g. ["csv", "parquet"].
 *                          Empty means no filter.
 *   fileCount  {"single"|"multiple"|null}
 *                          "single" = only one attachment can be selected at a time.
 *                          "multiple" or null = multi-select.
 *   selectedIds {number[]} Currently selected annotation IDs (controlled).
 *   onSelect   {(ids: number[]) => void}  Called with updated selection.
 */

/**
 * Walk the OMERO tree to include ancestor nodes in the context filter.
 * E.g. selecting Plate:452 also adds Screen:X so screen-level files are visible.
 */
function buildContextWithAncestors(treeData, dataType, ids) {
  if (!dataType || !ids?.length) return [];
  // Reverse-parent map: childIndex → parent node
  const parentOf = {};
  Object.values(treeData || {}).forEach((node) => {
    (node.children || []).forEach((childIdx) => {
      parentOf[childIdx] = node;
    });
  });
  const seen = new Set();
  const contexts = [];
  const addCtx = (type, cid, name) => {
    const k = `${type}-${cid}`;
    if (seen.has(k)) return;
    seen.add(k);
    contexts.push(name != null ? { type, id: cid, name } : { type, id: cid });
  };
  for (const rawId of ids) {
    const id = parseInt(rawId, 10);
    addCtx(dataType, id, undefined);
    // Walk up the tree to include ancestor objects
    let idx = `${dataType.toLowerCase()}-${id}`;
    while (parentOf[idx]) {
      const pNode = parentOf[idx];
      const pCat = pNode.category || "";
      // Skip virtual container categories (datasets, plates, images, wells)
      if (!["datasets", "plates", "images", "wells"].includes(pCat) && pNode.id != null) {
        const pType = pCat.charAt(0).toUpperCase() + pCat.slice(1);
        const nameMatch = typeof pNode.data === "string" ? pNode.data.match(/^(.+?)\s*\(ID:/) : null;
        addCtx(pType, pNode.id, nameMatch ? nameMatch[1].trim() : pNode.data);
      }
      idx = pNode.index || "";
    }
  }
  return contexts;
}

const OmeroAttachmentBrowser = ({
  formats = [],
  fileCount = null,
  selectedIds = [],
  onSelect,
}) => {
  const { state } = useAppContext();
  // All attachments from the server (filtered by format+group, not by search)
  const [allAttachments, setAllAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [colCount, setColCount] = useState(2);

  // Derive "dialog 1" context (which OMERO objects the user is working with)
  // once at mount. Used to pre-filter attachments to parents already in scope.
  const dialogContextRef = useRef(null);
  if (dialogContextRef.current === null) {
    const dataType = state.formData?.Data_Type;
    const ids = state.formData?.IDs;
    dialogContextRef.current = buildContextWithAncestors(
      state.omeroFileTreeData,
      dataType,
      ids
    );
  }
  const dialogContext = dialogContextRef.current; // stable — set once at mount

  // User-controlled context filter — starts from dialogContext, can be cleared/restored.
  const [activeContextFilters, setActiveContextFilters] = useState(
    () => dialogContextRef.current || []
  );

  // formats and group are fixed for the lifetime of this instance:
  // formats come from the workflow descriptor (never change in a session),
  // and each param gets its own browser mount.
  const formatsSet = useMemo(
    () => new Set(formats.map((f) => f.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // capture once at mount — formats are descriptor-static
  );
  const groupIdRef = useRef(state.user?.active_group_id ?? null);

  // Name lookup built from loaded attachments so chips show "Dataset: My_Results"
  // rather than just "Dataset #54" before or while data loads.
  const parentNameLookup = useMemo(() => {
    const map = {};
    allAttachments.forEach((att) => {
      (att.parents || []).forEach((p) => {
        map[`${p.type}-${p.id}`] = p.name;
      });
    });
    return map;
  }, [allAttachments]);

  const loadAttachments = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceRefresh) invalidateAttachmentsCache(groupIdRef.current);
      const resp = await fetchAttachments(groupIdRef.current);
      setAllAttachments(resp.attachments || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to load attachments");
    } finally {
      setLoading(false);
    }
  }, []); // stable — fetchAttachments handles caching

  // Fetch once on mount.
  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  // Auto-clear the initial context filter on first load if it produces zero results.
  // This saves the user from a dead-end empty state they can't escape without knowing
  // the "Clear context filter" button exists.
  const autoFilterClearedRef = useRef(false);
  useEffect(() => {
    if (autoFilterClearedRef.current || !allAttachments.length) return;
    autoFilterClearedRef.current = true;
    const omeroFilters = activeContextFilters.filter((f) => f.type !== "search");
    if (!omeroFilters.length) return;
    const ctxSet = new Set(omeroFilters.map((f) => `${f.type}-${f.id}`));
    const hasMatch = allAttachments.some((a) =>
      (a.parents || []).some((p) => ctxSet.has(`${p.type}-${p.id}`))
    );
    if (!hasMatch) setActiveContextFilters([]);
  }, [allAttachments]); // eslint-disable-line react-hooks/exhaustive-deps

  // In-memory filters: format (prop, stable) + OMERO parent filters + pinned text filters + live search
  const attachments = useMemo(() => {
    let list = allAttachments;
    if (formatsSet.size > 0) {
      list = list.filter((a) => formatsSet.has((a.extension || "").toLowerCase()));
    }
    // OMERO parent filters: attachment must belong to at least one listed parent (OR)
    const omeroFilters = activeContextFilters.filter((f) => f.type !== "search");
    if (omeroFilters.length > 0) {
      const ctxSet = new Set(omeroFilters.map((f) => `${f.type}-${f.id}`));
      list = list.filter((a) =>
        (a.parents || []).some((p) => ctxSet.has(`${p.type}-${p.id}`))
      );
    }
    // Pinned text filters: every term must match the filename (AND — "search within search")
    activeContextFilters
      .filter((f) => f.type === "search")
      .forEach(({ term }) => {
        const t = term.toLowerCase();
        list = list.filter((a) => a.name.toLowerCase().includes(t));
      });
    // Live (uncommitted) search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return list;
  }, [allAttachments, formatsSet, activeContextFilters, search]);

  const handleSelect = (id) => {
    const isMulti = fileCount !== "single";
    let nextIds;
    if (isMulti) {
      nextIds = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
    } else {
      nextIds = selectedIds.includes(id) ? [] : [id];
    }
    const metas = allAttachments
      .filter((a) => nextIds.includes(a.id))
      .map((a) => ({ id: a.id, name: a.name }));
    onSelect(nextIds, metas);
  };

  const selectedAttachments = useMemo(
    () => allAttachments.filter((a) => selectedIds.includes(a.id)),
    [allAttachments, selectedIds]
  );

  // Group by parent is handled by OmeroAttachmentTreeBrowser
  // For list view, group attachments by their first parent so users can tell where
  // a file lives (e.g. "model.zip attached to my_training_dataset").
  const grouped = useMemo(() => {
    // Sort items before grouping so ordering is consistent within each group
    const sorted = [...attachments];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "");
      else if (sortBy === "date") cmp = (a.date || "").localeCompare(b.date || "");
      else if (sortBy === "size") cmp = (a.size || 0) - (b.size || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    const map = new Map();
    sorted.forEach((att) => {
      const p = att.parents && att.parents.length > 0 ? att.parents[0] : null;
      const key = p ? `${p.type}-${p.id}` : "__unlinked__";
      if (!map.has(key)) {
        map.set(key, { parent: p, items: [] });
      }
      map.get(key).items.push(att);
    });
    // Sort: linked groups first (alphabetical by parent name), unlinked last
    const entries = [...map.values()];
    entries.sort((a, b) => {
      if (!a.parent && b.parent) return 1;
      if (a.parent && !b.parent) return -1;
      if (!a.parent && !b.parent) return 0;
      return `${a.parent.type} ${a.parent.name}`.localeCompare(
        `${b.parent.type} ${b.parent.name}`
      );
    });
    return entries;
  }, [attachments, sortBy, sortDir]);

  // Map colCount (1-4) to Tailwind grid class — all four strings must be spelled out for JIT
  const gridColsClass = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[colCount];

  const renderCard = (att) => {
    const selected = selectedIds.includes(att.id);
    const extraParents =
      att.parents?.length > 1
        ? att.parents.slice(1).map((p) => `${p.type}: ${p.name} (ID: ${p.id})`).join(", ")
        : null;
    const tooltipContent = (
      <table className="text-xs border-separate border-spacing-x-2">
        <tbody>
          {[
            ["File", att.name],
            ["Annotation ID", att.id],
            att.file_id != null && ["File ID", att.file_id],
            att.owner && ["Owner", att.owner],
            att.linked_by && ["Linked by", att.linked_by],
            att.date && ["On", att.date.slice(0, 10)],
            att.description && ["Description", att.description],
            att.ns && ["Namespace", att.ns],
            att.mimetype && ["Mimetype", att.mimetype],
            extraParents && ["Also in", extraParents],
          ]
            .filter(Boolean)
            .map(([label, value]) => (
              <tr key={label}>
                <td className="text-blue-200 whitespace-nowrap align-top">{label}</td>
                <td className="opacity-90 max-w-[220px] break-words pl-2">{String(value)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    );
    return (
      <Tooltip key={att.id} content={tooltipContent} placement="right" hoverOpenDelay={350}>
        <div
          className={`rounded border px-2 py-1.5 cursor-pointer transition-colors ${
            selected
              ? "bg-blue-50 border-blue-400 ring-1 ring-blue-300"
              : "border-gray-100 hover:border-blue-200 hover:bg-gray-50"
          }`}
          onClick={() => handleSelect(att.id)}
        >
          {/* row 1: icon + truncated name + tick */}
          <div className="flex items-center gap-1.5 min-w-0 mb-0.5">
            <Icon icon={getFileIcon(att.extension)} size={12} className="text-gray-400 shrink-0" />
            <span className="text-xs truncate flex-1 min-w-0">{att.name}</span>
            {selected && <Icon icon="tick-circle" size={11} className="text-blue-500 shrink-0" />}
          </div>
          {/* row 2: date + size */}
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-gray-400">
              {att.date ? att.date.slice(0, 10) : ""}
            </span>
            <span className="text-xs text-gray-400 tabular-nums">
              {att.size != null ? formatBytes(att.size) : ""}
            </span>
          </div>
        </div>
      </Tooltip>
    );
  };

  const emptyState = (
    <NonIdealState
      icon="document"
      title="No attachments found"
      description={
        activeContextFilters.length > 0
          ? "Nothing matched in the current context. Try removing a filter."
          : search
          ? `No files matching "${search}".`
          : formats.length > 0
          ? `No files with extension ${formats.join(", ")} found in this group.`
          : "No file attachments found in this group."
      }
      action={
        activeContextFilters.length > 0 ? (
          <Button
            small
            text="Show all attachments"
            onClick={() => setActiveContextFilters([])}
          />
        ) : undefined
      }
    />
  );

  const listPanel = (
    <div className="flex flex-col gap-0 mt-1 max-h-64 overflow-y-auto">
      {attachments.length === 0
        ? emptyState
        : grouped.map(({ parent, items }) => {
            const groupKey = parent
              ? `${parent.type}-${parent.id}`
              : "__unlinked__";
            const groupLabel = parent
              ? `${parent.type}: ${parent.name} (ID: ${parent.id})`
              : "Unlinked";
            const groupIcon = parent
              ? parent.type === "Project"
                ? "projects"
                : parent.type === "Dataset"
                ? "database"
                : parent.type === "Plate"
                ? "grid-view"
                : parent.type === "Screen"
                ? "layers"
                : parent.type === "Image"
                ? "media"
                : "folder-close"
              : "ungroup-objects";
            return (
              <div key={groupKey}>
                <button
                  type="button"
                  className="flex items-center gap-1 px-1 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide sticky top-0 z-10 bg-white border-b border-gray-100 w-full text-left hover:bg-gray-50"
                  onClick={() =>
                    setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(groupKey)) next.delete(groupKey);
                      else next.add(groupKey);
                      return next;
                    })
                  }
                >
                  <Icon icon={groupIcon} size={11} className="shrink-0" />
                  <span className="truncate">{groupLabel}</span>
                  <span className="ml-auto font-normal normal-case text-gray-400 flex items-center gap-1">
                    {items.length}
                    <Icon icon={collapsedGroups.has(groupKey) ? "chevron-right" : "chevron-down"} size={10} />
                  </span>
                </button>
                {!collapsedGroups.has(groupKey) && (
                  <div className={`grid ${gridColsClass} gap-1.5 p-1`}>{items.map(renderCard)}</div>
                )}
              </div>
            );
          })}
    </div>
  );

  const treePanel = (
    <div className="mt-1">
      <div className="flex justify-end pb-0.5 mb-1">
        <Tooltip content="Refresh" placement="left">
          <Button minimal icon="refresh" small loading={loading} onClick={() => loadAttachments(true)} />
        </Tooltip>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <OmeroAttachmentTreeBrowser
          formatsSet={formatsSet}
          selectedIds={selectedIds}
          onSelect={(ids) => {
              const metas = allAttachments
                .filter((a) => ids.includes(a.id))
                .map((a) => ({ id: a.id, name: a.name }));
              onSelect(ids, metas);
            }}
          fileCount={fileCount}
          allAttachments={allAttachments}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Context filter chips — shown when dialog 1 provided a data context */}
      {dialogContext.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {activeContextFilters.length > 0 ? (
            <>
              <span className="text-gray-400 shrink-0">Context:</span>
              {(showAllFilters
                ? activeContextFilters
                : activeContextFilters.slice(0, 5)
              ).map((f) => {
                const isSearch = f.type === "search";
                const key = isSearch ? `search-${f.term}` : `${f.type}-${f.id}`;
                const label = isSearch
                  ? `"${f.term}"`
                  : (() => { const n = parentNameLookup[`${f.type}-${f.id}`] || f.name; return n ? `${f.type}: ${n}` : `${f.type} #${f.id}`; })();
                const icon = isSearch ? "search"
                  : f.type === "Project" ? "projects"
                  : f.type === "Dataset" ? "database"
                  : f.type === "Plate" ? "grid-view"
                  : f.type === "Screen" ? "layers"
                  : f.type === "Image" ? "media"
                  : "folder-close";
                return (
                  <Tag
                    key={key}
                    minimal
                    icon={icon}
                    onRemove={() =>
                      isSearch
                        ? setActiveContextFilters((prev) => prev.filter((x) => !(x.type === "search" && x.term === f.term)))
                        : setActiveContextFilters((prev) => prev.filter((x) => !(x.type === f.type && x.id === f.id)))
                    }
                  >
                    {label}
                  </Tag>
                );
              })}
              {!showAllFilters && activeContextFilters.length > 5 && (
                <Tag
                  minimal
                  interactive
                  onClick={() => setShowAllFilters(true)}
                >
                  +{activeContextFilters.length - 5} more…
                </Tag>
              )}
              <Button
                minimal
                small
                text="Clear context filter"
                onClick={() => setActiveContextFilters([])}
              />
            </>
          ) : (
            <>
              <span className="text-gray-400">Showing all attachments.</span>
              <Button
                minimal
                small
                icon="filter"
                text="Restore context filter"
                onClick={() => {
                  setActiveContextFilters(dialogContext);
                  setShowAllFilters(false);
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Search bar + sort + column selector — list mode only */}
      {viewMode === "list" && (
        <>
          <div className="flex items-center gap-2">
            <InputGroup
              leftIcon="search"
              placeholder="Search… (Enter to pin as filter)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  const term = search.trim();
                  setActiveContextFilters((prev) =>
                    prev.some((x) => x.type === "search" && x.term === term)
                      ? prev
                      : [...prev, { type: "search", term }]
                  );
                  setSearch("");
                  e.preventDefault();
                }
              }}
              rightElement={
                search ? (
                  <Button minimal icon="cross" small onClick={() => setSearch("")} />
                ) : undefined
              }
              className="flex-1"
              small
            />
            <Tooltip content="Refresh" placement="top">
              <Button minimal icon="refresh" small loading={loading} onClick={() => loadAttachments(true)} />
            </Tooltip>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400 shrink-0">Sort:</span>
            {[["name", "Name"], ["date", "Date"], ["size", "Size"]].map(([field, label]) => (
              <Button
                key={field}
                minimal
                small
                active={sortBy === field}
                text={sortBy === field ? `${label} ${sortDir === "asc" ? "↑" : "↓"}` : label}
                onClick={() => {
                  if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                  else { setSortBy(field); setSortDir("asc"); }
                }}
              />
            ))}
            <span className="text-gray-200 mx-1 shrink-0">|</span>
            <span className="text-xs text-gray-400 shrink-0">Cols:</span>
            {[1, 2, 3, 4].map((n) => (
              <Button key={n} minimal small active={colCount === n} text={String(n)} onClick={() => setColCount(n)} />
            ))}
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1 text-red-600 text-sm">
          <Icon icon="error" size={14} />
          {error}
        </div>
      )}

      {/* Format hint */}
      {formats.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-500">Accepted formats:</span>
          {formats.map((f) => (
            <Tag key={f} minimal round className="text-xs">
              {f}
            </Tag>
          ))}
        </div>
      )}

      {/* Selection summary — show actual filenames as removable tags */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedAttachments.map((att) => {
            const extraParents =
              att.parents?.length > 1
                ? att.parents.slice(1).map((p) => `${p.type}: ${p.name} (ID: ${p.id})`).join(", ")
                : null;
            const ttContent = (
              <table className="text-xs border-separate border-spacing-x-2">
                <tbody>
                  {[
                    ["File", att.name],
                    ["Annotation ID", att.id],
                    att.file_id != null && ["File ID", att.file_id],
                    att.owner && ["Owner", att.owner],
                    att.linked_by && ["Linked by", att.linked_by],
                    att.date && ["On", att.date.slice(0, 10)],
                    att.description && ["Description", att.description],
                    att.ns && ["Namespace", att.ns],
                    att.mimetype && ["Mimetype", att.mimetype],
                    extraParents && ["Also in", extraParents],
                  ]
                    .filter(Boolean)
                    .map(([label, value]) => (
                      <tr key={label}>
                        <td className="text-blue-200 whitespace-nowrap align-top">{label}</td>
                        <td className="opacity-90 max-w-[220px] break-words pl-2">{String(value)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            );
            return (
              <Tooltip
                key={att.id}
                content={ttContent}
                placement="top"
                hoverOpenDelay={300}
              >
                <Tag
                  intent="primary"
                  minimal
                  icon="tick-circle"
                  onRemove={() => {
                    const nextIds = selectedIds.filter((id) => id !== att.id);
                    const metas = allAttachments
                      .filter((a) => nextIds.includes(a.id))
                      .map((a) => ({ id: a.id, name: a.name }));
                    onSelect(nextIds, metas);
                  }}
                >
                  <span className="max-w-[180px] truncate inline-block align-bottom text-xs leading-none">
                    {att.name}
                  </span>
                </Tag>
              </Tooltip>
            );
          })}
          {selectedIds.length > 1 && (
            <Button minimal small icon="cross" onClick={() => onSelect([], [])} title="Clear all" />
          )}
        </div>
      )}

      {/* Content — spinner or tabs */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size={20} />
        </div>
      ) : (
        <Tabs
          id="omero-attachment-browser-tabs"
          selectedTabId={viewMode}
          onChange={(id) => setViewMode(id)}
          renderActiveTabPanelOnly
        >
          <Tab
            id="list"
            title={
              <span className="flex items-center gap-1">
                <Icon icon="list" size={12} />
                List
              </span>
            }
            panel={listPanel}
          />
          <Tab
            id="tree"
            title={
              <span className="flex items-center gap-1">
                <Icon icon="diagram-tree" size={12} />
                Tree
              </span>
            }
            panel={treePanel}
          />
        </Tabs>
      )}
    </div>
  );
};

function getFileIcon(extension) {
  const ext = (extension || "").toLowerCase();
  if (["csv", "tsv", "xlsx", "xls", "ods"].includes(ext)) return "th";
  if (["png", "jpg", "jpeg", "tif", "tiff", "bmp", "gif", "svg"].includes(ext)) return "media";
  if (["zip", "tar", "gz", "bz2", "7z", "rar"].includes(ext)) return "box";
  if (["h5", "hdf5", "zarr", "db", "sqlite"].includes(ext)) return "database";
  if (["txt", "log", "md", "rst"].includes(ext)) return "document";
  if (["json", "xml", "yaml", "yml", "toml", "ini", "cfg"].includes(ext)) return "code";
  if (["py", "js", "ts", "sh", "r", "m"].includes(ext)) return "code";
  if (["pdf"].includes(ext)) return "book";
  if (["pt", "pth", "pkl", "npy", "npz", "onnx", "weights", "model"].includes(ext)) return "cube";
  return "paperclip";
}

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default OmeroAttachmentBrowser;
