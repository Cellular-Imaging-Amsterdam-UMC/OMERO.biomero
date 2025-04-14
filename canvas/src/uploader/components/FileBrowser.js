import React from "react";
import { useAppContext } from "../../AppContext";
import FileTree from "../../shared/components/FileTree";
import { fetchFolderData } from "../../apiService";

const FileBrowser = ({ onSelectCallback, rootFolder = null }) => {
  const { state, updateState, loadFolderData } = useAppContext();

  // Add useEffect to fetch data for non-root folders when component mounts
  React.useEffect(() => {
    if (rootFolder && rootFolder !== "root" && !state.localFileTreeData[rootFolder]) {
      loadFolderData(rootFolder);
    }
  }, [rootFolder, state.localFileTreeData, loadFolderData]);

  // Filter the tree data based on rootFolder
  const getFilteredTreeData = () => {
    if (!rootFolder || rootFolder === "root") {
      return state.localFileTreeData;
    }

    // Wait for the folder data to be loaded
    if (!state.localFileTreeData[rootFolder]) {
      return { [rootFolder]: { isFolder: true, children: [], data: "Loading...", index: rootFolder } };
    }

    // Create a new tree starting from the mapped folder
    const filteredData = {};
    const queue = [rootFolder];
    
    while (queue.length > 0) {
      const currentPath = queue.pop();
      const node = state.localFileTreeData[currentPath];
      
      if (node) {
        filteredData[currentPath] = node;
        
        // Add children to queue
        if (node.children) {
          queue.push(...node.children);
        }
      }
    }

    return filteredData;
  };

  const treeData = getFilteredTreeData();

  const handleFolderDataFetch = async (node) => {
    const response = await fetchFolderData(node.index);
    const contents = response.contents || [];

    const newNodes = contents.reduce((acc, item) => {
      acc[item.id] = {
        index: item.id,
        isFolder: item.is_folder,
        children: [],
        data: item.name,
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
  };

  return (
    <FileTree
      fetchData={handleFolderDataFetch}
      initialDataKey={rootFolder || "root"}
      dataStructure={treeData}
      onExpandCallback={(node, newData) => {
        console.log("Folder expanded:", node, newData);
      }}
      onSelectCallback={onSelectCallback}
      selectedItems={state.localFileTreeSelection}
    />
  );
};

export default FileBrowser;
