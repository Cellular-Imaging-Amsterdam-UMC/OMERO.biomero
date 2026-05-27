import React, { useState, useEffect, useCallback, useMemo } from "react";
import FileTree from "../../shared/components/FileTree";
import { useAppContext } from "../../AppContext";
import {
  fetchProjectData,
  fetchPlatesData,
  fetchImages,
  fetchPlateImages,
} from "../../apiService";

const MAX_DATASET_IMAGE_PAGES = 100;

const stripSuffix = (label) => String(label || "").replace(/ \u00b7 \d+$/, "");

const normalizeSeedNode = (node) => {
  const category = node?.category || "";
  const isContainer = [
    "root",
    "orphaned",
    "projects",
    "project",
    "datasets",
    "dataset",
    "screens",
    "screen",
    "plates",
    "plate",
    "images",
    "image",
  ].includes(category) || node?.index === "root";

  return {
    ...node,
    data: stripSuffix(node?.data),
    isFolder: isContainer,
    children: Array.isArray(node?.children) ? [...node.children] : [],
    disabled: false,
  };
};

const dedupe = (arr) => Array.from(new Set(arr));

const OmeroAttachmentTreeBrowser = ({
  selectedIds,
  onSelect,
  fileCount,
  allAttachments = [],
}) => {
  const { state } = useAppContext();
  const [localTree, setLocalTree] = useState({});

  const makeStatusNode = (parentKey, type, text) => {
    const isLoading = type === "loading";
    return {
      index: `${parentKey}__${type}`,
      id: `${parentKey}__${type}`,
      category: "status",
      isFolder: false,
      children: [],
      source: "omero",
      disabled: true,
      isStatus: true,
      isLoading,
      iconName: isLoading ? "refresh" : "info-sign",
      data: text,
    };
  };

  // Seed only the top-level OMERO structure. Children are loaded lazily on expand.
  useEffect(() => {
    setLocalTree((prev) => {
      const next = {};
      Object.entries(state.omeroFileTreeData || {}).forEach(([key, node]) => {
        // Preserve previously loaded children when available.
        if (prev[key]?.children?.length > 0) {
          next[key] = { ...prev[key], data: stripSuffix(prev[key].data), disabled: false };
          return;
        }
        next[key] = normalizeSeedNode(node);
      });

      // Preserve previously created lazy nodes (datasets/plates/images/attachments)
      // that are not part of the global seed map.
      Object.entries(prev).forEach(([key, node]) => {
        if (!next[key]) next[key] = { ...node, data: stripSuffix(node.data), disabled: false };
      });

      return next;
    });
  }, [state.omeroFileTreeData, allAttachments]);

  const makeAttachmentNode = (attachment, parentKey) => ({
    index: `attachment-${attachment.id}@${parentKey}`,
    id: attachment.id,
    attachmentId: attachment.id,
    category: "attachment",
    isFolder: false,
    children: [],
    source: "omero",
    data: `${attachment.name} (ID: ${attachment.id})`,
    tooltip: (
      <table className="text-xs border-separate border-spacing-x-2">
        <tbody>
          {[
            ["Annotation ID", attachment.id],
            attachment.file_id != null && ["File ID", attachment.file_id],
            attachment.owner && ["Owner", attachment.owner],
            attachment.linked_by && ["Linked by", attachment.linked_by],
            attachment.date && ["On", attachment.date.slice(0, 10)],
            attachment.description && ["Description", attachment.description],
            attachment.ns && ["Namespace", attachment.ns],
            attachment.mimetype && ["Mimetype", attachment.mimetype],
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
    ),
  });

  const fetchAllDatasetImages = async (datasetId, groupId) => {
    const out = [];
    const seen = new Set();

    for (let page = 1; page <= MAX_DATASET_IMAGE_PAGES; page += 1) {
      const images = await fetchImages(datasetId, page, false, false, groupId);
      if (!images?.length) break;

      let newCount = 0;
      images.forEach((img) => {
        if (img?.id == null || seen.has(img.id)) return;
        seen.add(img.id);
        newCount += 1;
        out.push(img);
      });

      if (newCount === 0) break;
    }

    return out;
  };

  const fetchData = useCallback(async (node) => {
    if (!node?.index) return {};

    const loadingNode = makeStatusNode(node.index, "loading", "Loading...");
    setLocalTree((prev) => ({
      ...prev,
      [loadingNode.index]: loadingNode,
      [node.index]: {
        ...prev[node.index],
        children: [loadingNode.index],
      },
    }));

    const dash = node.index.indexOf("-");
    const nodeType = dash >= 0 ? node.index.slice(0, dash) : node.index;
    const nodeId = dash >= 0 ? parseInt(node.index.slice(dash + 1), 10) : null;

    // project -> datasets
    if (nodeType === "project" && node?.id != null) {
      try {
        const resp = await fetchProjectData(node);
        const datasets = resp?.datasets || [];
        const children = datasets.map((ds) => ({
          index: `dataset-${ds.id}`,
          id: ds.id,
          category: "dataset",
          isFolder: true,
          children: [],
          source: "omero",
          data: `${ds.name || `Dataset ${ds.id}`} (ID: ${ds.id})`,
        }));
        const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
        const childIds = children.map((c) => c.index);
        setLocalTree((prev) => ({
          ...prev,
          ...childMap,
          ...(children.length === 0
            ? { [makeStatusNode(node.index, "empty", "No items found.").index]: makeStatusNode(node.index, "empty", "No items found.") }
            : {}),
          [node.index]: {
            ...prev[node.index],
            children: children.length === 0
              ? [makeStatusNode(node.index, "empty", "No items found.").index]
              : dedupe(childIds),
          },
        }));
        return childMap;
      } catch {
        const emptyNode = makeStatusNode(node.index, "empty", "No items found.");
        setLocalTree((prev) => ({
          ...prev,
          [emptyNode.index]: emptyNode,
          [node.index]: {
            ...prev[node.index],
            children: [emptyNode.index],
          },
        }));
        return {};
      }
    }

    // screen -> plates
    if (nodeType === "screen" && node?.id != null) {
      try {
        const resp = await fetchPlatesData(node);
        const plates = resp?.plates || [];
        const children = plates.map((p) => ({
          index: `plate-${p.id}`,
          id: p.id,
          category: "plate",
          isFolder: true,
          children: [],
          source: "omero",
          data: `${p.name || `Plate ${p.id}`} (ID: ${p.id})`,
        }));
        const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
        const childIds = children.map((c) => c.index);
        setLocalTree((prev) => ({
          ...prev,
          ...childMap,
          ...(children.length === 0
            ? { [makeStatusNode(node.index, "empty", "No items found.").index]: makeStatusNode(node.index, "empty", "No items found.") }
            : {}),
          [node.index]: {
            ...prev[node.index],
            children: children.length === 0
              ? [makeStatusNode(node.index, "empty", "No items found.").index]
              : dedupe(childIds),
          },
        }));
        return childMap;
      } catch {
        const emptyNode = makeStatusNode(node.index, "empty", "No items found.");
        setLocalTree((prev) => ({
          ...prev,
          [emptyNode.index]: emptyNode,
          [node.index]: {
            ...prev[node.index],
            children: [emptyNode.index],
          },
        }));
        return {};
      }
    }

    // dataset/plate -> direct attachments + image nodes
    if ((nodeType === "dataset" || nodeType === "plate") && nodeId != null) {
      try {
        const directAttachments = allAttachments.filter((a) =>
          (a.parents || []).some((p) => p.type.toLowerCase() === nodeType && p.id === nodeId)
        );

        let images = [];
        if (nodeType === "dataset") {
          const groupId = state.user?.active_group_id ?? -1;
          images = await fetchAllDatasetImages(nodeId, groupId);
        } else {
          images = await fetchPlateImages(nodeId);
        }

        const imageNodes = (images || []).map((img) => ({
          index: `image-${img.id}`,
          id: img.id,
          category: "image",
          isFolder: true,
          children: [],
          source: "omero",
          data: `${img.name || `Image ${img.id}`} (ID: ${img.id})`,
        }));

        const attachmentNodes = directAttachments.map((a) =>
          makeAttachmentNode(a, node.index)
        );

        const children = [...attachmentNodes, ...imageNodes];
        const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
        const childIds = children.map((c) => c.index);

        setLocalTree((prev) => ({
          ...prev,
          ...childMap,
          [node.index]: {
            ...prev[node.index],
            children: children.length === 0
              ? [makeStatusNode(node.index, "empty", "No attachments found.").index]
              : dedupe(childIds),
          },
          ...(children.length === 0
            ? { [makeStatusNode(node.index, "empty", "No attachments found.").index]: makeStatusNode(node.index, "empty", "No attachments found.") }
            : {}),
        }));

        return childMap;
      } catch {
        const emptyNode = makeStatusNode(node.index, "empty", "No attachments found.");
        setLocalTree((prev) => ({
          ...prev,
          [emptyNode.index]: emptyNode,
          [node.index]: {
            ...prev[node.index],
            children: [emptyNode.index],
          },
        }));
        return {};
      }
    }

    // image -> direct attachments
    if (nodeType === "image" && nodeId != null) {
      const imageAttachments = allAttachments.filter((a) =>
        (a.parents || []).some((p) => p.type === "Image" && p.id === nodeId)
      );
      const children = imageAttachments.map((a) => makeAttachmentNode(a, node.index));
      const childMap = Object.fromEntries(children.map((c) => [c.index, c]));
      const childIds = children.map((c) => c.index);

      setLocalTree((prev) => ({
        ...prev,
        ...childMap,
        ...(children.length === 0
          ? { [makeStatusNode(node.index, "empty", "No attachments found.").index]: makeStatusNode(node.index, "empty", "No attachments found.") }
          : {}),
        [node.index]: {
          ...prev[node.index],
          children: children.length === 0
            ? [makeStatusNode(node.index, "empty", "No attachments found.").index]
            : dedupe(childIds),
        },
      }));

      return childMap;
    }

    return {};
  }, [allAttachments, state.user?.active_group_id]);

  const handleNodeClick = useCallback((nodeData) => {
    if (!nodeData?.id?.startsWith?.("attachment-")) return;

    const hit = localTree[nodeData.id];
    const id = Number(
      hit?.attachmentId ?? String(nodeData.id).match(/^attachment-(\d+)/)?.[1]
    );
    if (!id || Number.isNaN(id)) return;

    const isMulti = fileCount !== "single";
    if (isMulti) {
      const nextIds = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      onSelect(nextIds);
    } else {
      onSelect(selectedIds.includes(id) ? [] : [id]);
    }
  }, [localTree, selectedIds, onSelect, fileCount]);

  const selectedIndexes = useMemo(
    () => Object.values(localTree)
      .filter((node) => node?.category === "attachment" && selectedIds.includes(node.attachmentId))
      .map((node) => node.index),
    [localTree, selectedIds]
  );

  return (
    <FileTree
      fetchData={fetchData}
      initialDataKey="root"
      dataStructure={localTree}
      onSelectCallback={handleNodeClick}
      selectedItems={selectedIndexes}
      enableStatusNodes
    />
  );
};

export default OmeroAttachmentTreeBrowser;
