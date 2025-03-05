import React from "react";
import { useAppContext } from "../../AppContext";
import FileTree from "./FileTree";
import { fetchProjectData } from "../../apiService";

const OmeroDataBrowser = ({ onSelectCallback }) => {
  const { state, updateState } = useAppContext();

  const handleProjectDataFetch = async (node) => {
    const response = await fetchProjectData(node);
    const datasets = (response.datasets || []).map((dataset) => ({
      id: dataset.id,
      category: "datasets",
      index: `dataset-${dataset.id}`,
      isFolder: false,
      children: [],
      childCount: dataset.childCount,
      data: dataset.name,
    }));

    const updatedNode = {
      ...state.omeroFileTreeData[node.index],
      children: datasets.map((dataset) => dataset.index),
    };

    const newNodes = datasets.reduce((acc, dataset) => {
      acc[dataset.index] = dataset;
      return acc;
    }, {});

    updateState({
      omeroFileTreeData: {
        ...state.omeroFileTreeData,
        ...newNodes,
        [node.index]: updatedNode,
      },
    });
    return newNodes;
  };

  return (
    <FileTree
      fetchData={handleProjectDataFetch}
      initialDataKey="root"
      dataStructure={state.omeroFileTreeData}
      onExpandCallback={(node, newData) => {
        console.log("Project expanded:", node, newData);
      }}
      onSelectCallback={onSelectCallback}
      selectedItems={state.omeroFileTreeSelection}
    />
  );
};

export default OmeroDataBrowser;
