import React, { useEffect } from "react";
import FileTree from "./FileTree";
import { useAppContext } from "./AppContext";

const App = () => {
  const { loadomeroTreeData } = useAppContext();

  useEffect(() => {
    loadomeroTreeData(); // Load tree data on component mount
  }, []);

  return (
    <div className="bg-[#d5d9dd] w-full h-full absolute top-0">
      <div className="flex space-x-4">
        <div className="w-1/4">
          <h1 className="text-lg font-bold p-4 pb-0">OMERO Data</h1>
          <FileTree />
        </div>
        <div className="w-1/2"></div>
        <div className="w-1/4"></div>
      </div>
    </div>
  );
};

export default App;
