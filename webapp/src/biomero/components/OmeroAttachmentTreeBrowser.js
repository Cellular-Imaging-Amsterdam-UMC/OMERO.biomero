/**
 * OmeroAttachmentTreeBrowser
 *
 * "By Parent" tab for OmeroAttachmentBrowser.
 * Reuses the shared FileTree component (same as the importer / image selector)
 * but loads file annotations as leaf nodes instead of images.
 *
 * Tree structure mirrors the existing OMERO hierarchy:
 *   root
 *   └─ project-<id>  (Project: fetches datasets on expand)
 *      └─ dataset-<id>  (Dataset: fetches attachments on expand)
 *         └─ attachment-<id>  (leaf — selectable)
 *   └─ screen-<id>  (Screen: fetches plates on expand)
 *      └─ plate-<id>  (Plate: fetches attachments on expand)
 *
 * Data for projects/screens/datasets/plates is seeded from the global
 * state.omeroFileTreeData (already loaded by the app), so no extra top-level
 * fetch is needed.  Attachments are loaded lazily per node via
 * fetchObjectAnnotations() only when the user opens this tab and expands a node.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import FileTree from "../../shared/components/FileTree";
import { useAppContext } from "../../AppContext";
import {
  fetchProjectData,
  fetchPlatesData,
  fetchImages,
  fetchObjectAnnotations,
} from "../../apiService";

const OmeroAttachmentTreeBrowser = ({
  formatsSet,
  selectedIds,
  onSelect,
  fileCount,
  allAttachments = [],
}) => {
  const { state } = useAppContext();
  const [localTree, setLocalTree] = useState({});

  // Count attachments per parent — filtered by formatsSet so hints match what the user can actually see
  const attachmentCountByParent = useMemo(() => {
    const map = {};
    allAttachments
      .filter((att) => formatsSet.size === 0 || formatsSet.has((att.extension || "").toLowerCase()))
      .forEach((att) => {
        (att.parents || []).forEach((p) => {
          const key = `${p.type.toLowerCase()}-${p.id}`;
          map[key] = (map[key] || 0) + 1;
        });
      });
    return map;
  }, [allAttachments, formatsSet]);

  // Stable refs so fetchData stays a stable reference (empty deps [])
  const allAttachmentsRef = useRef(allAttachments);
  const attachmentCountRef = useRef(attachmentCountByParent);
  const formatsSetRef = useRef(formatsSet);
  const groupIdRef = useRef(state.user?.active_group_id ?? -1);
  useEffect(() => { allAttachmentsRef.current = allAttachments; }, [allAttachments]);
  useEffect(() => { attachmentCountRef.current = attachmentCountByParent; }, [attachmentCountByParent]);
  useEffect(() => { formatsSetRef.current = formatsSet; }, [formatsSet]);
  useEffect(() => { groupIdRef.current = state.user?.active_group_id ?? -1; }, [state.user]);

  // Seed from global tree (projects, screens, datasets, plates)
  useEffect(() => {
    setLocalTree((prev) => {
      const next = { ...prev };
      Object.entries(state.omeroFileTreeData || {}).forEach(([key, node]) => {
        if (next[key]?.children?.length > 0) return; // don't overwrite expanded nodes
        const isContainer =
          node.category === "datasets" ||
          node.category === "plates" ||
          node.category === "dataset" ||
          node.category === "plate" ||
          node.category === "image" ||
          node.category === "images";
        next[key] = isContainer ? { ...node, isFolder: true } : { ...node };
      });
      return next;
    });
  }, [state.omeroFileTreeData]);

  // Once allAttachments loads, annotate unexpanded dataset/plate nodes with counts
  const countsAnnotatedRef = useRef(false);
  useEffect(() => {
    if (!allAttachments.length || countsAnnotatedRef.current) return;
    countsAnnotatedRef.current = true;
    setLocalTree((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, node]) => {
        const cat = node?.category;
        if (!["dataset", "datasets", "plate", "plates"].includes(cat)) return;
        if (node.children?.length > 0) return; // already expanded
        const count = attachmentCountByParent[key] ?? 0;
        next[key] = { ...node, data: `${node.data} \u00b7 ${count}` };
      });
      return next;
    });
  }, [allAttachments, attachmentCountByParent]);

  // Build rich tooltip JSX for an attachment leaf (same layout as list view)
  const buildTooltip = (a) => (
    <table className="text-xs border-separate border-spacing-x-2">
      <tbody>
        {[
          ["Annotation ID", a.id],
          a.file_id != null && ["File ID", a.file_id],
          a.owner && ["Owner", a.owner],
          a.linked_by && ["Linked by", a.linked_by],
          a.date && ["On", a.date.slice(0, 10)],
          a.description && ["Description", a.description],
          a.ns && ["Namespace", a.ns],
          a.mimetype && ["Mimetype", a.mimetype],
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

  const makeAttachmentNode = (a) => ({
    id: a.id,
    category: "attachment",
    index: `attachment-${a.id}`,
    isFolder: false,
    children: [],
    data: `${a.name} (ID: ${a.id})`,
    source: "omero",
    extension: a.extension,
    size: a.size,
    tooltip: buildTooltip(a),
  });

  /**
   * Called by FileTree when a folder node is expanded for the first time.
   * Handles four node types:
   *   project / screen → load datasets / plates
   *   dataset / plate  → load direct attachments + (dataset) image sub-nodes
   *   image            → load attachments from allAttachments (no API call)
   */
  const fetchData = useCallback(async (node) => {
    const dashIdx = node.index.indexOf("-");
    const nodeType = dashIdx >= 0 ? node.index.slice(0, dashIdx) : node.index;
    const nodeId = dashIdx >= 0 ? parseInt(node.index.slice(dashIdx + 1)) : null;
    const curFormats = formatsSetRef.current;
    const curAll = allAttachmentsRef.current;
    const curCounts = attachmentCountRef.current;
    const groupId = groupIdRef.current;
    const countSuffix = (key) => { const n = curCounts[key]; return n > 0 ? ` \u00b7 ${n}` : (curAll.length > 0 ? " \u00b7 0" : ""); };

    // ── Project / Screen → datasets / plates ─────────────────────────────────
    if (nodeType === "project" || nodeType === "screen") {
      let children = [];
      try {
        if (nodeType === "screen") {
          const resp = await fetchPlatesData(node);
          children = (resp.plates || []).map((p) => ({
            id: p.id,
            category: "plate",
            index: `plate-${p.id}`,
            isFolder: true,
            children: [],
            data: `${p.name} (ID: ${p.id})${countSuffix(`plate-${p.id}`)}`,
            source: "omero",
          }));
        } else {
          const resp = await fetchProjectData(node);
          children = (resp.datasets || []).map((ds) => ({
            id: ds.id,
            category: "dataset",
            index: `dataset-${ds.id}`,
            isFolder: true,
            children: [],
            data: `${ds.name} (ID: ${ds.id})${countSuffix(`dataset-${ds.id}`)}`,
            source: "omero",
          }));
        }
      } catch {
        children = [];
      }
      const childIndices = children.map((c) => c.index);
      const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
      setLocalTree((prev) => ({
        ...prev,
        ...childMap,
        [node.index]: { ...prev[node.index], children: childIndices },
      }));
      return childMap;
    }

    // ── Dataset / Plate → direct attachments + (dataset) image sub-nodes ─────
    if ((nodeType === "dataset" || nodeType === "plate") && nodeId != null) {
      const objType = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
      let directAnns = [];
      let imageChildren = [];

      try {
        const resp = await fetchObjectAnnotations(objType, nodeId);
        directAnns = (resp.annotations || []).filter(
          (a) => curFormats.size === 0 || curFormats.has((a.extension || "").toLowerCase())
        );
      } catch { /* leave empty */ }

      // Datasets: add image sub-nodes for images that have attachments
      if (nodeType === "dataset") {
        try {
          const images = await fetchImages(nodeId, 1, false, false, groupId);
          const imageIdSet = new Set(images.map((img) => img.id));
          const imagesWithAttachments = new Set(
            curAll.flatMap((att) =>
              (att.parents || [])
                .filter((p) => p.type === "Image" && imageIdSet.has(p.id))
                .map((p) => p.id)
            )
          );
          imageChildren = images
            .filter((img) => imagesWithAttachments.has(img.id))
            .map((img) => ({
              id: img.id,
              category: "image",
              index: `image-${img.id}`,
              isFolder: true,
              children: [],
              data: `${img.name} (ID: ${img.id})${countSuffix(`image-${img.id}`)}`,
              source: "omero",
            }));
        } catch { /* no image children */ }
      }

      const children = [...directAnns.map(makeAttachmentNode), ...imageChildren];
      const childIndices = children.map((c) => c.index);
      const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
      setLocalTree((prev) => ({
        ...prev,
        ...childMap,
        [node.index]: { ...prev[node.index], children: childIndices },
      }));
      return childMap;
    }

    // ── Image → file annotations from allAttachments (no extra API call) ──────
    if (nodeType === "image" && nodeId != null) {
      const anns = curAll.filter(
        (a) =>
          (a.parents || []).some((p) => p.type === "Image" && p.id === nodeId) &&
          (curFormats.size === 0 || curFormats.has((a.extension || "").toLowerCase()))
      );
      const children = anns.map(makeAttachmentNode);
      const childIndices = children.map((c) => c.index);
      const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
      setLocalTree((prev) => ({
        ...prev,
        ...childMap,
        [node.index]: { ...prev[node.index], children: childIndices },
      }));
      return childMap;
    }

    return {};
  }, []); // stable — uses refs for all mutable data

  // FileTree calls onSelectCallback(nodeData, coords, e) on node click.
  // We only act on attachment leaves.
  const handleNodeClick = useCallback(
    (nodeData) => {
      if (!nodeData?.id?.startsWith?.("attachment-")) return;
      const id = parseInt(nodeData.id.slice("attachment-".length));
      if (isNaN(id)) return;

      const isMulti = fileCount !== "single";
      if (isMulti) {
        const next = selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id];
        onSelect(next);
      } else {
        onSelect(selectedIds.includes(id) ? [] : [id]);
      }
    },
    [selectedIds, onSelect, fileCount]
  );

  // FileTree expects selectedItems as an array of index strings
  const selectedIndexes = selectedIds.map((id) => `attachment-${id}`);

  return (
    <FileTree
      fetchData={fetchData}
      initialDataKey="root"
      dataStructure={localTree}
      onSelectCallback={handleNodeClick}
      selectedItems={selectedIndexes}
    />
  );
};

export default OmeroAttachmentTreeBrowser;
