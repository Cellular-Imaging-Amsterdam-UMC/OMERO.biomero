import React, { useState, useEffect, useCallback } from "react";
import { Tabs, Tab, Alert } from "@blueprintjs/core";
import PreviewTab from "./components/PreviewTab";
import TrainingBiomeroTab from "./components/TrainingBiomeroTab";
import ConfigureTab from "./components/ConfigureTab";
import AnnotateTab from "./components/AnnotateTab";

import { useAppContext } from "../../AppContext";
import { loadManifest } from "../../apiService";
import GroupSelect from "../../shared/components/GroupSelect";
import SlurmStatusIndicator from "../../shared/components/SlurmStatusIndicator";

const AnnotateApp = () => {
  const {
    state,
    loadOmeroTreeData,
    loadFolderData,
    loadGroups,
    loadWorkflows,
    loadBiomeroConfig,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState("preview");
  const [loadingOmero, setLoadingOmero] = useState(false);
  const [workflowError, setWorkflowError] = useState(false);

  // Manifest-based state (replaces tableId/config/units/progress)
  const [setId, setSetId] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [showConfigWarning, setShowConfigWarning] = useState(false);

  useEffect(() => {
    if (!loadingOmero) {
      setLoadingOmero(true);
      loadOmeroTreeData()
        .then(() => setLoadingOmero(false))
        .catch(() => setLoadingOmero(false));
    }
    loadFolderData();
    loadGroups();
    loadWorkflows();
    loadBiomeroConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (newTabId) => {
    // Warn when navigating to Configure with an active annotation set
    if (newTabId === "configure" && setId) {
      setShowConfigWarning(true);
      return;
    }
    setActiveTab(newTabId);
  };
  const handleWorkflowError = () => setWorkflowError((prev) => !prev);

  // Called by ConfigureTab when a new set is created or an existing one is resumed
  const handleConfigCreated = useCallback(async (configData, newSetId) => {
    setSetId(newSetId);
    // If configData has annotations populated, use it directly (new set from server response)
    if (configData?.annotations?.length > 0) {
      setManifest(configData);
    } else {
      // Resume or new set without units — load full manifest from server
      const containerType = configData?.omero?.container_type || "dataset";
      const containerId = configData?.omero?.container_id || configData?.omero?.container_ids?.[0];
      if (containerId && newSetId) {
        try {
          const result = await loadManifest(containerType, containerId, newSetId);
          setManifest(result.config);
        } catch (e) {
          console.error("Failed to load manifest:", e);
          // Fall back to whatever we have
          if (configData) setManifest(configData);
        }
      } else if (configData) {
        setManifest(configData);
      }
    }
    setActiveTab("annotate");
  }, []);

  // Called by AnnotateTab when manifest changes (unit processed, etc.)
  const handleManifestUpdate = useCallback((updatedManifest) => {
    setManifest(updatedManifest);
  }, []);

  // Computed progress from manifest
  const progress = manifest?.annotations
    ? {
        total_units: manifest.annotations.length,
        completed_units: manifest.annotations.filter((a) => a.processed).length,
        progress_percent:
          manifest.annotations.length > 0
            ? Math.round(
                (manifest.annotations.filter((a) => a.processed).length /
                  manifest.annotations.length) *
                  100,
              )
            : 0,
      }
    : null;

  return (
    <div>
      <div className="p-4">
        {state?.user?.groups && (
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-base mr-4">Select group</span>
              <GroupSelect />
            </div>
            <div className="flex items-center gap-4">
              {progress && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Progress:</span>
                  <div className="w-48 bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-green-500 h-4 rounded-full transition-all"
                      style={{ width: `${progress.progress_percent}%` }}
                    />
                  </div>
                  <span>
                    {progress.completed_units}/{progress.total_units} (
                    {progress.progress_percent}%)
                  </span>
                </div>
              )}
              <SlurmStatusIndicator
                onTabChange={activeTab}
                onWorkflowError={workflowError}
              />
            </div>
          </div>
        )}
      </div>

      {manifest?.name && setId && (activeTab === "annotate" || activeTab === "training") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            background: "#e8f0fe",
            borderBottom: "1px solid #c4d4e8",
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 600 }}>{manifest.name}</span>
          {progress && (
            <span style={{ color: "#555" }}>
              — {progress.completed_units}/{progress.total_units} images annotated
            </span>
          )}
        </div>
      )}

      {/* Warning dialog when switching to Configure with active set */}
      <Alert
        isOpen={showConfigWarning}
        onClose={() => setShowConfigWarning(false)}
        cancelButtonText="Keep annotating"
        confirmButtonText="New annotation set"
        intent="warning"
        icon="warning-sign"
        onCancel={() => {
          setShowConfigWarning(false);
          setActiveTab("annotate");
        }}
        onConfirm={() => {
          setShowConfigWarning(false);
          setSetId(null);
          setManifest(null);
          setActiveTab("configure");
        }}
      >
        <p>
          You have an active annotation set: <strong>{manifest?.name || "unnamed"}</strong>
        </p>
        <p>
          Your progress is saved. You can resume this set later from the Configure tab,
          or start a new annotation set.
        </p>
      </Alert>

      <div className="p-4 h-full overflow-hidden">
        <Tabs
          id="annotate-app-tabs"
          className="h-[calc(100vh-200px)]"
          animate={true}
          renderActiveTabPanelOnly={false}
          large={true}
          selectedTabId={activeTab}
          onChange={handleTabChange}
        >
          <Tab
            id="preview"
            title="Preview"
            icon="eye-open"
            panel={<PreviewTab setId={setId} />}
          />
          <Tab
            id="configure"
            title="Configure"
            icon="cog"
            panel={
              <ConfigureTab
                onConfigCreated={handleConfigCreated}
                existingConfig={manifest}
              />
            }
          />
          <Tab
            id="annotate"
            title="Annotate"
            icon="edit"
            disabled={!setId}
            panel={
              <AnnotateTab
                manifest={manifest}
                setId={setId}
                onManifestUpdate={handleManifestUpdate}
              />
            }
          />
          <Tab
            id="training"
            title="Training"
            icon="rocket-slant"
            panel={<TrainingBiomeroTab setId={setId} manifest={manifest} />}
          />
        </Tabs>
      </div>
    </div>
  );
};

export default AnnotateApp;
