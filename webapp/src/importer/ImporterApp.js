import { useEffect, useState, useRef } from "react";
import { useAppContext } from "../AppContext";
import FileBrowser from "./components/FileBrowser";
import OmeroDataBrowser from "../shared/components/OmeroDataBrowser";
import GroupSelect from "../shared/components/GroupSelect";
import AdminPanel from "./components/AdminPanel";
import ResumableUploader from "./components/ResumableUploader";
import {
  Tabs,
  Tab,
  H4,
  Button,
  ButtonGroup,
  CardList,
  Card,
  Callout,
  Classes,
  Icon,
  Tooltip,
  HTMLTable,
  Tag,
  Spinner,
  InputGroup,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import NewContainerOverlay from "./components/NewContainerOverlay";
import MetadataForms from "./components/MetadataForms";
import { fetchMetabaseData } from "../apiService";
import DateFilterControl from "../shared/components/DateFilterControl";
import { createDateFilter } from "../shared/dateFilters";

export const MonitorPanel = ({ isAdmin, metabaseUrl }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [dateFilter, setDateFilter] = useState(() => createDateFilter("all"));
  const pageSize = 50;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchMetabaseData(
        "imports",
        currentPage,
        searchTerm,
        pageSize,
        dateFilter
      );
      if (response && response.data && response.data.rows) {
        const mapped = mapRowsToObjects(response.data.cols, response.data.rows);
        setData(mapped);
        setTotalRows(response.data.total_rows || response.data.rows.length);
      } else {
        setData([]);
        setTotalRows(0);
      }
    } catch (err) {
      console.error("Failed to load monitor data:", err);
      setError("Failed to load import status data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, [currentPage, searchTerm, dateFilter]);

  const mapRowsToObjects = (cols, rows) => {
    if (!cols || !rows) return [];
    const colNames = cols.map((c) => c.name);
    return rows.map((row) => {
      const obj = {};
      colNames.forEach((name, idx) => {
        obj[name] = row[idx] !== undefined ? row[idx] : null;
      });
      return obj;
    });
  };

  const getStageTagIntent = (stage) => {
    if (!stage) return "none";
    const s = stage.toLowerCase();
    if (s.includes("completed")) return "success";
    if (s.includes("failed")) return "danger";
    if (s.includes("pending") || s.includes("running") || s.includes("preprocess")) return "warning";
    return "primary";
  };

  const getRowClass = (stage) => {
    if (!stage) return "hover:bg-gray-50 dark:hover:bg-gray-800/40";
    const s = stage.toLowerCase();
    if (s.includes("failed")) {
      return "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-900/10 dark:hover:bg-red-900/20";
    }
    if (s.includes("completed")) {
      return "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-900/10 dark:hover:bg-green-900/20";
    }
    return "hover:bg-gray-50 dark:hover:bg-gray-800/40";
  };

  const formatFileList = (fileNamesStr) => {
    try {
      const files = JSON.parse(fileNamesStr);
      if (Array.isArray(files) && files.length > 0) {
        if (files.length === 1) return files[0];
        return (
          <ul className="list-disc pl-4 m-0">
            {files.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        );
      }
    } catch (_) {
      // ignore
    }
    return fileNamesStr || "-";
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString();
    } catch (_) {
      return dateStr;
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleDateFilterChange = (nextFilter) => {
    setCurrentPage(1);
    setDateFilter(nextFilter);
  };

  const totalPages = Math.ceil(totalRows / pageSize);

  return (
    <div className="flex flex-col h-[calc(100vh-225px)]">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <div>
          <H4>Monitor</H4>
          <div className={Classes.TEXT_MUTED}>
            View active import progress or historical data. Click on links in the Dataset/Screen column to navigate directly to them in OMERO.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateFilterControl
            value={dateFilter}
            onChange={handleDateFilterChange}
          />
          <InputGroup
            placeholder="Filter by filename, stage, user..."
            leftIcon="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "300px" }}
          />
          <Button icon="refresh" onClick={loadData} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading && data.length === 0 ? (
        <div className="flex justify-center p-12 flex-grow">
          <Spinner size={50} />
        </div>
      ) : error ? (
        <div className="flex-grow overflow-auto min-h-0">
          <Callout intent="danger" title="Error loading data">
            {error}
          </Callout>
        </div>
      ) : totalRows === 0 ? (
        <div className="flex-grow overflow-auto min-h-0">
          <Callout intent="warning">
            No import records found.
          </Callout>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0">
          <div className="flex-grow overflow-auto">
            <HTMLTable bordered className="w-full align-middle">
              <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
                <tr>
                  <th>File Names</th>
                  <th>Stage</th>
                  <th>Dataset/Screen</th>
                  <th>UUID</th>
                  <th>Timestamp</th>
                  <th>Elapsed Time</th>
                  <th>Group</th>
                  <th>User</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.uuid} className={getRowClass(item.stage)}>
                    <td className="max-w-xs break-all">
                      {formatFileList(item.file_names)}
                    </td>
                    <td>
                      <Tag intent={getStageTagIntent(item.stage)} minimal>
                        {item.stage || "Unknown"}
                      </Tag>
                    </td>
                    <td>
                      {item["Dataset/Screen"] ? (
                        <a
                          href={`/webclient/?show=${(item.destination_type || "Dataset").toLowerCase()}-${item["Dataset/Screen"]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center"
                        >
                          <Icon icon="link" size={12} className="mr-1" />
                          {item.destination_type || "Dataset"} {item["Dataset/Screen"]}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {item.uuid ? (
                        <div className="flex items-center space-x-1">
                          <code className={Classes.MONOSPACE_TEXT}>
                            {item.uuid.substring(0, 8)}...
                          </code>
                          <Tooltip content="Copy UUID" compact>
                            <Button
                              icon="duplicate"
                              minimal
                              small
                              onClick={() => copyToClipboard(item.uuid)}
                            />
                          </Tooltip>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="whitespace-nowrap">{formatDate(item.timestamp)}</td>
                    <td className="whitespace-nowrap">{item.elapsed_time || "-"}</td>
                    <td>{item.group_name || "-"}</td>
                    <td>{item.user_name || "-"}</td>
                    <td className={`${Classes.TEXT_MUTED} max-w-xs truncate`}>{item.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </div>
          {totalRows > pageSize && (
            <div className="flex-shrink-0 flex justify-between items-center pt-3">
              <span className={Classes.TEXT_MUTED}>
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRows)} of {totalRows} entries
              </span>
              <ButtonGroup>
                <Button
                  icon="double-chevron-left"
                  minimal
                  small
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                />
                <Button
                  icon="chevron-left"
                  small
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                >
                  Previous
                </Button>
                <span className="flex items-center px-3">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  rightIcon="chevron-right"
                  small
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  Next
                </Button>
                <Button
                  icon="double-chevron-right"
                  minimal
                  small
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                />
              </ButtonGroup>
            </div>
          )}
        </div>
      )}
      
      {isAdmin && metabaseUrl && (
        <Callout intent="primary" className="flex-shrink-0 mt-4">
          <div className="flex items-center justify-between gap-4">
            <span>
              Administrators can access the raw Metabase interface for query builders and reports.
            </span>
            <Button
              icon="share"
              minimal
              small
              text="Open Metabase Interface"
              href={metabaseUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </div>
        </Callout>
      )}
    </div>
  );
};

const ImporterApp = () => {
  const {
    state,
    updateState,
    loadOmeroTreeData,
    loadFolderData,
    loadGroups,
    loadGroupMappings,
    uploadSelectedData,
    createNewContainer,
    toaster,
    loadBiomeroConfig,
    apiLoading,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState("Import");
  const [metabaseError, setMetabaseError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState({
    Import: true,
    Upload: false,
    Monitor: false,
    Admin: false,
  });
  const [uploadList, setUploadList] = useState([]);
  const [areUploadItemsSelected, setAreUploadItemsSelected] = useState(false);

  // Derived state for uploader availability
  const useUploader =
    state.config?.UPLOADER?.enabled === true ||
    state.config?.UPLOADER?.enabled === "True";

  const getCurrentGroupFolder = () => {
    const activeGroupId = state.user.active_group_id;
    const mapping = state.groupFolderMappings[activeGroupId];
    return mapping?.folder || "root";  // Default to "root" if no mapping exists
  };

  const [isNewContainerOverlayOpen, setIsNewContainerOverlayOpen] =
    useState(false);
  const [newContainerName, setNewContainerName] = useState("");
  const [newContainerDescription, setContainerDescription] = useState("");
  const [newContainerType, setNewContainerType] = useState("");
  const [selectedOmeroTarget, setSelectedOmeroTarget] = useState(null);
  const [
    lastSelectedLocalFileTreeNodeMeta,
    setLastSelectedLocalFileTreeNodeMeta,
  ] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = async () => {
    await loadOmeroTreeData();
    setRefreshKey((prev) => prev + 1);
  };

  const openCreateContainerOverlay = (isOpen, type) => {
    setIsNewContainerOverlayOpen(isOpen);
    setNewContainerType(type);
  };

  const handleFileTreeSelection = (
    nodeData,
    coords,
    e,
    type,
    deselect = false
  ) => {
    const nodeIds = Array.isArray(nodeData) ? nodeData : [nodeData.id];

    const selectionKey =
      type === "local" ? "localFileTreeSelection" : "omeroFileTreeSelection";
    let updatedSelection = [...state[selectionKey]];

    nodeIds.forEach((nodeId) => {
      const itemData =
        type === "local"
          ? state.localFileTreeData[nodeId]
          : state.omeroFileTreeData[nodeId];

      if (type === "local" && itemData && itemData.isFolder) {
        return; // Skip folders
      }

      if (deselect === true) {
        // Explicitly remove from selection
        updatedSelection = updatedSelection.filter((id) => id !== nodeId);
      } else if (type === "local") {
        // Remove from selection if already selected
        if (updatedSelection.includes(nodeId)) {
          updatedSelection = updatedSelection.filter((id) => id !== nodeId);
        } else {
          // Add to selection
          updatedSelection.push(nodeId);
        }
      } else {
        // Explicitly add to selection
        if (!updatedSelection.includes(nodeId)) {
          if (type === "omero") {
            updatedSelection = [nodeId];
          } else {
            updatedSelection.push(nodeId);
          }
        }
      }
    });

    // Update the state with the new selection
    if (deselect) {
      setLastSelectedLocalFileTreeNodeMeta(null);
    } else if (type === "local" && coords) {
      setLastSelectedLocalFileTreeNodeMeta({ coords, nodeId: nodeIds[0] });
    }

    updateState({ [selectionKey]: updatedSelection });

    // Update the selected target for creating new containers
    if (type === "omero" && updatedSelection.length === 1) {
      const selectedItem = state.omeroFileTreeData[updatedSelection[0]];
      setSelectedOmeroTarget(selectedItem);
    }

    // Handle shift key selection for local file tree
    const isShiftKeyPressed = e.shiftKey;
    if (isShiftKeyPressed && type === "local" && coords) {
      // Check if last selected node is of the same parent (coords array has same length, and all but last element are equal)
      const isSameParent =
        lastSelectedLocalFileTreeNodeMeta &&
        lastSelectedLocalFileTreeNodeMeta.coords.length === coords.length &&
        lastSelectedLocalFileTreeNodeMeta.coords
          .slice(0, -1)
          .every((coord, index) => coord === coords[index]);

      if (isSameParent) {
        // Find item that has last-selected id under children
        const selectedNodeId = nodeIds[0];
        const lastSelectedNodeId = lastSelectedLocalFileTreeNodeMeta.nodeId;

        const selectedParentNode = Object.values(state.localFileTreeData).find(
          (node) => node.children.includes(selectedNodeId)
        );
        const siblingNodeIds = selectedParentNode.children || [];

        const selectedNodeIdIndex = siblingNodeIds.indexOf(selectedNodeId);
        const lastSelectedNodeIdIndex =
          siblingNodeIds.indexOf(lastSelectedNodeId);
        // Get all nodes between the first and last selected node
        const start = Math.min(selectedNodeIdIndex, lastSelectedNodeIdIndex);
        const end = Math.max(selectedNodeIdIndex, lastSelectedNodeIdIndex);
        const nodesBetween = siblingNodeIds.slice(start + 1, end + 1);
        // Exclude already selected nodes
        const alreadySelectedNodes = updatedSelection.filter((id) =>
          nodesBetween.includes(id)
        );
        const nodesToSelect = nodesBetween.filter(
          (id) => !alreadySelectedNodes.includes(id)
        );
        // Re-add the last selected node
        nodesToSelect.push(selectedNodeId);

        handleFileTreeSelection(
          nodesToSelect,
          null,
          { shiftKey: false },
          "local",
          false
        );
      }
    }
  };

  const handleUpload = async () => {
    const nodeId = state.omeroFileTreeSelection[0];
    const isScreenDest = nodeId && nodeId.includes("screen-");
    const isDatasetDest = nodeId && nodeId.includes("dataset-");

    const isScreenFile = (item) => {
      if (!item) return false;
      const filename = item.filename || item.data || "";
      if (filename.toLowerCase().endsWith(".db")) return true;
      if (filename.toLowerCase().endsWith(".icarch")) return true;
      if (item.metadata && item.metadata.zarr_type === "plate") return true;
      return false;
    };

    if (isDatasetDest) {
      const hasScreenFiles = uploadList.some(item => isScreenFile(item));
      if (hasScreenFiles) {
        toaster.show({
          message: "Cannot import Screen data (.db files or Zarr screens) into a Dataset. Please remove screen files from the list or select a Screen destination.",
          intent: "danger",
        });
        return;
      }
    } else if (isScreenDest) {
      const hasNonScreenFiles = uploadList.some(item => !isScreenFile(item));
      if (hasNonScreenFiles) {
        toaster.show({
          message: "Cannot import standard files into a Screen. Only .db and Zarr screen files are supported for Screen import. Please remove standard files from the list.",
          intent: "danger",
        });
        return;
      }
    }

    setUploading(true);

    // Enhanced path construction to handle UUID-based items
    const selectedLocal = uploadList.map((item) => {
      const itemPath = findPathToTreeLeaf(item.value, state.localFileTreeData);
      const pathString = itemPath.slice(1).join("/"); // skip Root node

      // Check if this is a UUID-based item (has # in the value)
      if (item.value.includes("#")) {
        const [filePath, uuid] = item.value.split("#");

        // For UUID items, we want the file path up to the container file/directory
        const fileExtensions = [".lif", ".xlef", ".lof", ".zarr"];
        const hasKnownExtension = fileExtensions.some((ext) =>
          filePath.toLowerCase().includes(ext)
        );

        if (hasKnownExtension) {
          // Use the filePath directly - this already contains the correct path to the .lif file
          // e.g., "Project A/LIF/Test-subs_copies.lif"
          return {
            localPath: filePath,
            uuid: uuid
          };
        }
      }

      // Backward compatible: return simple path string for regular files
      return {
        localPath: pathString,
        uuid: null
      };
    });

    const selectedOmero = state.omeroFileTreeSelection
      .map((index) => {
        const omeroItem = state.omeroFileTreeData[index];
        return omeroItem ? [omeroItem.category, omeroItem.id] : null;
      })
      .filter(Boolean);

    const uploadData = {
      selectedLocal,
      selectedOmero,
      group: state.user.groups.find((g) => g.id === state.user.active_group_id)
        ?.name,
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
    // Only allow selection of screens as target if active tab is ImportScreens
    // Only allow selection of dataset or screen as target
    const nodeId = state.omeroFileTreeSelection[0];
    const isScreenDest = nodeId.includes("screen-");
    const isDatasetDest = nodeId.includes("dataset-");
    
    if (!isScreenDest && !isDatasetDest && activeTab === "Import") {
      toaster.show({
        message: "Please select a Dataset or Screen as import destination",
        intent: "warning",
      });
      return;
    }

    // Helper to identify screen files (.db files or Zarr screens/plates)
    const isScreenFile = (item) => {
      if (!item) return false;
      const filename = item.data || "";
      if (filename.toLowerCase().endsWith(".db")) return true;
      if (filename.toLowerCase().endsWith(".icarch")) return true;
      if (item.metadata && item.metadata.zarr_type === "plate") return true;
      return false;
    };
    
    // Validate selection against destination type
    const selectedItems = state.localFileTreeSelection.map(id => state.localFileTreeData[id]);
    
    if (isDatasetDest) {
      const hasScreenFiles = selectedItems.some(item => isScreenFile(item));
      if (hasScreenFiles) {
        toaster.show({
          message: "Cannot import Screen data (.db files or Zarr screens) into a Dataset. Please select a Screen destination.",
          intent: "danger",
        });
        return;
      }
    } else if (isScreenDest) {
      const hasNonScreenFiles = selectedItems.some(item => !isScreenFile(item));
      if (hasNonScreenFiles) {
         toaster.show({
          message: "Cannot import standard files into a Screen. Only .db and Zarr screen files are supported for Screen import.",
          intent: "danger",
        });
        return;
      }
    }
    
    const omeroPath = findPathToTreeLeaf(nodeId, state.omeroFileTreeData);
    const pathString = omeroPath.join("/");

    const newUploadList = state.localFileTreeSelection
      .filter(
        (item) => !uploadList.some((uploadItem) => uploadItem.value === item)
      )
      .map((item) => {
        const itemData = state.localFileTreeData[item];
        return {
          value: item,
          isSelected: false,
          filename: itemData.data,
          omeroPath: pathString,
          ...itemData,
        };
      });
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

  const selectItem = (item, e) => {
    const clickedIndex = uploadList.findIndex(
      (uploadItem) => uploadItem.value === item.value
    );
    let newUploadList = [...uploadList];

    if (e.shiftKey && lastSelectedIndex !== null) {
      const [start, end] = [lastSelectedIndex, clickedIndex].sort(
        (a, b) => a - b
      );
      for (let i = start; i <= end; i++) {
        newUploadList[i] = { ...newUploadList[i], isSelected: true };
      }
    } else {
      newUploadList = uploadList.map((uploadItem) =>
        uploadItem.value === item.value
          ? { ...uploadItem, isSelected: !uploadItem.isSelected }
          : uploadItem
      );
      setLastSelectedIndex(clickedIndex);
    }

    const areItemsSelected = newUploadList.some((item) => item.isSelected);
    setUploadList(newUploadList);
    setAreUploadItemsSelected(areItemsSelected);
  };

  const findPathToTreeLeaf = (nodeId, tree) => {
    const dfs = (currentNode, path) => {
      if (currentNode === nodeId) return path.concat(tree[currentNode]?.data);
      const children = tree[currentNode]?.children || [];
      for (const child of children) {
        const result = dfs(child, path.concat(tree[currentNode]?.data));
        if (result) return result;
      }
      return null;
    };
    return dfs("root", []);
  };

  const selectedOmeroPath =
    state.omeroFileTreeSelection.length > 0
      ? findPathToTreeLeaf(
          state.omeroFileTreeSelection[0],
          state.omeroFileTreeData
        ).join("/")
      : "";

  const renderCards = () => {
    // TODO
    return uploadList.map((item) => {
      const itemPath = findPathToTreeLeaf(item.value, state.localFileTreeData);
      const itemPathString = itemPath.join("/");
      return (
        <Card
          key={item.value}
          interactive={true}
          className="text-sm m-1 pl-3 flex flex-col"
          selected={item.isSelected}
          onClick={(e) => selectItem(item, e)}
        >
          <div className="flex items-center place-content-between w-full">
            <div className="select-none">{item.filename}</div>
            <div>
              {/* deselect button*/}
              <Icon
                icon="cross"
                onClick={(e) => {
                  e.stopPropagation();
                  setUploadList((prevList) =>
                    prevList.filter(
                      (uploadItem) => uploadItem.value !== item.value
                    )
                  );
                }}
                color="red"
                className="cursor-pointer ml-3"
                size={16}
              />
            </div>
          </div>
          <div className="text-xs text-gray-500 text-align-left w-full select-none">
            {"Source path: " + itemPathString}
          </div>
        </Card>
      );
    });
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
    loadBiomeroConfig();
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
      newContainerName,
      newContainerDescription,
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

  const renderUploadPanel = () => {
    let datasetId = null;
    let datasetType = null;
    if (state.omeroFileTreeSelection.length > 0) {
      const selectedNode = state.omeroFileTreeSelection[0];
      const parts = selectedNode.split("-");
      if (parts.length === 2) {
        datasetType = parts[0];
        datasetId = parts[1];
      }
    }

    if (datasetType) {
      datasetType = datasetType.charAt(0).toUpperCase() + datasetType.slice(1);
    }

    const groupName = state.user.groups.find(
      (g) => g.id === state.user.active_group_id
    )?.name;

    return (
      <div className="h-full">
        <div className="mb-4">
          <Callout intent="primary" icon="info-sign">
            Upload images directly from your computer. Select a destination Dataset or Screen on the left, drop or select files on the right, and click Upload.
          </Callout>
        </div>
        <div className="flex space-x-4">
          <div className="w-1/4 overflow-auto pt-2">
          <div className="flex items-center">
            <h1 className="text-base font-bold p-0 m-0">
              1. Select destination in OMERO
            </h1>
            <Tooltip
              content="Create new dataset"
              placement="bottom"
              usePortal={false}
              className="text-md"
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
              className="text-md"
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
              className="text-md"
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
            <div className="mt-4 max-h-[calc(100vh-450px)] overflow-auto">
              <OmeroDataBrowser
                onSelectCallback={(nodeData, coords, e, deselect = false) =>
                  handleFileTreeSelection(
                    nodeData,
                    coords,
                    e,
                    "omero",
                    deselect
                  )
                }
              />
            </div>
          )}
        </div>

        <div className="w-3/4 pt-2">
          <h1 className="text-base font-bold p-0 m-0 mb-4">2. Upload Files</h1>
          <ResumableUploader
            datasetId={datasetId}
            datasetType={datasetType}
            group={groupName}
            groupId={state.user.active_group_id}
          />
        </div>
        </div>
      </div>
    );
  };

  const renderImportPanel = () => {
    const omeroFileTreeTitle = "1. Select destination (Dataset/Screen)";
    const localFileTreeTitle = "2. Select files/folders to import";

    const disableAddFilesButton =
      state.localFileTreeSelection.length === 0 ||
      state.omeroFileTreeSelection.length === 0;

    return (
      <div className="h-full">
        <div className="mb-4">
          <Callout intent="primary" icon="info-sign">
            Import images or screens from your group&apos;s predefined network location.
          </Callout>
        </div>
        <div className="flex space-x-4">
          <div className="w-1/4 overflow-auto pt-2">
            <div className="flex items-center">
              <h1 className="text-base font-bold p-0 m-0">
                {omeroFileTreeTitle}
              </h1>
              <Tooltip
                content="Create new dataset"
                placement="bottom"
                usePortal={false}
                className="text-md"
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
                className="text-md"
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
                className="text-md"
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
              <Tooltip
                content="Refresh file tree"
                placement="bottom"
                usePortal={false}
                className="text-md"
              >
                <Icon
                  icon="refresh"
                  onClick={handleRefresh}
                  disabled={apiLoading}
                  color="#5c7080"
                  className={`cursor-pointer ml-3 ${apiLoading ? "opacity-50" : ""}`}
                  size={20}
                />
              </Tooltip>
            </div>
            {state.omeroFileTreeData && (
              <div className="mt-4 max-h-[calc(100vh-450px)] overflow-auto">
                <OmeroDataBrowser
                  key={refreshKey}
                  onSelectCallback={(nodeData, coords, e, deselect = false) =>
                    handleFileTreeSelection(
                      nodeData,
                      coords,
                      e,
                      "omero",
                      deselect
                    )
                  }
                />
              </div>
            )}
          </div>
          <div className="w-1/4 overflow-auto pt-2">
            <div className="flex space-x-4 items-center">
              <h1 className="text-base font-bold p-0 m-0 inline-block">
                {localFileTreeTitle}
              </h1>
              <Tooltip
                content={disableAddFilesButton ? "Select destination in omero and files first" : "Add selected files to import list"}
                placement="bottom"
                usePortal={false}
                className="text-md"
              >
                <Button
                  onClick={addUploadItems}
                  disabled={disableAddFilesButton}
                  rightIcon="plus"
                  intent="success"
                  loading={uploading}
                >
                  Add to import list
                </Button>
              </Tooltip>
            </div>
            {state.localFileTreeData && (
              <div className="mt-4 max-h-[calc(100vh-450px)] overflow-auto">
                <FileBrowser
                  onSelectCallback={(nodeData, coords, e, deselect = false) =>
                    handleFileTreeSelection(
                      nodeData,
                      coords,
                      e,
                      "local",
                      deselect
                    )
                  }
                  rootFolder={getCurrentGroupFolder()}
                />
              </div>
            )}
          </div>
          <div className="w-1/4 overflow-auto pt-2">
            <div className="flex space-x-4 items-center">
              <h1 className="text-base font-bold p-0 m-0 inline-block">
                3. Import list
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
              <div className="mt-4 max-h-[calc(100vh-450px)] overflow-auto">
                <CardList bordered={false}>{renderCards()}</CardList>
              </div>
            ) : (
              <div className="flex p-8">
                <Callout intent="primary">No files selected</Callout>
              </div>
            )}
          </div>
          
          <div className="w-1/4 overflow-auto pt-2">
            <div className="flex items-center">
              <h1 className="text-base font-bold p-0 m-0 inline-block">
                4. Attach metadata (optional)
              </h1>
            </div>
            <MetadataForms />
          </div>
        </div>

        <div className="absolute flex items-center place-content-between bg-slate-300 w-full p-8 mt-12 bottom-0 left-0">
          <Card className="ml-12">
            <span className="text-base">{`${uploadList.length} file${
              uploadList.length > 1 || uploadList.length === 0 ? "s" : ""
            } selected for import`}</span>
          </Card>
          <Icon icon="circle-arrow-right" size={24} color="grey" />
          <Card>
            <span className="text-base">{`Import destination: ${
              selectedOmeroPath || "None"
            }`}</span>
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
            Add to import queue
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="focus:outline-none focus:ring-0">
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center">
            <span className="text-base mr-4">Select group</span>
            <GroupSelect />
          </div>
        )}
      </div>

      <div className="p-4 overflow-hidden">
        <Tabs
          id="app-tabs"
          selectedTabId={activeTab}
          onChange={handleTabChange}
          className="focus:outline-none focus:ring-0"
        >
          <Tab
            id="Import"
            title="Import"
            icon="upload"
            panel={loadedTabs.Import ? renderImportPanel() : null}
            className="focus:outline-none focus:ring-0"
          />

          {useUploader && (
            <Tab
              id="Upload"
              title="Upload"
              icon="cloud-upload"
              panel={loadedTabs.Upload ? renderUploadPanel() : null}
              className="focus:outline-none focus:ring-0"
            />
          )}

          <Tab
            id="Monitor"
            title="Monitor"
            icon="dashboard"
            panel={
              loadedTabs.Monitor ? (
                <MonitorPanel
                  isAdmin={isAdmin}
                  metabaseUrl={metabaseUrl}
                />
              ) : null
            }
            className="focus:outline-none focus:ring-0"
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
              className="focus:outline-none focus:ring-0"
            />
          )}
        </Tabs>
      </div>
      <NewContainerOverlay
        isNewContainerOverlayOpen={isNewContainerOverlayOpen}
        toggleOverlay={toggleOverlay}
        newContainerName={newContainerName}
        setNewContainerName={setNewContainerName}
        newContainerDescription={newContainerDescription}
        setContainerDescription={setContainerDescription}
        handleCreate={handleCreateContainer}
        newContainerType={newContainerType}
        selectedOmeroTarget={selectedOmeroTarget}
      />
    </div>
  );
};

export default ImporterApp;
