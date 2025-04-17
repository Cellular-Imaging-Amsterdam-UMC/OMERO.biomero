import React, { useState, useMemo } from "react";
import { Tree, Icon, ContextMenu, Menu, MenuItem } from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import { iconMeta } from "../../constants";

const FileTree = ({
  fetchData,
  initialDataKey,
  dataStructure,
  onExpandCallback,
  onSelectCallback,
  selectedItems,
}) => {
  const [expandedItems, setExpandedItems] = useState(["root"]);

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

  const buildTreeNodes = (itemIndex = initialDataKey) => {
    if (!dataStructure[itemIndex]) return null; // Guard against missing data

    const item = dataStructure[itemIndex];
    const isExpanded = expandedItems.includes(item.index);
    const isSelected = selectedItems.includes(item.index);

    const isOmeroItem = "source" in item && item.source === "omero";
    if (isOmeroItem) {
      item.category = item.category || "dataset";
    }

    const initialIconName =
      iconMeta[item.category]?.icon || isOmeroItem ? "folder-close" : "media";

    const iconName = item.isFolder
      ? isExpanded
        ? "folder-open"
        : "folder-close"
      : initialIconName;

    // Remove final 's' from category name for iconMeta lookup
    const category = item.category
      ? item.category.replace(/s$/, "")
      : isOmeroItem
      ? "image"
      : "folder";

    const iconMetaData = iconMeta[category] || {};

    const contextMaenuDisabled =
      !item.isFolder || !expandedItems.includes(item.index);

    const itemLabel = isOmeroItem ? (
      <span className="text-sm relative top-[2px]">{item.data}</span>
    ) : (
      <div className="relative">
        <ContextMenu
          id={item.index}
          content={
            <Menu>
              <MenuItem
                disabled={contextMaenuDisabled}
                className="text-sm"
                text="Select all children"
                onClick={() => {
                  const allChildren = item.children || [];
                  console.log(item);
                  onSelectCallback(allChildren, "local");
                }}
              />
              <MenuItem
                disabled={contextMaenuDisabled}
                className="text-sm"
                text="Deselect all children"
                onClick={() => {
                  const allChildren = item.children || [];
                  onSelectCallback(allChildren, "local");
                }}
              />
            </Menu>
          }
        >
          <span className="text-sm relative top-[2px]">{item.data}</span>
        </ContextMenu>
      </div>
    );

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
      label: itemLabel,
      hasCaret: item.isFolder,
      isExpanded,
      isSelected,
      childNodes,
      icon: <Icon icon={iconName} size={18} color={iconMetaData.color} />,
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
          onNodeClick={onSelectCallback}
        />
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
};

export default FileTree;
