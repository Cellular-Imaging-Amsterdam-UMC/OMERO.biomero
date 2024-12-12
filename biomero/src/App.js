import React, { useEffect } from "react";
import { useAppContext } from "./AppContext";
import FileBrowser from "./FileBrowser";
import OmeroDataBrowser from "./OmeroDataBrowser";
import GroupSelect from "./GroupSelect";
import ScriptsMenu from "./components/ScriptsMenu";
import TabContainer from "./components/TabContainer";
import SearchBar from "./components/SearchBar";
import UploadButton from "./components/UploadButton";
import "./styles/style.css";

const App = () => {
  const { state, loadOmeroTreeData, loadFolderData, loadGroups, loadScripts } =
    useAppContext();

  useEffect(() => {
    // Load initial data for OMERO, folders, groups, and scripts
    loadOmeroTreeData();
    loadFolderData();
    loadGroups();
    loadScripts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-[#f0f1f5] w-full h-full relative top-0 overflow-y-auto">
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center justify-between">
            <SearchBar />
            <UploadButton uploadUrl="/script_upload" />
          </div>
        )}
      </div>

      {/* Main Content: TabContainer & Cards */}
      <div className="flex flex-col lg:flex-row space-x-4 h-[50vh]">
        {/* Left Column: Scripts Menu with Tabs */}
        <div className="lg:w-1/4 p-4 overflow-auto">
          {state.scripts?.length > 0 ? (
            <div id="scripts-menu" className="h-full">
              <div className="scripts-menu-tabs">
                <TabContainer menuData={state.scripts} />
              </div>
            </div>
          ) : (
            <p>Loading scripts...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
