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
    <div className="bg-[#f0f1f5] w-full h-full relative top-0 overflow-hidden">
      {/* Main Content: OMERO Data Browser and Scripts TabContainer */}
      <div className="flex flex-col lg:flex-row h-[50vh]">
        {/* Left Column: OMERO Data Browser */}
        <div className="w-full lg:w-1/3 p-4 overflow-auto">
          <h1 className="text-base font-bold p-4 pb-0">OMERO Data</h1>
          {state.omeroTreeData && <OmeroDataBrowser />}
        </div>

        {/* Right Column: Scripts Menu with Tabs (2/3 width) */}
        <div className="w-full lg:w-2/3 p-4 flex-1 overflow-hidden">
          {state.scripts?.length > 0 ? (
            <div id="scripts-menu" className="h-full overflow-hidden">
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
