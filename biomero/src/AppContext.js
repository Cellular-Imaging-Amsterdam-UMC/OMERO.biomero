import React, { createContext, useContext, useState } from "react";
import { fetchomeroTreeData, fetchFolderData, fetchGroups, fetchScripts, fetchScriptData } from "./apiService"; 
import { getDjangoConstants } from "./constants";
import { transformStructure, extractGroups } from "./utils";

// Create the context
const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const { user, urls } = getDjangoConstants();
  const [state, setState] = useState({
    user,
    urls,
    omeroTreeData: null,
    folderData: null,
    scripts: [], // Initialize with an empty array for scripts
  });

  const [apiLoading, setLoading] = useState(false);
  const [apiError, setError] = useState(null);

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
        fetchScriptDetails, // Now available to consumers
        openScriptWindow,
        apiLoading,
        apiError,
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
