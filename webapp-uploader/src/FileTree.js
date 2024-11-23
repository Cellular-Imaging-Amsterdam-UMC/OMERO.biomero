import React, { useEffect, useState } from "react";
import {
  ControlledTreeEnvironment,
  StaticTreeDataProvider,
  Tree,
} from "react-complex-tree";
import "react-complex-tree/lib/style.css";
import { useAppContext } from "./AppContext";

const treeSample = {
  root: {
    index: "root",
    isFolder: true,
    children: ["item1", "item2"],
    data: "Root folder",
  },
  item1: {
    index: "item1",
    isFolder: false,
    children: [],
    data: "File 1",
  },
  item2: {
    index: "item2",
    isFolder: true,
    children: ["item3"],
    data: "Folder 1",
  },
  item3: {
    index: "item3",
    isFolder: false,
    children: [],
    data: "File 2",
  },
};

// Function to transform the provided structure into react-complex-tree compatible data
const transformStructure = (data) => {
  if (!data || Object.keys(data).length === 0) {
    // Return a placeholder tree if data is null or empty
    return {
      root: {
        index: "root",
        isFolder: true,
        children: [],
        data: "No Data Available",
      },
    };
  }

  const items = {
    root: {
      index: "root",
      isFolder: true,
      children: ["projects", "datasets", "screens", "plates", "orphaned"],
      data: "Root",
    },
    projects: {
      index: "projects",
      isFolder: true,
      children: (data.projects || []).map((project) => `project-${project.id}`),
      data: "Projects",
    },
    datasets: {
      index: "datasets",
      isFolder: true,
      children: (data.datasets || []).map((dataset) => `dataset-${dataset.id}`),
      data: "Datasets",
    },
    screens: {
      index: "screens",
      isFolder: true,
      children: (data.screens || []).map((screen) => `screen-${screen.id}`),
      data: "Screens",
    },
    plates: {
      index: "plates",
      isFolder: true,
      children: (data.plates || []).map((plate) => `plate-${plate.id}`),
      data: "Plates",
    },
    orphaned: {
      index: "orphaned",
      isFolder: false,
      children: [],
      data: data.orphaned?.name || "Orphaned Images",
    },
  };

  // Add individual projects
  (data.projects || []).forEach((project) => {
    items[`project-${project.id}`] = {
      index: `project-${project.id}`,
      isFolder: project.childCount > 0,
      children: [], // Populate if nested items are included
      data: project.name,
    };
  });

  // Add individual datasets
  (data.datasets || []).forEach((dataset) => {
    items[`dataset-${dataset.id}`] = {
      index: `dataset-${dataset.id}`,
      isFolder: dataset.childCount > 0,
      children: [], // Populate if nested items are included
      data: dataset.name,
    };
  });

  return items;
};

const FileTree = () => {
  const { state, updateState } = useAppContext();

  const [focusedItem, setFocusedItem] = useState();
  const [expandedItems, setExpandedItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  // Example: Function to add a new project
  const addProject = (newProject) => {
    const updatedProjects = [...(state.treeData.projects || []), newProject];
    updateState({
      treeData: {
        ...state.treeData,
        projects: updatedProjects,
      },
    });
  };

  const transformedTreeData = transformStructure(state.treeData);
  useEffect(() => {
    console.log("Transformed Tree Data:", transformedTreeData);
  }, [state.treeData]);

  return (
    <div>
      <button
        onClick={() =>
          addProject({
            id: (state.treeData.projects?.length || 0) + 1,
            name: `New Project ${(state.treeData.projects?.length || 0) + 1}`,
            ownerId: 0,
            childCount: 0,
            permsCss:
              "canEdit canAnnotate canLink canDelete canChgrp canChown isOwned",
          })
        }
      >
        Add Project
      </button>
      <ControlledTreeEnvironment
        items={transformedTreeData}
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
          console.log("Expanded item:", item);
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
      >
        <Tree treeId="tree" rootItem="root" />
      </ControlledTreeEnvironment>
    </div>
  );
};

export default FileTree;
