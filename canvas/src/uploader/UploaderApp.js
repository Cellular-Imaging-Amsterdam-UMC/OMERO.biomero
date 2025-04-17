import React, { useEffect, useState } from "react";
import { useAppContext } from "../AppContext";
import FileBrowser from "./components/FileBrowser";
import OmeroDataBrowser from "../shared/components/OmeroDataBrowser";
import GroupSelect from "./components/GroupSelect";
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
  Tooltip,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import NewContainerOverlay from "./components/NewContainerOverlay";

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
    uploadSelectedData,
    createNewContainer,
    toaster,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState("UploadImages");
  const [metabaseError, setMetabaseError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({
    UploadImages: true,
    UploadScreens: false,
    Monitor: false,
  });
  const [uploadList, setUploadList] = useState([]);
  const [areUploadItemsSelected, setAreUploadItemsSelected] = useState(false);

  const [isNewContainerOverlayOpen, setIsNewContainerOverlayOpen] =
    useState(false);
  const [newContaineName, setNewContainerName] = useState("");
  const [newContaineDescription, setContainerDescription] = useState("");
  const [newContainerType, setNewContainerType] = useState("");
  const [selectedOmeroTarget, setSelectedOmeroTarget] = useState(null);

  const openCreateContainerOverlay = (isOpen, type) => {
    setIsNewContainerOverlayOpen(isOpen);
    setNewContainerType(type);
  };

  const handleFileTreeSelection = (nodeData, type) => {
    console.log("Selected node data:", nodeData);
    const nodeIds = Array.isArray(nodeData) ? nodeData : [nodeData.id];
    const selectionKey =
      type === "local" ? "localFileTreeSelection" : "omeroFileTreeSelection";
    let updatedSelection = [...state[selectionKey]];

    nodeIds.forEach((nodeId) => {
      const itemData =
        type === "local"
          ? state.localFileTreeData[nodeId]
          : state.omeroFileTreeData[nodeId];

      if (itemData && itemData.isFolder) {
        return; // Skip folders
      }

      if (updatedSelection.includes(nodeId)) {
        // Remove the node if it was already selected
        updatedSelection = updatedSelection.filter((id) => id !== nodeId);
      } else {
        // Add the node, with single selection for OMERO
        if (type === "omero") {
          updatedSelection = [nodeId];
        } else {
          updatedSelection.push(nodeId);
        }
      }
    });
    console.log("Updated selection:", updatedSelection);

    updateState({ [selectionKey]: updatedSelection });

    // Update the selected target for creating new containers
    if (type === "omero" && updatedSelection.length === 1) {
      const selectedItem = state.omeroFileTreeData[updatedSelection[0]];
      setSelectedOmeroTarget(selectedItem);
    }
  };

  const handleUpload = async () => {
    setUploading(true);

    const selectedLocal = uploadList.map((item) => item.value);
    const selectedOmero = state.omeroFileTreeSelection
      .map((index) => {
        const omeroItem = state.omeroFileTreeData[index];
        return omeroItem ? [omeroItem.category, omeroItem.id] : null;
      })
      .filter(Boolean); // Remove any null values

    const uploadData = { selectedLocal, selectedOmero };

    try {
      await uploadSelectedData(uploadData);
    } finally {
      setUploading(false);
      removeAllUploadItems();
    }
  };

  // We need to make sure only unique items are added to the upload list
  const addUploadItems = () => {
    // Only allow selection of screens as target if active tab is UploadScreens
    const nodeId = state.omeroFileTreeSelection[0];
    const isScreen = nodeId.includes("screen-");
    const isDataset = nodeId.includes("dataset-");
    if (!isScreen && activeTab === "UploadScreens") {
      // Show toast if the user tries to select something else
      toaster.show({
        message: "You can only select a screen as upload destination",
        intent: "warning",
      });
      return;
    } else if (!isDataset && activeTab === "UploadImages") {
      // Only allow selection of datasets if active tab is UploadImages
      if (!isDataset && activeTab === "UploadImages") {
        // Show toast if the user tries to select something else
        toaster.show({
          message: "You can only select a dataset as upload destination",
          intent: "warning",
        });
        return;
      }
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOverlay = () => {
    setIsNewContainerOverlayOpen(!isNewContainerOverlayOpen);
  };

  const handleCreateContainer = () => {
    const selectedOmeroNode = state.omeroFileTreeSelection[0];

    let targetContainerId = null;
    let targetContainerType = "dataset";

    if (selectedOmeroNode) {
      targetContainerType = selectedOmeroNode.split("-")[0];
      targetContainerId = selectedOmeroNode.split("-")[1];
    }

    if (
      !(targetContainerType === "project" && newContainerType === "dataset")
    ) {
      targetContainerId = null;
    }

    createNewContainer(
      newContainerType,
      newContaineName,
      newContaineDescription,
      targetContainerId,
      targetContainerType
    )
      .then(() => {
        loadOmeroTreeData();
        setNewContainerName("");
        setContainerDescription("");
      })
      .catch((error) => {
        console.error("Error creating new container:", error);
      })
      .finally(() => {
        setIsNewContainerOverlayOpen(false);
      });
  };

  const renderUploadPanel = (mode) => {
    const localFileTreeTitle = `Select ${mode}s to upload`;
    const omeroFileTreeTitle = `Select destination ${
      mode === "screen" ? "screen" : ""
    }in OMERO`;

    return (
      <div className="h-full">
        <div className="flex space-x-4">
          <div className="w-1/3 overflow-auto pt-2">
            <div className="flex space-x-4 items-center">
              <h1 className="text-base font-bold p-0 m-0 inline-block">
                {localFileTreeTitle}
              </h1>
              <Button
                onClick={addUploadItems}
                disabled={
                  state.localFileTreeSelection.length === 0 ||
                  state.omeroFileTreeSelection.length === 0
                }
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
                />
              </div>
            )}
          </div>
          <div className="w-1/3 overflow-auto pt-2">
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
          <div className="w-1/3 overflow-auto pt-2">
            <div className="flex items-center">
              <h1 className="text-base font-bold p-0 m-0">
                {omeroFileTreeTitle}
              </h1>
              <Tooltip
                content="Create new dataset"
                placement="bottom"
                usePortal={false}
              >
                <Icon
                  icon="folder-new"
                  onClick={() => {
                    openCreateContainerOverlay(true, "dataset");
                  }}
                  disabled={false}
                  tooltip="Create new dataset"
                  color="#99b882"
                  className="cursor-pointer ml-3"
                  size={20}
                />
              </Tooltip>
              <Tooltip
                content="Create new project"
                placement="bottom"
                usePortal={false}
                className="text-sm"
              >
                <Icon
                  icon="folder-new"
                  onClick={() => {
                    openCreateContainerOverlay(true, "project");
                  }}
                  disabled={false}
                  color="#76899e"
                  className="cursor-pointer ml-3"
                  size={20}
                />
              </Tooltip>
              <Tooltip
                content="Create new screen"
                placement="bottom"
                usePortal={false}
                className="text-sm"
              >
                <Icon
                  icon="folder-new"
                  onClick={() => {
                    openCreateContainerOverlay(true, "screen");
                  }}
                  disabled={false}
                  color="#393939"
                  className="cursor-pointer ml-3"
                  size={20}
                />
              </Tooltip>
            </div>
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
              uploadList.length > 1 || uploadList.length === 0 ? "s" : ""
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
              !uploadList.length || !state.omeroFileTreeSelection.length
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
    );
  };

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
            id="UploadImages"
            title="Upload images"
            icon="upload"
            panel={loadedTabs.UploadImages ? renderUploadPanel("image") : null}
          />
          <Tab
            id="UploadScreens"
            title="Upload screens"
            icon="upload"
            panel={
              loadedTabs.UploadScreens ? renderUploadPanel("screen") : null
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
      <NewContainerOverlay
        isNewContainerOverlayOpen={isNewContainerOverlayOpen}
        toggleOverlay={toggleOverlay}
        newContaineName={newContaineName}
        setNewContainerName={setNewContainerName}
        newContaineDescription={newContaineDescription}
        setContainerDescription={setContainerDescription}
        handleCreate={handleCreateContainer}
        newContainerType={newContainerType}
        selectedOmeroTarget={selectedOmeroTarget}
      />
    </div>
  );
};

export default UploaderApp;
