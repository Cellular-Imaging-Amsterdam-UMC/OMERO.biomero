import React, { useState, useEffect, useRef } from "react";
import { useAppContext } from "../AppContext";
import TabContainer from "./components/TabContainer";
import RunPanel from "./components/RunPanel";
import GroupSelect from "../shared/components/GroupSelect"; // Add this import
import SlurmStatusIndicator from "../shared/components/SlurmStatusIndicator";
import {
  Tabs,
  Tab,
  H4,
  Tooltip,
  H6,
  Tag,
  Spinner,
  InputGroup,
  Button,
  ButtonGroup,
  Callout,
  Classes,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import { fetchMetabaseData } from "../apiService";
import SettingsForm from "./components/SettingsForm";
import DateFilterControl from "../shared/components/DateFilterControl";
import ResizableTable from "../shared/components/ResizableTable";
import { createDateFilter } from "../shared/dateFilters";

const WORKFLOW_STATUS_COLUMNS = [
  { key: "workflow_id", label: "Workflow ID", width: 120, minWidth: 100 },
  { key: "name", label: "Name", width: 150, minWidth: 100 },
  { key: "main_task", label: "Main Task Name", width: 170, minWidth: 120 },
  { key: "status", label: "Status", width: 110, minWidth: 90 },
  { key: "progress", label: "Progress", width: 90, minWidth: 75 },
  { key: "start_time", label: "Start Time", width: 160, minWidth: 140 },
  { key: "task", label: "Task", width: 130, minWidth: 90 },
  { key: "group", label: "Group", width: 90, minWidth: 70 },
  { key: "user", label: "User", width: 90, minWidth: 70 },
];

const RunTab = ({ onWorkflowError }) => (
  <div className="max-h-[calc(100vh-225px)] overflow-y-auto">
    <H4>Run image analysis workflows</H4>
    <div className="flex">
      <div className="w-full p-4 flex-1">
        <RunPanel onWorkflowError={onWorkflowError} />
      </div>
    </div>
    <H6>
      Powered by{" "}
      <a
        href="https://github.com/NL-BioImaging/biomero"
        target="_blank"
        rel="noopener noreferrer"
      >
        BIOMERO.analyzer
      </a>.
    </H6>
    <div className="bp5-form-group">
        <div className="bp5-form-content">
          <div className="bp5-form-helper-text">
            If you use this software in your work, please cite it using the following metadata:
          </div>      
          <div className="bp5-form-helper-text">
            Luik, T. T., Rosas-Bertolini, R., Reits, E. A., Hoebe, R. A., & Krawczyk, P. M. (2024). BIOMERO: A scalable and extensible image analysis framework. Patterns, 5(8). <a
              href="https://doi.org/10.1016/j.patter.2024.101024"
              target="_blank"
              rel="noopener noreferrer"
            >https://doi.org/10.1016/j.patter.2024.101024</a>
          </div>
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
  }, []);

  return (
    <div className="max-h-[calc(100vh-225px)] overflow-y-auto">
      <H4>Admin</H4>
      <div className="flex">
        <div className="w-1/2 p-4 max-h-[calc(100vh-250px)] overflow-y-auto">
          <SettingsForm />
        </div>
        <div className="w-1/2 p-4 flex flex-col">
          {state.scripts?.length > 0 ? (
            <TabContainer />
          ) : (
            <p>Loading scripts...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const StatusPanel = ({ isAdmin, metabaseUrl }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState(() => createDateFilter("all"));
  const pageSize = 50;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchMetabaseData(
        "workflows",
        1,
        "",
        pageSize,
        dateFilter
      );
      if (response && response.data && response.data.rows) {
        const mapped = mapRowsToObjects(response.data.cols, response.data.rows);
        setData(mapped);
      } else {
        setData([]);
      }
    } catch (err) {
      console.error("Failed to load workflows status data:", err);
      setError("Failed to load workflow status data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, [dateFilter]);

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

  const getStatusTagIntent = (status) => {
    if (!status) return "none";
    const s = status.toLowerCase();
    if (s.includes("done") || s.includes("completed") || s.includes("success")) return "success";
    if (s.includes("failed") || s.includes("error")) return "danger";
    if (s.includes("running")) return "primary";
    if (s.includes("pending") || s.includes("job_pending")) return "warning";
    return "primary";
  };

  const getRowClass = (status) => {
    if (!status) return "hover:bg-gray-50 dark:hover:bg-gray-800/40";
    const s = status.toLowerCase();
    if (s.includes("failed") || s.includes("error")) {
      return "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-900/10 dark:hover:bg-red-900/20";
    }
    if (s.includes("done") || s.includes("completed") || s.includes("success")) {
      return "bg-green-50/70 hover:bg-green-100/70 dark:bg-green-900/10 dark:hover:bg-green-900/20";
    }
    return "hover:bg-gray-50 dark:hover:bg-gray-800/40";
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

  const filteredData = data.filter((item) => {
    const search = searchTerm.toLowerCase();
    const name = String(item.name || "").toLowerCase();
    const mainTask = String(item.main_task_name || "").toLowerCase();
    const status = String(item.status || "").toLowerCase();
    const wfId = String(item.workflow_id || "").toLowerCase();
    return name.includes(search) || mainTask.includes(search) || status.includes(search) || wfId.includes(search);
  });

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="flex flex-col h-[calc(100vh-225px)]">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <div>
          <H4>Status</H4>
          <div className={Classes.TEXT_MUTED}>
            View your active BIOMERO workflow progress or historical execution records.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateFilterControl
            value={dateFilter}
            onChange={handleDateFilterChange}
          />
          <InputGroup
            placeholder="Filter by name, workflow ID, status..."
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
      ) : filteredData.length === 0 ? (
        <div className="flex-grow overflow-auto min-h-0">
          <Callout intent="warning">
            No workflow tracking records found.
          </Callout>
        </div>
      ) : (
        <div className="flex-grow flex flex-col min-h-0">
          <div className="flex-grow overflow-auto">
            <ResizableTable
              columns={WORKFLOW_STATUS_COLUMNS}
              storageKey="workflow-status"
            >
              {paginatedData.map((item) => (
                  <tr key={item.workflow_id} className={getRowClass(item.status)}>
                    <td>
                      {item.workflow_id ? (
                        <div className="flex items-center space-x-1">
                          <code className={Classes.MONOSPACE_TEXT}>
                            {item.workflow_id.substring(0, 8)}...
                          </code>
                          <Tooltip content="Copy Workflow ID" compact>
                            <Button
                              icon="duplicate"
                              minimal
                              small
                              onClick={() => copyToClipboard(item.workflow_id)}
                            />
                          </Tooltip>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{item.name || "-"}</td>
                    <td>{item.main_task_name || "-"}</td>
                    <td>
                      <Tag intent={getStatusTagIntent(item.status)} minimal>
                        {item.status || "Unknown"}
                      </Tag>
                    </td>
                    <td>{item.progress !== null && item.progress !== undefined ? `${item.progress}%` : "-"}</td>
                    <td className="whitespace-nowrap">{formatDate(item.start_time)}</td>
                    <td>{item.task || "-"}</td>
                    <td>{item.group || "-"}</td>
                    <td>{item.user || "-"}</td>
                  </tr>
              ))}
            </ResizableTable>
          </div>
          {filteredData.length > pageSize && (
            <div className="flex-shrink-0 flex justify-between items-center pt-3">
              <span className={Classes.TEXT_MUTED}>
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} entries
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

const BiomeroApp = () => {
  const {
    state,
    updateState,
    loadOmeroTreeData,
    loadFolderData,
    loadGroups,
    loadWorkflows,
    loadBiomeroConfig,
  } = useAppContext();
  const [metabaseError, setMetabaseError] = useState(false);
  const [activeTab, setActiveTab] = useState("Run");
  const [workflowError, setWorkflowError] = useState(false);
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
    loadBiomeroConfig();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // called only once

  const handleTabChange = (newTabId) => {
    if (!loadedTabs[newTabId]) {
      setLoadedTabs((prevState) => ({ ...prevState, [newTabId]: true }));
    }
    setActiveTab(newTabId);
  };

  const handleWorkflowError = () => {
    setWorkflowError(prev => !prev); // Toggle to trigger useEffect
  };

  const metabaseUrl = document
    .getElementById("root")
    .getAttribute("data-metabase-url");
  const metabaseToken = document
    .getElementById("root")
    .getAttribute("data-metabase-token-monitor-workflows");
  const isAdmin =
    document.getElementById("root").getAttribute("data-is-admin") === "true";
  const iframeUrl = `${metabaseUrl}/embed/dashboard/${metabaseToken}#bordered=true&titled=true&refresh=20`;

  return (
    <div>
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-base mr-4">Select group</span>
              <GroupSelect />
            </div>
            <SlurmStatusIndicator 
              onTabChange={activeTab} 
              onWorkflowError={workflowError}
            />
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
          <Tab
            id="Run"
            title="Run"
            icon="play"
            panel={loadedTabs.Run ? <RunTab state={state} onWorkflowError={handleWorkflowError} /> : null}
          />
          <Tab
            id="Status"
            title={
              <Tooltip
                content={<span>View your workflow's progress here</span>}
                compact={true}
                isOpen={state.workflowStatusTooltipShown}
                intent="success"
                onOpened={() => {
                  setTimeout(() => {
                    updateState({ workflowStatusTooltipShown: false });
                  }, 5000);
                }}
              >
                <span className="pointer-events-none select-none focus:outline-none">
                  Status
                </span>
              </Tooltip>
            }
            icon="dashboard"
            panel={
              loadedTabs.Status ? (
                <StatusPanel
                  isAdmin={isAdmin}
                  metabaseUrl={metabaseUrl}
                />
              ) : null
            }
          />
          {/* Admin tab */}
          {state.user.isAdmin && (
            <Tab
              id="Admin"
              title="Admin"
              icon="settings"
              panel={loadedTabs.Admin ? <AdminPanel /> : null}
            />
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default BiomeroApp;
