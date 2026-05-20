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

  // formats and group are fixed for the lifetime of this instance:
  // formats come from the workflow descriptor (never change in a session),
  // and each param gets its own browser mount.
  const formatsSet = useMemo(
    () => new Set(formats.map((f) => f.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // capture once at mount — formats are descriptor-static
  );
  const groupIdRef = useRef(state.user?.active_group_id ?? null);

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

  // In-memory filters: format (from prop, stable) + search (typed by user)
  const attachments = useMemo(() => {
    let list = allAttachments;
    if (formatsSet.size > 0) {
      list = list.filter((a) => formatsSet.has((a.extension || "").toLowerCase()));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    return list;
  }, [allAttachments, formatsSet, search]);

  const handleSelect = (id) => {
    const isMulti = fileCount !== "single";
    if (isMulti) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      onSelect(next);
    } else {
      onSelect(selectedIds.includes(id) ? [] : [id]);
    }
  };

  // Group attachments by first parent for tree view
  const grouped = useMemo(() => {
    const map = {};
    attachments.forEach((att) => {
      const key =
        att.parents.length > 0
          ? `${att.parents[0].type}-${att.parents[0].id}`
          : "unlinked";
      const p = att.parents[0];
      const label =
        p
          ? `${p.type}: ${p.name} (ID: ${p.id})`
          : "Unlinked";
      if (!map[key]) map[key] = { label, items: [] };
      map[key].items.push(att);
    });
    return Object.values(map);
  }, [attachments]);

  const renderRow = (att) => {
    const selected = selectedIds.includes(att.id);
    return (
      <div
        key={att.id}
        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 ${
          selected ? "bg-blue-50 ring-1 ring-blue-400" : ""
        }`}
        onClick={() => handleSelect(att.id)}
        title={`${att.name} (ID: ${att.id})`}
      >
        <Icon icon="paperclip" size={14} className="text-gray-400 shrink-0" />
        <span className="flex-1 text-sm truncate min-w-0">
          {att.name}
          <span className="text-gray-400 ml-1">(ID: {att.id})</span>
        </span>
        {att.extension && (
          <Tag minimal round className="shrink-0 text-xs">
            {att.extension}
          </Tag>
        )}
        {att.size != null && (
          <span className="text-xs text-gray-400 shrink-0">
            {formatBytes(att.size)}
          </span>
        )}
        {selected && (
          <Icon icon="tick" size={12} className="text-blue-500 shrink-0" />
        )}
      </div>
    );
  };

  const emptyState = (
    <NonIdealState
      icon="document"
      title="No attachments found"
      description={
        search
          ? `No files matching "${search}".`
          : formats.length > 0
          ? `No files with extension ${formats.join(", ")} found in this group.`
          : "No file attachments found in this group."
      }
    />
  );

  const listPanel = (
    <div className="flex flex-col gap-0.5 mt-1 max-h-64 overflow-y-auto">
      {attachments.length === 0 ? emptyState : attachments.map(renderRow)}
    </div>
  );

  const treePanel = (
    <div className="flex flex-col gap-2 mt-1 max-h-64 overflow-y-auto">
      {grouped.length === 0 ? emptyState : grouped.map(({ label, items }) => (
        <div key={label}>
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide py-1 sticky top-0 bg-white">
            <Icon icon="folder-close" size={12} />
            {label}
          </div>
          <div className="pl-4">{items.map(renderRow)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Search bar with inline clear button */}
      <div className="flex items-center gap-2">
        <InputGroup
          leftIcon="search"
          placeholder="Search by filename…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          rightElement={
            search ? (
              <Button
                minimal
                icon="cross"
                small
                onClick={() => setSearch("")}
              />
            ) : undefined
          }
          className="flex-1"
          small
        />
        <Tooltip content="Refresh" placement="top">
          <Button
            minimal
            icon="refresh"
            small
            loading={loading}
            onClick={() => loadAttachments(true)}
          />
        </Tooltip>
      </div>

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

      {/* Selection summary */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-blue-700">
          <Icon icon="tick-circle" size={12} />
          {selectedIds.length === 1
            ? "1 file selected"
            : `${selectedIds.length} files selected`}
          <Button
            minimal
            small
            icon="cross"
            onClick={() => onSelect([])}
            className="ml-1"
          />
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
                By parent
              </span>
            }
            panel={treePanel}
          />
        </Tabs>
      )}
    </div>
  );
};

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default OmeroAttachmentBrowser;
