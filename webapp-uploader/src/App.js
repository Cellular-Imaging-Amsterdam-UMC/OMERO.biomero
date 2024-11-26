import React, { useEffect } from "react";
import { useAppContext } from "./AppContext";
import FileBrowser from "./FileBrowser";
import OmeroDataBrowser from "./OmeroDataBrowser";
import GroupSelect from "./GroupSelect";

const App = () => {
  const { state, loadomeroTreeData, loadFolderData, loadGroups } =
    useAppContext();

  useEffect(() => {
    loadomeroTreeData(); // Load tree data on component mount
    loadFolderData(); // Load local folder data on component mount
    loadGroups();
  }, []);

  return (
    <div className="bg-[#f0f1f5] w-full h-full absolute top-0">
      <div className="p-4">
        <h1 className="text-base font-bold">Select group</h1>
        {state?.user?.groups && (
          <div className="flex items-center">
            <span className="text-base mr-4">Select group</span>
            <GroupSelect />
          </div>
        )}
      </div>
      <div className="flex space-x-4">
        <div className="w-1/4">
          <h1 className="text-base font-bold p-4 pb-0">OMERO Data!!!</h1>
          {state.omeroTreeData && <OmeroDataBrowser />}
        </div>
        <div className="w-1/2">
          <h1 className="text-base font-bold p-4 pb-0">Local folders</h1>
          {state.folderData && <FileBrowser />}
        </div>
        <div className="w-1/4"></div>
      </div>
    </div>
  );
};

export default App;
