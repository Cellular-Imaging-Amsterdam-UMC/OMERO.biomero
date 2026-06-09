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
  HTMLTable,
  Tag,
  Spinner,
  InputGroup,
  Button,
  Callout,
  Icon,
} from "@blueprintjs/core";
import "@blueprintjs/core/lib/css/blueprint.css";
import { fetchMetabaseData } from "../apiService";
import SettingsForm from "./components/SettingsForm";

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

const StatusPanel = ({ isAdmin, metabaseUrl }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchMetabaseData("workflows");
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
  }, []);

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
    if (!status) return "";
    const s = status.toLowerCase();
    if (s.includes("failed") || s.includes("error")) return "bg-red-50/70 dark:bg-red-900/10";
    if (s.includes("done") || s.includes("completed")) return "bg-green-50/50 dark:bg-green-900/5";
    return "";
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

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
          <div className="bp5-form-helper-text">
            View your active BIOMERO workflow progress or historical execution records.
          </div>
        </div>
        <div className="flex space-x-2">
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
        <div className="flex-grow flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg min-h-0">
          <div className="flex-grow overflow-auto">
            <HTMLTable interactive className="w-full text-sm align-middle">
              <thead>
                <tr>
                  <th>Workflow ID</th>
                  <th>Name</th>
                  <th>Main Task Name</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Start Time</th>
                  <th>Task</th>
                  <th>Group</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      {item.workflow_id ? (
                        <div className="flex items-center space-x-1">
                          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded font-mono">
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
                    <td className="font-semibold">{item.name || "-"}</td>
                    <td>{item.main_task_name || "-"}</td>
                    <td>
                      <Tag intent={getStatusTagIntent(item.status)} large={false} minimal>
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
              </tbody>
            </HTMLTable>
          </div>
          {filteredData.length > pageSize && (
            <div className="flex-shrink-0 flex justify-between items-center p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
              <span className="text-xs text-gray-500">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} entries
              </span>
              <div className="flex space-x-1 items-center">
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
                <span className="text-xs font-semibold px-3 text-gray-700 dark:text-gray-300">
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
              </div>
            </div>
          )}
        </div>
      )}
      
      {isAdmin && metabaseUrl && (
        <div className="flex-shrink-0 mt-4 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded flex items-center justify-between">
          <span className="text-xs text-blue-800 dark:text-blue-300">
            Administrators can access the raw Metabase interface for query builders and reports.
          </span>
          <a
            href={metabaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold"
          >
            Open Metabase Interface <Icon icon="share" size={12} className="ml-1 inline" />
          </a>
        </div>
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
