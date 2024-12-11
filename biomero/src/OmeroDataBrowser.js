import React from "react";
import { useAppContext } from "./AppContext";
import FileTree from "./FileTree";
import { fetchProjectData } from "./apiService";

const OmeroDataBrowser = () => {
  const { state, updateState } = useAppContext();

  const handleProjectDataFetch = async (node) => {
    const response = await fetchProjectData(node);
    const datasets = (response.datasets || []).map((dataset) => ({
      index: `dataset-${dataset.id}`,
      isFolder: false,
      children: [],
      data: dataset.name,
    }));

    const updatedNode = {
      ...state.omeroTreeData[node.index],
      children: datasets.map((dataset) => dataset.index),
    };

    const newNodes = datasets.reduce((acc, dataset) => {
      acc[dataset.index] = dataset;
      return acc;
    }, {});

    updateState({
      omeroTreeData: {
        ...state.omeroTreeData,
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
      dataStructure={state.omeroTreeData}
      onExpandCallback={(node, newData) => {
        console.log("Project expanded:", node, newData);
      }}
    />
  );
};

export default OmeroDataBrowser;
