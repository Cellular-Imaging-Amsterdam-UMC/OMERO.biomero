import React, { useState, useMemo } from "react";
import { Tree, Icon, IconSize } from "@blueprintjs/core";
import { useAppContext } from "./AppContext";
import { fetchProjectData } from "./apiService";
import "@blueprintjs/core/lib/css/blueprint.css";

const FileTree = () => {
  const { state, updateState } = useAppContext();

  const [focusedItem, setFocusedItem] = useState();
  const [expandedItems, setExpandedItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleExpandItem = async (expandedItem) => {
    if (expandedItem.category === "projects" && expandedItem.childCount) {
      try {
        const projectData = await fetchProjectData(expandedItem);

        const newDatasets = (projectData.datasets || []).map((dataset) => ({
          index: `dataset-${dataset.id}`,
          isFolder: false,
          children: [],
          data: dataset.name,
          childCount: dataset.childCount,
          id: dataset.id,
          ownerId: dataset.ownerId,
          permsCss: dataset.permsCss,
          category: "datasets",
        }));

        const updatedDatasets = newDatasets.reduce((acc, dataset) => {
          acc[dataset.index] = {
            ...state.omeroTreeData[dataset.index],
            ...dataset,
          };
          return acc;
        }, {});

        const updatedProjects = {
          [expandedItem.index]: {
            ...state.omeroTreeData[expandedItem.index],
            children: Array.from(
              new Set([
                ...(state.omeroTreeData[expandedItem.index].children || []),
                ...newDatasets.map((dataset) => dataset.index),
              ])
            ),
          },
        };

        updateState({
          omeroTreeData: {
            ...state.omeroTreeData,
            ...updatedDatasets,
            ...updatedProjects,
          },
        });
      } catch (error) {
        console.error("Error fetching project data:", error);
      }
    }
  };

  const buildTreeNodes = (itemIndex) => {
    if (!state.omeroTreeData || !state.omeroTreeData[itemIndex]) return null;

    const item = state.omeroTreeData[itemIndex];

    const hasCaret = item.isFolder;
    const isExpanded = expandedItems.includes(item.index);
    const isSelected = selectedItems.includes(item.index);
    const iconName = isExpanded ? "folder-open" : "folder-close";
    const icon = <Icon icon={iconName} size={18} />


    const childNodes = item.children
      ? item.children
          .map((childIndex) => buildTreeNodes(childIndex))
          .filter((node) => node !== null)
      : undefined;

    return {
      id: item.index,
      label: item.data,
      hasCaret: hasCaret,
      isExpanded: isExpanded,
      isSelected: isSelected,
      childNodes: childNodes,
      nodeData: item,
      icon: icon,
    };
  };

  const treeNodes = useMemo(() => {
    if (!state.omeroTreeData || !state.omeroTreeData["root"]) return [];
    const rootNode = buildTreeNodes("root");
    return rootNode ? [rootNode] : [];
  }, [state.omeroTreeData, expandedItems, selectedItems]);

  const handleNodeExpand = (nodeData) => {
    const item = nodeData.nodeData;
    if (!item) return;
    if (!expandedItems.includes(item.index)) {
      setExpandedItems([...expandedItems, item.index]);
    }
    if (item.category === "projects" && item.childCount) {
      handleExpandItem(item);
    }
  };

  const handleNodeCollapse = (nodeData) => {
    const item = nodeData.nodeData;
    if (!item) return;
    setExpandedItems(expandedItems.filter((id) => id !== item.index));
  };

  const handleNodeClick = (nodeData, _nodePath, e) => {
    const item = nodeData.nodeData;
    if (!item) return;
    if (selectedItems.includes(item.index)) {
      setSelectedItems(selectedItems.filter((id) => id !== item.index));
    } else {
      setSelectedItems([...selectedItems, item.index]);
    }
    setFocusedItem(item.index);
  };

  return (
    // <div className="p-4 border rounded-md bg-gray-50">
    <div className="p-4">
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
