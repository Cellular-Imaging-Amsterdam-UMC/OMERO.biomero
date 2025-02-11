import React from "react";
import { useAppContext } from "../AppContext";
import FileTree from "./FileTree";
import { fetchFolderData } from "../apiService";

const FileBrowser = ({ onSelectCallback }) => {
  const { state, updateState } = useAppContext();

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
      initialDataKey="root"
      dataStructure={state.localFileTreeData}
      onExpandCallback={(node, newData) => {
        console.log("Folder expanded:", node, newData);
      }}
      onSelectCallback={onSelectCallback}
      selectedItems={state.localFileTreeSelection}
    />
  );
};

export default FileBrowser;
