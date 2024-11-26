import React, { useState, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { Tree, Icon } from "@blueprintjs/core";
import { fetchFolderData } from "./apiService";
import "@blueprintjs/core/lib/css/blueprint.css";

const FileTree = () => {
  const { state, updateState } = useAppContext();

  const [expandedItems, setExpandedItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const fetchAndUpdateFolderData = async (folderId = null) => {
    try {
      const response = await fetchFolderData(folderId);
      const contents = response.contents || [];

      // Transform the API response into the flat list structure
      const newNodes = contents.reduce((acc, item) => {
        const nodeId = item.id;
        acc[nodeId] = {
          index: nodeId,
          isFolder: item.is_folder,
          children: [],
          data: item.name,
          childCount: 0,
        };
        return acc;
      }, {});

      // Update parent folder's children
      const parentId = folderId || "root";
      const parentNode = {
        ...state.folderData[parentId],
        children: contents.map((item) => item.id), // Link child IDs
        childCount: contents.length,
      };

      // Merge new nodes and parent node into the state
      updateState({
        folderData: {
          ...state.folderData,
          ...newNodes, // Add newly fetched nodes
          [parentId]: parentNode, // Update the parent node
        },
      });
    } catch (error) {
      console.error("Error fetching folder data:", error);
    }
  };

  const buildTreeNodes = (folderId = "root") => {
    const folder = state.folderData[folderId];
    if (!folder) return [];

    return folder.children.map((childId) => {
      const child = state.folderData[childId];
      const isOpen = expandedItems.includes(childId);
      const icon = child.isFolder
        ? isOpen
          ? "folder-open"
          : "folder-close"
        : "document";
      return {
        id: child.index,
        label: child.data,
        hasCaret: child.isFolder,
        isExpanded: expandedItems.includes(child.index),
        isSelected: selectedItems.includes(child.index),
        childNodes: buildTreeNodes(child.index),
        icon: <Icon icon={icon} size={18} />,
      };
    });
  };

  const treeNodes = useMemo(
    () => buildTreeNodes(),
    [state.folderData, expandedItems, selectedItems]
  );

  const handleNodeExpand = async (nodeData) => {
    const nodeId = nodeData.id;

    if (!expandedItems.includes(nodeId)) {
      setExpandedItems([...expandedItems, nodeId]);
      const node = state.folderData[nodeId];
      if (node?.isFolder && (!node.children || node.children.length === 0)) {
        await fetchAndUpdateFolderData(nodeId);
      }
    }
  };

  const handleNodeCollapse = (nodeData) => {
    const nodeId = nodeData.id;
    setExpandedItems(expandedItems.filter((id) => id !== nodeId));
  };

  const handleNodeClick = (nodeData) => {
    const nodeId = nodeData.id;
    if (selectedItems.includes(nodeId)) {
      setSelectedItems(selectedItems.filter((id) => id !== nodeId));
    } else {
      setSelectedItems([...selectedItems, nodeId]);
    }
  };

  return (
    <div className="p-4">
      <Tree
        contents={treeNodes}
        onNodeExpand={handleNodeExpand}
        onNodeCollapse={handleNodeCollapse}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
};

export default FileTree;
