import React, { createContext, useContext, useState } from "react";
import { fetchomeroTreeData, fetchFolderData, fetchGroups } from "./apiService";
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
  });

  console.log("state", state);

  const [apiLoading, setLoading] = useState(false);
  const [apiError, setError] = useState(null);

  // Fetch tree data and update context state
  const loadomeroTreeData = async () => {
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

  const loadFolderData = async (item = null) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchFolderData(item); // Fetch folder data from API
      const contents = response.contents || []; // Extract contents from response

      // Transform the API response into the flat list structure
      const formattedData = contents.reduce((acc, content) => {
        const nodeId = content.id; // Unique node ID
        acc[nodeId] = {
          index: nodeId,
          isFolder: content.is_folder,
          children: [], // Child nodes will be populated dynamically
          data: content.name, // Node name or label
          childCount: 0, // Set to 0 initially; update when children are fetched
        };
        return acc;
      }, {});

      // Add the parent folder (e.g., root) and link children
      const parentId = item || "root";
      formattedData[parentId] = {
        index: parentId,
        isFolder: true,
        children: contents.map((content) => content.id), // List of child IDs
        data: parentId === "root" ? "Root" : "Folder", // Name for the root or parent folder
        childCount: contents.length,
      };

      // Merge with existing folder data
      setState((prevState) => ({
        ...prevState,
        folderData: {
          ...prevState.folderData,
          ...formattedData, // Add or update new folder contents
        },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const groupsHtml = await fetchGroups();
      const groups = extractGroups(groupsHtml);
      console.log("groups", groups);
      // Add groups to user obj in state
      setState((prevState) => ({
        ...prevState,
        user: {
          ...prevState.user,
          groups,
        },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Function to update the state (optional)
  const updateState = (newState) => {
    console.log("newState", newState);
    setState((prevState) => ({ ...prevState, ...newState }));
  };

  return (
    <AppContext.Provider
      value={{
        state,
        updateState,
        loadomeroTreeData,
        loadFolderData,
        loadGroups,
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
