import React, { useState, useEffect } from "react";
import { useAppContext } from "./AppContext";
import OmeroDataBrowser from "./OmeroDataBrowser";
import TabContainer from "./components/TabContainer";
import RunPanel from "./components/RunPanel";
import {
  Tabs,
  Tab,
  H4,
  Navbar,
  NavbarGroup,
  NavbarHeading,
  Alignment,
  Card,
  Elevation,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Classes,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";


const RunTab = ({ state }) => (
  <div>
    <H4>Run</H4>
    <div className="flex">
      {/* OMERO Data Browser */}
      <div className="w-1/5 p-4 overflow-auto">
        <h1 className="text-base font-bold p-4 pb-0">OMERO Data</h1>
        {state.omeroTreeData && <OmeroDataBrowser />}
      </div>
      {/* Run Menu */}
      <div className="w-4/5 p-4 flex-1 overflow-hidden">
          <RunPanel
            state={state}
          /> 
      </div>
    </div>
  </div>
);

const ScriptsPanel = ({ state }) => (
  <div>
    <H4>Scripts</H4>
    <div className="flex">
      {/* OMERO Data Browser */}
      <div className="w-1/5 p-4 overflow-auto">
        <h1 className="text-base font-bold p-4 pb-0">OMERO Data</h1>
        {state.omeroTreeData && <OmeroDataBrowser />}
      </div>
      {/* Scripts Menu */}
      <div className="w-4/5 p-4 flex-1 overflow-hidden">
        {state.scripts?.length > 0 ? (
          <TabContainer menuData={state.scripts} />
        ) : (
          <p>Loading scripts...</p>
        )}
      </div>
    </div>
  </div>
);

const StatusPanel = ({ iframeUrl, metabaseError, setMetabaseError, isAdmin, metabaseUrl }) => (
  <div>
    <H4>Status</H4>
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

const App = () => {
  const { state, loadOmeroTreeData, loadFolderData, loadGroups, loadScripts, loadWorkflows } = useAppContext();
  const [metabaseError, setMetabaseError] = useState(false);


  useEffect(() => {
    loadOmeroTreeData();
    loadFolderData();
    loadGroups();
    loadScripts();
    loadWorkflows(); // Fetch workflows for the Scripts tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metabaseUrl = document.getElementById("root").getAttribute("data-metabase-url");
  const metabaseToken = document.getElementById("root").getAttribute("data-metabase-token");
  const isAdmin = document.getElementById("root").getAttribute("data-is-admin") === "true";
  const iframeUrl = `${metabaseUrl}/embed/dashboard/${metabaseToken}#bordered=true&titled=true&refresh=20`;

  return (
    <div className="bg-[#f0f1f5] w-full h-full relative top-0 overflow-hidden">
      {/* Navbar */}
      <Navbar>
        <NavbarGroup>
          <NavbarHeading>BIOMERO</NavbarHeading>
        </NavbarGroup>
      </Navbar>

      {/* Tabs with Panels */}
      <div style={{ padding: "16px" }}>
        <Tabs id="app-tabs" animate={true} renderActiveTabPanelOnly={false} large={true}>
          <Tab
            id="Run"
            title="Run"
            icon="play"
            panel={
              <RunTab state={state} />
            }
          />
          <Tab
            id="Status"
            title="Status"
            icon="dashboard"
            panel={
              <StatusPanel
                iframeUrl={iframeUrl}
                metabaseError={metabaseError}
                setMetabaseError={setMetabaseError}
                isAdmin={isAdmin}
                metabaseUrl={metabaseUrl}
              />
            }
          />
          <Tab
            id="Scripts"
            title="Scripts"
            icon="document"
            panel={<ScriptsPanel state={state} />}
          />
        </Tabs>
      </div>
    </div>
  );
};

export default App;
