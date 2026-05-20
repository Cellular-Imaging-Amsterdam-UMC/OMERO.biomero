import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { fetchAttachments } from "../../apiService";
import { useAppContext } from "../../AppContext";

/**
 * Browse OMERO file annotations (attachments) and select one or more.
 *
 * Props:
 *   formats    {string[]}  File extensions to pre-filter, e.g. ["csv", "parquet"].
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
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState("list");

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadAttachments = useCallback(
    async (searchTerm) => {
      setLoading(true);
      setError(null);
      try {
        const groupId = state.user?.active_group_id ?? null;
        const resp = await fetchAttachments(formats, searchTerm, groupId);
        setAttachments(resp.attachments || []);
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || "Failed to load attachments");
      } finally {
        setLoading(false);
      }
    },
    [formats, state.user?.active_group_id]
  );

  useEffect(() => {
    loadAttachments(debouncedSearch);
  }, [loadAttachments, debouncedSearch]);

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
      const label =
        att.parents.length > 0
          ? `${att.parents[0].type}: ${att.parents[0].name}`
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
        title={att.name}
      >
        <Icon icon="paperclip" size={14} className="text-gray-400 shrink-0" />
        <span className="flex-1 text-sm truncate">{att.name}</span>
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
        formats.length > 0
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
      {/* Search + refresh bar */}
      <div className="flex items-center gap-2">
        <InputGroup
          leftIcon="search"
          placeholder="Search by filename…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
          small
        />
        <Tooltip content="Refresh" placement="top">
          <Button
            minimal
            icon="refresh"
            small
            loading={loading}
            onClick={() => loadAttachments(debouncedSearch)}
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
