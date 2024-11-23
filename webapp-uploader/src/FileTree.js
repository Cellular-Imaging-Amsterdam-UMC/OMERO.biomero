import React, { useState } from "react";
import { ControlledTreeEnvironment, Tree } from "react-complex-tree";
import "react-complex-tree/lib/style-modern.css";
import { useAppContext } from "./AppContext";
import { fetchProjectData } from "./apiService";
// import Icon from "@mdi/react";
// import { mdiChevronRight, mdiChevronDown, mdiFolder, mdiFile } from "@mdi/js";

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

  return (
    <div className="p-4 border rounded-md bg-gray-50">
      <ControlledTreeEnvironment
        items={state.omeroTreeData || []}
        getItemTitle={(item) => item.data}
        viewState={{
          tree: {
            focusedItem,
            expandedItems,
            selectedItems,
          },
        }}
        onFocusItem={(item) => setFocusedItem(item.index)}
        onExpandItem={(item) => {
          handleExpandItem(item);
          setExpandedItems([...expandedItems, item.index]);
        }}
        onCollapseItem={(item) =>
          setExpandedItems(
            expandedItems.filter(
              (expandedItemIndex) => expandedItemIndex !== item.index
            )
          )
        }
        onSelectItems={(items) => setSelectedItems(items)}
        // renderItem={renderTreeItem}
      >
        <Tree treeId="tree" rootItem="root" />
      </ControlledTreeEnvironment>
    </div>
  );
};

export default FileTree;
