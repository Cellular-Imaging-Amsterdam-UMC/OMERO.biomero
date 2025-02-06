import React, { useEffect, useState } from "react";
import { useAppContext } from "./AppContext";
import FileBrowser from "./components/FileBrowser";
import OmeroDataBrowser from "./components/OmeroDataBrowser";
import GroupSelect from "./components/GroupSelect";
import {
  Tabs,
  Tab,
  H4,
  Button,
  CardList,
  Card,
  Callout,
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
    <div className="p-4 h-full overflow-hidden">
      {!metabaseError ? (
        <iframe
          title="Metabase dashboard"
          src={iframeUrl}
          className="w-full h-[800px]"
          frameBorder="0"
          onError={() => setMetabaseError(true)}
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
    loadOmeroTreeData,
    loadFolderData,
    loadGroups,
    uploadSelectedData,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState("Upload");
  const [metabaseError, setMetabaseError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({
    Upload: true,
    Monitor: false,
  });
  const [selectedLocal, setSelectedLocal] = useState([]);
  const [selectedOmero, setSelectedOmero] = useState([]);
  const [uploadList, setUploadList] = useState([]);
  const [areUploadItemsSelected, setAreUploadItemsSelected] = useState(false);

  const handleLocalSelection = (items) => {
    const selectedItems = items.map((item) => {
      return { value: item, isSelected: false };
    });

    setSelectedLocal(selectedItems);
  };
  const handleOmeroSelection = (items) => setSelectedOmero(items);

  const handleUpload = async () => {
    setUploading(true);
    const uploadData = { selectedLocal, selectedOmero };
    console.log("Uploading", uploadData);
    try {
      await uploadSelectedData(uploadData);
    } finally {
      setUploading(false);
    }
  };

  // We need to make sure only unique items are added to the upload list
  const addUploadItems = () => {
    const newUploadList = selectedLocal
      .filter(
        (item) =>
          !uploadList.some((uploadItem) => uploadItem.value === item.value)
      )
      .map((item) => ({ value: item.value, isSelected: false }));
    setUploadList([...uploadList, ...newUploadList]);
    setSelectedLocal([]);
  };

  const removeUploadItems = () => {
    const newUploadList = uploadList.filter((item) => !item.isSelected);
    setUploadList(newUploadList);
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
  const iframeUrl = `${metabaseUrl}/embed/dashboard/${metabaseToken}#bordered=true&titled=true&refresh=20`;

  useEffect(() => {
    loadOmeroTreeData();
    loadFolderData();
    loadGroups();
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
                <div className="flex space-x-4">
                  <div className="w-2/5 overflow-auto">
                    <div className="flex space-x-4 items-center">
                      <h1 className="text-base font-bold p-0 m-0 inline-block">
                        Select files to upload
                      </h1>
                      <Button
                        onClick={addUploadItems}
                        disabled={selectedLocal.length === 0}
                        rightIcon="plus"
                        intent="success"
                        loading={uploading}
                      >
                        Add to upload list
                      </Button>
                    </div>
                    {state.folderData && (
                      <div className="mt-4">
                        <FileBrowser onSelectCallback={handleLocalSelection} />
                      </div>
                    )}
                  </div>
                  <div className="w-2/5 overflow-auto">
                    <div className="flex space-x-4 items-center">
                      <h1 className="text-base font-bold p-0 m-0 inline-block">
                        Upload list
                      </h1>
                      <Button
                        onClick={removeUploadItems}
                        disabled={!areUploadItemsSelected}
                        rightIcon="plus"
                        intent="success"
                        loading={uploading}
                      >
                        Remove from upload list
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
                  <div className="w-2/5 overflow-auto">
                    <h1 className="text-base font-bold p-0 m-0">
                      Select destination in OMERO
                    </h1>
                    {state.omeroTreeData && (
                      <div className="mt-4">
                        <OmeroDataBrowser
                          onSelectCallback={handleOmeroSelection}
                        />
                      </div>
                    )}
                  </div>
                  <div className="w-1/5 flex items-center justify-center">
                    <Button
                      onClick={handleUpload}
                      disabled={
                        selectedLocal.length === 0 && selectedOmero.length === 0
                      }
                      rightIcon="upload"
                      intent="success"
                      loading={uploading}
                    >
                      Upload
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
        </Tabs>
      </div>
    </div>
  );
};

export default UploaderApp;
