import React, { useEffect } from "react";
import { useAppContext } from "./AppContext";
import FileBrowser from "./FileBrowser";
import OmeroDataBrowser from "./OmeroDataBrowser";
import GroupSelect from "./GroupSelect";

const UploaderApp = () => {
  const { state, loadOmeroTreeData, loadFolderData, loadGroups } =
    useAppContext();

  useEffect(() => {
    loadOmeroTreeData(); // Load tree data on component mount
    loadFolderData(); // Load local folder data on component mount
    loadGroups();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-[#f0f1f5] w-full h-full relative top-0">
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center">
            <span className="text-base mr-4">Select group</span>
            <GroupSelect />
          </div>
        )}
      </div>
      <div className="flex space-x-4">
        <div className="w-1/3 p-4 overflow-auto">
          <h1 className="text-base font-bold p-4 pb-0 ">Local folders</h1>
          {state.folderData && <FileBrowser />}
        </div>
        <div className="w-1/3 p-4 overflow-auto">
          <h1 className="text-base font-bold p-4 pb-0 ">OMERO Data</h1>
          {state.omeroTreeData && <OmeroDataBrowser />}
        </div>
        <div className="w-1/3 p-4 overflow-auto"></div>
      </div>
    </div>
  );
};

export default UploaderApp;
