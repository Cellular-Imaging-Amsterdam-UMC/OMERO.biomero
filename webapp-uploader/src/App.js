import React, { useEffect } from "react";
import FileTreeOmero from "./FileTreeOmero";
import FileTreeLocal from "./FileTreeLocal";
import { useAppContext } from "./AppContext";

const App = () => {
  const { state, loadomeroTreeData, loadFolderData } = useAppContext();

  useEffect(() => {
    loadomeroTreeData(); // Load tree data on component mount
    loadFolderData(); // Load local folder data on component mount
  }, []);

  return (
    <div className="bg-[#f0f1f5] w-full h-full absolute top-0">
      <div className="flex space-x-4">
        <div className="w-1/4">
          <h1 className="text-base font-bold p-4 pb-0">OMERO Data</h1>
          {state.omeroTreeData && <FileTreeOmero />}
        </div>
        <div className="w-1/2">
          <h1 className="text-base font-bold p-4 pb-0">Local folders</h1>
          {state.folderData && <FileTreeLocal />}
        </div>
        <div className="w-1/4"></div>
      </div>
    </div>
  );
};

export default App;
