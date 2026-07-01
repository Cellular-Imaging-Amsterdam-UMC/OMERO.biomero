import React from "react";
import { useAppContext } from "../../AppContext";
import FileTree from "../../shared/components/FileTree";
import { fetchFolderData } from "../../apiService";

const FileBrowser = ({
  onSelectCallback,
  rootFolder = null,
  // When true, file nodes are hidden — only folders are shown/selectable.
  foldersOnly = false,
  // When true, nodes whose display name contains a '.' are hidden.
  // Catches hidden dirs (.analyzed, .processed) and container files (.zarr, .lif).
  excludeDotNames = false,
  // Override the highlighted selection; defaults to state.localFileTreeSelection.
  selectedItems: selectedItemsProp = undefined,
}) => {
  const { state, updateState, loadFolderData, toaster } = useAppContext();

  // Add useEffect to fetch data for non-root folders when component mounts
  React.useEffect(() => {
    if (rootFolder && rootFolder !== "root" && !state.localFileTreeData[rootFolder]) {
      loadFolderData(rootFolder);
    }
  }, [rootFolder, state.localFileTreeData, loadFolderData]);

  // Build the base tree (rootFolder subtree or full tree) then apply visibility filters.
  const getFilteredTreeData = () => {
    let baseData;

    if (!rootFolder || rootFolder === "root") {
      baseData = state.localFileTreeData;
    } else if (!state.localFileTreeData[rootFolder]) {
      return { [rootFolder]: { isFolder: true, children: [], data: "Loading...", index: rootFolder } };
    } else {
      // Create a new tree starting from the mapped folder
      const subtree = {};
      const queue = [rootFolder];
      while (queue.length > 0) {
        const currentPath = queue.pop();
        const node = state.localFileTreeData[currentPath];
        if (node) {
          subtree[currentPath] = node;
          if (node.children) queue.push(...node.children);
        }
      }
      baseData = subtree;
    }

    if (!foldersOnly && !excludeDotNames) return baseData;

    // Strip unwanted children from each node's children array.
    // We intentionally keep children whose node data hasn't loaded yet (child not in baseData)
    // so the tree can still expand and fetch them lazily.
    const result = {};
    Object.entries(baseData).forEach(([key, node]) => {
      result[key] = {
        ...node,
        children: (node.children || []).filter((childKey) => {
          const child = baseData[childKey];
          if (!child) return true; // not yet fetched — keep so expand can load it
          if (foldersOnly && !child.isFolder) return false;
          if (excludeDotNames && child.data && child.data.includes(".")) return false;
          return true;
        }),
      };
    });
    return result;
  };

  const treeData = getFilteredTreeData();

  const handleFolderDataFetch = async (node) => {
    try {
      const response = await fetchFolderData(node.index, node.isFolder);
      const contents = response.contents || [];

      const newNodes = contents.reduce((acc, item) => {
        acc[item.id] = {
          index: item.id,
          isFolder: item.is_folder,
          children: [],
          data: item.name,
          metadata: item.metadata,
          source: item.source,
        };
        return acc;
      }, {});

      const updatedNode = {
        ...state.localFileTreeData[node.index],
        children: contents.map((item) => item.id),
      };

      updateState({
        localFileTreeData: {
          ...state.localFileTreeData,
          ...newNodes,
          [node.index]: updatedNode,
        },
      });

      return newNodes;
    } catch (error) {
      const serverMsg = error?.response?.data;
      const rawMessage = typeof serverMsg === "string" ? serverMsg : (serverMsg?.message || error.message || "Unknown error");
      const MAX_LEN = 160;
      const displayMessage = rawMessage.length > MAX_LEN ? rawMessage.slice(0, MAX_LEN - 3) + "..." : rawMessage;
      toaster?.show({
          intent: "danger",
          icon: "error",
          message: `Failed to load folder data: ${displayMessage}`,
        });
    }
  };

  return (
    <FileTree
      fetchData={handleFolderDataFetch}
      initialDataKey={rootFolder || "root"}
      dataStructure={treeData}
      onSelectCallback={onSelectCallback}
      selectedItems={selectedItemsProp !== undefined ? selectedItemsProp : state.localFileTreeSelection}
    />
  );
};

export default FileBrowser;
