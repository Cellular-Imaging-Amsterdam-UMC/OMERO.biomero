import React, { useState } from "react";
import {
  UncontrolledTreeEnvironment,
  StaticTreeDataProvider,
  Tree,
} from "react-complex-tree";
import "react-complex-tree/lib/style.css"; // Import the required CSS for styling

const FileTree = () => {
  const [treeItems, setTreeItems] = useState({
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
  });

  return (
    <UncontrolledTreeEnvironment
      dataProvider={
        new StaticTreeDataProvider(treeItems, (items) => setTreeItems(items))
      }
      getItemTitle={(item) => item.data}
      viewState={{}}
    >
      <Tree treeId="tree" rootItem="root" />
    </UncontrolledTreeEnvironment>
  );
};

export default FileTree;
