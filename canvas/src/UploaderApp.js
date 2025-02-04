import React, { useEffect, useState } from "react";
import { useAppContext } from "./AppContext";
import FileBrowser from "./FileBrowser";
import OmeroDataBrowser from "./OmeroDataBrowser";
import GroupSelect from "./GroupSelect";
import { Tabs, Tab, H4, Tooltip, Navbar, NavbarGroup, NavbarHeading, NavbarDivider, Icon } from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";

// MonitorPanel Component (Metabase iframe)
const MonitorPanel = ({ iframeUrl, metabaseError, setMetabaseError, isAdmin, metabaseUrl }) => (
  <div className="h-full overflow-y-auto"> 
    <H4>Monitor</H4>
    <div className="p-4 h-full overflow-hidden">
      {!metabaseError ? (
        <iframe
          src={iframeUrl}
          frameBorder="0"
          onError={() => setMetabaseError(true)}
          style={{ width: "100%", height: "800px" }}
        />
      ) : (
        <div className="error">Error loading Metabase dashboard. Please try refreshing the page.</div>
      )}
      {isAdmin && (
        <div className="bottom-message">
          <a href={metabaseUrl} target="_blank" rel="noopener noreferrer">
            Click here to access the Metabase interface
          </a>
        </div>
      )}
    </div>
  </div>
);

const UploaderApp = () => {
  const { state, loadOmeroTreeData, loadFolderData, loadGroups } = useAppContext();
  const [activeTab, setActiveTab] = useState("Upload"); // Track active tab state
  const [metabaseError, setMetabaseError] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({
      Upload: true, // Automatically load the first tab
      Monitor: false,
    });
  
  // Handle tab change with conditional loading
  const handleTabChange = (newTabId) => {
    if (!loadedTabs[newTabId]) {
      setLoadedTabs((prevState) => ({ ...prevState, [newTabId]: true }));
    }
    setActiveTab(newTabId);
  };

  // Metabase settings
  const metabaseUrl = document.getElementById("root").getAttribute("data-metabase-url");
  const metabaseToken = document.getElementById("root").getAttribute("data-metabase-token");
  const isAdmin = document.getElementById("root").getAttribute("data-is-admin") === "true";
  const iframeUrl = `${metabaseUrl}/embed/dashboard/${metabaseToken}#bordered=true&titled=true&refresh=20`;

  useEffect(() => {
    loadOmeroTreeData(); // Load tree data on component mount
    loadFolderData(); // Load local folder data on component mount
    loadGroups();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-[#f0f1f5] w-full h-full relative top-0 overflow-hidden">
      {/* Navbar */}
      <Navbar className="z-0">
        <NavbarGroup>
          <Icon icon="style" className="mr-[7px]"/>
          <NavbarHeading>CANVAS</NavbarHeading>
          <NavbarDivider />
          <Icon icon="data-sync" className="mr-[7px]"/>
          <NavbarHeading>Uploader</NavbarHeading>
        </NavbarGroup>
      </Navbar>
      
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center">
            <span className="text-base mr-4">Select group</span>
            <GroupSelect />
          </div>
        )}
      </div>

      {/* Tabs with Panels */}
      <div className="p-4 h-full overflow-hidden">
        <Tabs
          id="app-tabs"
          className="h-full"
          animate={true}
          renderActiveTabPanelOnly={false}
          large={true}
          selectedTabId={activeTab}
          onChange={handleTabChange}
        >
          {/* Upload/Import Tab */}
          <Tab
            id="Upload"
            title="Upload"
            icon="upload"
            panel={loadedTabs.Upload ?
              (
              <div className="flex space-x-4">
                <div className="w-1/3 p-4 overflow-auto">
                  <h1 className="text-base font-bold p-4 pb-0 ">Local folders</h1>
                  {state.folderData && <FileBrowser />}
                </div>
                <div className="w-1/3 p-4 overflow-auto">
                  <h1 className="text-base font-bold p-4 pb-0 ">OMERO Data</h1>
                  {state.omeroTreeData && <OmeroDataBrowser onSelectCallback={(folders) => console.log(folders)}  />}
                </div>
                <div className="w-1/3 p-4 overflow-auto"></div>
              </div>
              ) : null
            }
          />

          {/* Monitor Tab */}
          <Tab
            id="Monitor"
            title="Monitor"
            icon="dashboard"
            panel={loadedTabs.Monitor ? (
              <MonitorPanel
                iframeUrl={iframeUrl}
                metabaseError={metabaseError}
                setMetabaseError={setMetabaseError}
                isAdmin={isAdmin}
                metabaseUrl={metabaseUrl}
              />
            ) : null
            }
          />
        </Tabs>
      </div>
    </div>
  );
};

export default UploaderApp;
