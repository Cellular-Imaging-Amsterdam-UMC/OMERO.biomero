import React from "react";
import { useAppContext } from "./AppContext";
import FileTree from "./FileTree";
import { fetchFolderData } from "./apiService";

const FileBrowser = ({
  onSelectCallback
}) => {
  const { state, updateState } = useAppContext();

  const handleFolderDataFetch = async (node) => {
    console.log("Fetching folder data for node:", node);
    const response = await fetchFolderData(node.index);
    const contents = response.contents || [];

    const newNodes = contents.reduce((acc, item) => {
      acc[item.id] = {
        index: item.id,
        isFolder: item.is_folder,
        children: [], // Ensure this gets updated later
        data: item.name,
      };
      return acc;
    }, {});

    console.log("New nodes:", newNodes);

    const updatedNode = {
      ...state.folderData[node.index],
      children: contents.map((item) => item.id), // This should correctly update children
    };

    updateState({
      folderData: {
        ...state.folderData,
        ...newNodes,
        [node.index]: updatedNode,
      },
    });

    return newNodes;
  };

  return (
    <FileTree
      fetchData={handleFolderDataFetch}
      initialDataKey="root"
      dataStructure={state.folderData}
      onExpandCallback={(node, newData) => {
        console.log("Folder expanded:", node, newData);
      }}
      onSelectCallback={(selected) => {onSelectCallback(selected)}}
    />
  );
};

export default FileBrowser;
