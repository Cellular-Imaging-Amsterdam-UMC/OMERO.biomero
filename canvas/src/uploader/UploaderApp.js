import React, { useEffect, useState } from "react";
import { useAppContext } from "../AppContext";
import FileBrowser from "./components/FileBrowser";
import OmeroDataBrowser from "../shared/components/OmeroDataBrowser";
import GroupSelect from "../shared/components/GroupSelect";
import AdminPanel from "./components/AdminPanel";
import {
  Tabs,
  Tab,
  H4,
  Button,
  CardList,
  Card,
  Callout,
  Divider,
  Icon,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";

const MonitorPanel = ({
  iframeUrl,
  metabaseError,
  setMetabaseError,
  isAdmin,
  metabaseUrl,
}) => (
  <div className="h-full overflow-y-auto">
    <H4>Monitor</H4>
    <div className="bp5-form-group">
      <div className="bp5-form-content">
        <div className="bp5-form-helper-text">
          View your active import progress, or browse some historical data, here
          on this dashboard.
        </div>
        <div className="bp5-form-helper-text">
          Tip: When an import is <b>Import Completed</b>, you can find your
          result images by pasting the <b>UUID</b> in OMERO's search bar at the
          top of your screen.
        </div>
      </div>
    </div>
    <div className="p-4 h-full overflow-hidden">
      {!metabaseError ? (
        <iframe
          title="Metabase dashboard"
          src={iframeUrl}
          className="w-full h-[800px]"
          frameBorder="0"
          onError={() => setMetabaseError(true)}
          onload="iFrameResize({}, this)"
        />
      ) : (
        <div className="error">
          Error loading Metabase dashboard. Please try refreshing the page.
        </div>
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
  const {
    state,
    updateState,
    loadOmeroTreeData,
    loadFolderData,
    loadGroups,
    loadGroupMappings,
    uploadSelectedData,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState("Upload");
  const [metabaseError, setMetabaseError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({
    Upload: true,
    Monitor: false,
    Admin: false,
  });
  const [uploadList, setUploadList] = useState([]);
  const [areUploadItemsSelected, setAreUploadItemsSelected] = useState(false);

  const getCurrentGroupFolder = () => {
    const activeGroupId = state.user.active_group_id;
    const mapping = state.groupFolderMappings[activeGroupId];
    return mapping?.folder || "root";  // Default to "root" if no mapping exists
  };

  const handleFileTreeSelection = (nodeData, type) => {
    const nodeId = nodeData.id;
    const selectionKey =
      type === "local" ? "localFileTreeSelection" : "omeroFileTreeSelection";
    let updatedSelection;

    if (state[selectionKey].includes(nodeId)) {
      // Remove the node if it was already selected
      updatedSelection = state[selectionKey].filter((id) => id !== nodeId);
    } else {
      // Add the node, with single selection for OMERO
      if (type === "omero") {
        updatedSelection = [nodeId];
      } else {
        updatedSelection = [...state[selectionKey], nodeId];
      }
    }
    updateState({ [selectionKey]: updatedSelection });
  };

  const handleUpload = async () => {
    setUploading(true);

    const selectedLocal = uploadList.map((item) => item.value);
    const selectedOmero = state.omeroFileTreeSelection
      .map((index) => {
        const omeroItem = state.omeroFileTreeData[index];
        return omeroItem ? [omeroItem.category, omeroItem.id] : null;
      })
      .filter(Boolean);

    const uploadData = { 
      selectedLocal, 
      selectedOmero,
      group: state.user.groups.find(g => g.id === state.user.active_group_id)?.name 
    };

    try {
      await uploadSelectedData(uploadData);
    } finally {
      setUploading(false);
      removeAllUploadItems();
    }
  };

  // We need to make sure only unique items are added to the upload list
  const addUploadItems = () => {
    const newUploadList = state.localFileTreeSelection
      .filter(
        (item) => !uploadList.some((uploadItem) => uploadItem.value === item)
      )
      .map((item) => ({ value: item, isSelected: false }));
    setUploadList([...uploadList, ...newUploadList]);
    updateState({ localFileTreeSelection: [] });
  };

  const removeUploadItems = () => {
    const newUploadList = uploadList.filter((item) => !item.isSelected);
    setUploadList(newUploadList);
    setAreUploadItemsSelected(false);
  };

  const removeAllUploadItems = () => {
    setUploadList([]);
    setAreUploadItemsSelected(false);
  };

  const selectItem = (item) => {
    let areItemsSelected = false;
    const newUploadList = uploadList.map((uploadItem) => {
      if (uploadItem.value === item.value) {
        if (!uploadItem.isSelected) {
          areItemsSelected = true;
        }
        return { ...uploadItem, isSelected: !uploadItem.isSelected };
      }
      return uploadItem;
    });
    setUploadList(newUploadList);
    setAreUploadItemsSelected(areItemsSelected);
  };

  const renderCards = () => {
    return uploadList.map((item) => (
      <Card
        key={item.value}
        interactive={true}
        className="text-sm m-1 pl-3"
        selected={item.isSelected}
        onClick={() => selectItem(item)}
      >
        {item.value.replace(/\//g, " / ")}{" "}
      </Card>
    ));
  };

  const handleTabChange = (newTabId) => {
    if (!loadedTabs[newTabId]) {
      setLoadedTabs((prevState) => ({ ...prevState, [newTabId]: true }));
    }
    setActiveTab(newTabId);
  };

  const metabaseUrl = document
    .getElementById("root")
    .getAttribute("data-metabase-url");
  const metabaseToken = document
    .getElementById("root")
    .getAttribute("data-metabase-token-imports");
  const isAdmin =
    document.getElementById("root").getAttribute("data-is-admin") === "true";
  const iframeUrl = `${metabaseUrl}/embed/dashboard/${metabaseToken}#bordered=true&titled=false&refresh=20`;

  useEffect(() => {
    loadOmeroTreeData();
    loadFolderData();
    loadGroups();
    loadGroupMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center">
            <span className="text-base mr-4">Select group</span>
            <GroupSelect />
          </div>
        )}
      </div>

      <div className="p-4 h-full overflow-hidden">
        <Tabs
          id="app-tabs"
          className="h-full"
          selectedTabId={activeTab}
          onChange={handleTabChange}
        >
          <Tab
            id="Upload"
            title="Upload"
            icon="upload"
            panel={
              loadedTabs.Upload ? (
                <div className="h-full">
                  <div className="flex space-x-4">
                    <div className="w-1/3 overflow-auto">
                      <div className="flex space-x-4 items-center">
                        <h1 className="text-base font-bold p-0 m-0 inline-block">
                          Select files to upload
                        </h1>
                        <Button
                          onClick={addUploadItems}
                          disabled={state.localFileTreeSelection.length === 0}
                          rightIcon="plus"
                          intent="success"
                          loading={uploading}
                        >
                          Add to upload list
                        </Button>
                      </div>
                      {state.localFileTreeData && (
                        <div className="mt-4">
                          <FileBrowser
                            onSelectCallback={(nodeData) =>
                              handleFileTreeSelection(nodeData, "local")
                            }
                            rootFolder={getCurrentGroupFolder()}
                          />
                        </div>
                      )}
                    </div>
                    <div className="w-1/3 overflow-auto">
                      <div className="flex space-x-4 items-center">
                        <h1 className="text-base font-bold p-0 m-0 inline-block">
                          Upload list
                        </h1>
                        <Button
                          onClick={removeUploadItems}
                          disabled={!areUploadItemsSelected}
                          rightIcon="minus"
                          intent="success"
                          loading={uploading}
                        >
                          Remove selected
                        </Button>
                        <Button
                          onClick={removeAllUploadItems}
                          disabled={!uploadList.length}
                          rightIcon="minus"
                          intent="success"
                          loading={uploading}
                        >
                          Remove all
                        </Button>
                      </div>
                      {uploadList.length ? (
                        <div className="mt-4">
                          <CardList bordered={false}>{renderCards()}</CardList>
                        </div>
                      ) : (
                        <div className="flex p-8">
                          <Callout intent="primary">No files selected</Callout>
                        </div>
                      )}
                    </div>
                    <div className="w-1/3 overflow-auto">
                      <h1 className="text-base font-bold p-0 m-0">
                        Select destination in OMERO
                      </h1>
                      {state.omeroFileTreeData && (
                        <div className="mt-4">
                          <OmeroDataBrowser
                            onSelectCallback={(nodeData) =>
                              handleFileTreeSelection(nodeData, "omero")
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <Divider className="my-10" />
                  <div className="flex items-center place-content-between">
                    <Card className="ml-12">
                      <span className="text-base">{`${uploadList.length} file${
                        uploadList.length > 1 || uploadList.length === 0
                          ? "s"
                          : ""
                      } selected for upload`}</span>
                    </Card>
                    <Icon icon="circle-arrow-right" size={24} color="grey" />
                    <Card>
                      <span className="text-base">{`Upload destination: ${state.omeroFileTreeSelection[0]}`}</span>
                    </Card>
                    <Icon icon="circle-arrow-right" size={24} color="grey" />
                    <Button
                      onClick={handleUpload}
                      disabled={
                        !uploadList.length ||
                        !state.omeroFileTreeSelection.length
                      }
                      rightIcon="cloud-upload"
                      intent="success"
                      loading={uploading}
                      large={true}
                      className="mr-12"
                    >
                      Add to upload queue
                    </Button>
                  </div>
                </div>
              ) : null
            }
          />

          <Tab
            id="Monitor"
            title="Monitor"
            icon="dashboard"
            panel={
              loadedTabs.Monitor ? (
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

          {state?.user?.isAdmin && (
            <Tab
              id="Admin"
              title="Admin"
              icon="settings"
              panel={
                loadedTabs.Admin ? (
                  <AdminPanel />
                ) : null
              }
            />
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default UploaderApp;
