import React, { useState, useEffect } from "react";
import { useAppContext } from "./AppContext";
import TabContainer from "./components/TabContainer";
import RunPanel from "./components/RunPanel";
import {
  Tabs,
  Tab,
  H4,
  Navbar,
  NavbarGroup,
  NavbarHeading,
  Tooltip,
  NavbarDivider,
  Icon,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import SettingsForm from "./components/SettingsForm";

const RunTab = () => (
  <div className="h-full overflow-y-auto">
    <H4>Run image analysis workflows</H4>
    <div className="flex">
      <div className="w-full p-4 flex-1 overflow-hidden">
        <RunPanel />
      </div>
    </div>
  </div>
);

const AdminPanel = () => {
  const { state, loadScripts } = useAppContext();
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  useEffect(() => {
    if (!scriptsLoaded) {
      loadScripts();
      setScriptsLoaded(true); // Prevent reloading if already loaded
    }
  }, [scriptsLoaded, loadScripts, setScriptsLoaded]);

  return (
    <div className="h-full overflow-y-auto">
      <H4>Admin</H4>
      <div className="flex">
        <div className="w-1/2 p-4 overflow-auto">
          <SettingsForm/>
        </div>
        <div className="w-1/2 p-4 flex-1 overflow-hidden">
          {state.scripts?.length > 0 ? (
            <TabContainer menuData={state.scripts} />
          ) : (
            <p>Loading scripts...</p>
          )}
        </div>
      </div>
    </div>
  );
};

const StatusPanel = ({ iframeUrl, metabaseError, setMetabaseError, isAdmin, metabaseUrl }) => (
  <div className="h-full overflow-y-auto"> 
    <H4>Status</H4>
    <div className="p-4 h-full overflow-hidden">
      {!metabaseError ? (
        <iframe
          src={iframeUrl}
          className="w-full h-[800px]"
          frameBorder="0"
          onError={() => setMetabaseError(true)}
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

const BiomeroApp = () => {
  const { state, updateState, loadOmeroTreeData, loadFolderData, loadGroups, loadWorkflows } = useAppContext();
  const [metabaseError, setMetabaseError] = useState(false);
  const [activeTab, setActiveTab] = useState("Run");
  const [loadedTabs, setLoadedTabs] = useState({
    Run: true, // Automatically load the first tab
    Admin: false,
    Status: false,
  });

  // Loading states for each API call
  const [loadingOmero, setLoadingOmero] = useState(false);

  useEffect(() => {
    if (!loadingOmero) {
      setLoadingOmero(true);
      loadOmeroTreeData()
        .then(() => {
          setLoadingOmero(false);
        })
        .catch(() => {
          setLoadingOmero(false);
        });
    }

    loadFolderData();
    loadGroups();
    loadWorkflows();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // called only once

  const handleTabChange = (newTabId) => {
    if (!loadedTabs[newTabId]) {
      setLoadedTabs((prevState) => ({ ...prevState, [newTabId]: true }));
    }
    setActiveTab(newTabId);
  };

  const metabaseUrl = document.getElementById("root").getAttribute("data-metabase-url");
  const metabaseToken = document.getElementById("root").getAttribute("data-metabase-token");
  const isAdmin = document.getElementById("root").getAttribute("data-is-admin") === "true";
  const iframeUrl = `${metabaseUrl}/embed/dashboard/${metabaseToken}#bordered=true&titled=true&refresh=20`;

  return (
    <div className="bg-[#f0f1f5] w-full h-full relative top-0 overflow-hidden">
      {/* Navbar */}
      <Navbar className="z-[1]" >
        <NavbarGroup>
          <Icon icon="style" className="mr-[7px]"/>
          <NavbarHeading>CANVAS</NavbarHeading>
          <NavbarDivider />
          <Icon icon="predictive-analysis" className="mr-[7px]"/>
          <NavbarHeading>BIOMERO</NavbarHeading>
        </NavbarGroup>
      </Navbar>

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
          <Tab
            id="Run"
            title="Run"
            icon="play"
            panel={loadedTabs.Run ? <RunTab state={state} /> : null}
          />
          <Tab
            id="Status"
            title={
              <Tooltip
                content={
                    <span>
                        View your workflow's progress here
                    </span>
                }
                compact={true}
                isOpen={state.workflowStatusTooltipShown}
                intent="success"
                onOpened={() => {
                  setTimeout(() => {
                    updateState(
                      { workflowStatusTooltipShown: false }
                    );
                  }, 5000);
                }}
              >
                <span className="pointer-events-none select-none focus:outline-none">
                  Status
                </span>
              </Tooltip>
            }
            icon="dashboard"
            panel={loadedTabs.Status ? (
              <StatusPanel
                iframeUrl={iframeUrl}
                metabaseError={metabaseError}
                setMetabaseError={setMetabaseError}
                isAdmin={isAdmin}
                metabaseUrl={metabaseUrl}
              />
            ) : null}
          />
          {/* Admin tab */}
          {state.user.isAdmin && (
            <Tab
              id="Admin"
              title="Admin"
              icon="settings"
              panel={loadedTabs.Admin ? (
                <AdminPanel />
              ) : null}
            />
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default BiomeroApp;
