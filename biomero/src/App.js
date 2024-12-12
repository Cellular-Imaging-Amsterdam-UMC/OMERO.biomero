import React, { useEffect } from "react";
import { useAppContext } from "./AppContext";
import OmeroDataBrowser from "./OmeroDataBrowser";
import TabContainer from "./components/TabContainer";
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
      <div className="flex">
        {/* Left Column: OMERO Data Browser */}
        <div className="w-1/4 p-4 overflow-auto">
          <h1 className="text-base font-bold p-4 pb-0">OMERO Data</h1>
          {state.omeroTreeData && <OmeroDataBrowser />}
        </div>

        {/* Right Column: Scripts Menu with Tabs */}
        <div className="w-3/4 p-4 flex-1 overflow-hidden">
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
