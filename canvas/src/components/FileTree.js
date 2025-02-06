import React, { useState, useMemo } from "react";
import { Tree, Icon } from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";

const FileTree = ({
  fetchData,
  initialDataKey,
  dataStructure,
  onExpandCallback,
  onSelectCallback,
}) => {
  const [expandedItems, setExpandedItems] = useState(["root"]);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleNodeExpand = async (nodeData) => {
    const nodeId = nodeData.id;
    if (!expandedItems.includes(nodeId)) {
      setExpandedItems([...expandedItems, nodeId]);
      const node = dataStructure[nodeId];
      if (node?.isFolder && (!node.children || node.children.length === 0)) {
        const newData = await fetchData(node);
        if (onExpandCallback) {
          onExpandCallback(node, newData);
        }
      }
    }
  };

  const handleNodeCollapse = (nodeData) => {
    const nodeId = nodeData.id;
    setExpandedItems(expandedItems.filter((id) => id !== nodeId));
  };

  const handleNodeClick = (nodeData) => {
    const nodeId = nodeData.id;
    let updatedSelection;

    if (selectedItems.includes(nodeId)) {
      // Remove the node if it was already selected
      updatedSelection = selectedItems.filter((id) => id !== nodeId);
    } else {
      // Add the node if it wasn't already selected
      updatedSelection = [...selectedItems, nodeId];
    }

    setSelectedItems(updatedSelection);

    // Ensure the callback reflects the new selection state
    if (onSelectCallback) {
      onSelectCallback(updatedSelection);
    }
  };

  const buildTreeNodes = (itemIndex = initialDataKey) => {
    if (!dataStructure[itemIndex]) return null; // Guard against missing data

    const item = dataStructure[itemIndex];
    const isExpanded = expandedItems.includes(item.index);
    const isSelected = selectedItems.includes(item.index);
    const iconName = item.isFolder
      ? isExpanded
        ? "folder-open"
        : "folder-close"
      : "document";

    // Avoid recursive loops by ensuring children exist and don't point to the same node
    const childNodes =
      item.children?.length > 0
        ? item.children
            .filter((childIndex) => childIndex !== itemIndex) // Avoid circular references
            .map((childIndex) => buildTreeNodes(childIndex))
            .filter((node) => node !== null) // Exclude invalid nodes
        : undefined;

    return {
      id: item.index,
      label: item.data,
      hasCaret: item.isFolder,
      isExpanded,
      isSelected,
      childNodes,
      icon: <Icon icon={iconName} size={18} />,
    };
  };

  const treeNodes = useMemo(() => {
    const rootNode = buildTreeNodes(initialDataKey);
    return rootNode ? [rootNode] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStructure, expandedItems, selectedItems]);

  return (
    <div>
      {treeNodes.length > 0 ? (
        <Tree
          contents={treeNodes}
          onNodeExpand={handleNodeExpand}
          onNodeCollapse={handleNodeCollapse}
          onNodeClick={handleNodeClick}
        />
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
};

export default FileTree;
