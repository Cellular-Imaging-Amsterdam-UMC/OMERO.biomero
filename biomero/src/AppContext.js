import React, { createContext, useContext, useState } from "react";
import { 
  fetchomeroTreeData, 
  fetchFolderData, 
  fetchGroups, 
  fetchScripts, 
  fetchScriptData, 
  fetchWorkflows, 
  fetchWorkflowMetadata,
  fetchWorkflowGithub,
  runWorkflow 
} from "./apiService";
import { getDjangoConstants } from "./constants";
import { transformStructure, extractGroups } from "./utils";
import { OverlayToaster, Position } from "@blueprintjs/core";

// Create the context
const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const { user, urls } = getDjangoConstants();
  const [state, setState] = useState({
    user,
    urls,
    omeroTreeData: null,
    folderData: null,
    scripts: [],
    workflows: null,
    workflowMetadata: null,
    workflowStatusTooltipShown: false,
  });
  const [apiLoading, setLoading] = useState(false);
  const [apiError, setError] = useState(null);
  const [toaster, setToaster] = useState(null);

  // Initialize toaster asynchronously
  React.useEffect(() => {
    OverlayToaster.createAsync({ position: Position.TOP }).then(setToaster);
  }, []);

  const runWorkflowData = async (scriptName, params = {}) => {
    setLoading(true);
    setError(null);
    try {
      // Call the generic runWorkflow function
      const response = await runWorkflow(scriptName, params); 
      
      console.log(`Workflow run response for ${scriptName}:`, response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch workflows and metadata including GitHub URLs
  const loadWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWorkflows(); // Fetch workflows (list of names)
      const workflows = response?.workflows || []; // Extract workflows array

      // Fetch metadata and GitHub URLs for each workflow
      const metadataPromises = workflows.map((workflow) =>
        fetchWorkflowMetadata(workflow) // Fetch metadata for each workflow
      );
      const githubPromises = workflows.map((workflow) =>
        fetchWorkflowGithub(workflow) // Fetch GitHub URL for each workflow
      );

      const metadata = await Promise.all(metadataPromises); // Wait for all metadata to be fetched
      const githubUrls = await Promise.all(githubPromises); // Wait for all GitHub URLs

      // Prepare the metadata and GitHub URLs in the format that matches the workflow names
      const workflowsWithMetadata = workflows.map((workflow, index) => ({
        name: workflow,
        description: metadata[index]?.description || 'No description available', // Fallback to default
        metadata: metadata[index], // Store the full metadata for further use (e.g., for clicking)
        githubUrl: githubUrls[index]?.url, // Add GitHub URL to workflow data
      }));

      setState((prevState) => ({
        ...prevState,
        workflows: workflowsWithMetadata,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  

  // Fetch workflow metadata
  const loadWorkflowMetadata = async (workflow) => {
    setLoading(true);
    setError(null);
    try {
      const metadata = await fetchWorkflowMetadata(workflow);
      setState((prevState) => ({ ...prevState, workflowMetadata: metadata }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch GitHub URL for a specific workflow
  const loadWorkflowGithub = async (workflow) => {
    setLoading(true);
    setError(null);
    try {
      const githubUrl = await fetchWorkflowGithub(workflow);
      setState((prevState) => ({
        ...prevState,
        githubUrls: {
          ...prevState.githubUrls,
          [workflow]: githubUrl.url, // Store the GitHub URL by workflow name
        },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch OMERO tree data
  const loadOmeroTreeData = async () => {
    setLoading(true);
    setError(null);
    try {
      const omeroTreeData = await fetchomeroTreeData();
      updateState({ omeroTreeData: transformStructure(omeroTreeData) });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch folder data
  const loadFolderData = async (item = null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchFolderData(item);
      const contents = response.contents || [];
      const formattedData = contents.reduce((acc, content) => {
        const nodeId = content.id;
        acc[nodeId] = {
          index: nodeId,
          isFolder: content.is_folder,
          children: [],
          data: content.name,
          childCount: 0,
        };
        return acc;
      }, {});
      const parentId = item || "root";
      formattedData[parentId] = {
        index: parentId,
        isFolder: true,
        children: contents.map((content) => content.id),
        data: parentId === "root" ? "Root" : "Folder",
        childCount: contents.length,
      };

      setState((prevState) => ({
        ...prevState,
        folderData: {
          ...prevState.folderData,
          ...formattedData,
        },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch groups
  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const groupsHtml = await fetchGroups();
      const groups = extractGroups(groupsHtml);
      setState((prevState) => ({
        ...prevState,
        user: { ...prevState.user, groups },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch scripts and update context state
  const loadScripts = async () => {
    setLoading(true);
    setError(null);
    try {
      const scripts = await fetchScripts();
      setState((prevState) => ({
        ...prevState,
        scripts,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch details for a specific script and update context state
  const fetchScriptDetails = async (scriptId, directory) => {
    setLoading(true);
    try {
      const data = await fetchScriptData(scriptId, directory);
      const fetchedScript = { id: scriptId, ...data.script_menu[0] };
  
      // Helper function to recursively update the nested structure
      const updateNestedScripts = (nodes) =>
        nodes.map((node) => {
          if (node.id === scriptId) {
            // Update the matching script
            return { ...node, ...fetchedScript };
          } else if (node.ul) {
            // Recursively update child nodes if `ul` exists
            return { ...node, ul: updateNestedScripts(node.ul) };
          }
          return node; // No change for non-matching nodes
        });
  
      // Update the state with the updated nested scripts
      setState((prevState) => ({
        ...prevState,
        scripts: updateNestedScripts(prevState.scripts),
      }));
    } catch (err) {
      setError("Error fetching script data.");
      console.error("Failed to fetch script data:", err);
    } finally {
      setLoading(false);
    }
  };

  const openScriptWindow = (scriptUrl) => {
    const SCRIPT_WINDOW_WIDTH = 800;
    const SCRIPT_WINDOW_HEIGHT = 600;

    const event = { target: { href: scriptUrl } };
    OME.openScriptWindow(event, SCRIPT_WINDOW_WIDTH, SCRIPT_WINDOW_HEIGHT);
  };

  const openUploadScriptWindow  = (scriptUrl) => {
    const SCRIPT_WINDOW_WIDTH = 800;
    const SCRIPT_WINDOW_HEIGHT = 600;

    const event = { target: { href: scriptUrl } };
    OME.openPopup(WEBCLIENT.URLS.script_upload);
  };

  
  

  // Function to update the state
  const updateState = (newState) => {
    setState((prevState) => ({ ...prevState, ...newState }));
  };

  return (
    <AppContext.Provider
      value={{
        state,
        updateState,
        loadOmeroTreeData,
        loadFolderData,
        loadGroups,
        loadScripts,
        fetchScriptDetails,
        openScriptWindow,
        openUploadScriptWindow,
        loadWorkflows,
        loadWorkflowMetadata,
        runWorkflowData,
        apiLoading,
        apiError,
        toaster
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use the AppContext
export const useAppContext = () => {
  return useContext(AppContext);
};
