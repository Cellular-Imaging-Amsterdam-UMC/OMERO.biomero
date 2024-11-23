import React, { createContext, useContext, useState } from "react";
import { fetchomeroTreeData } from "./apiService";
import { getDjangoConstants } from "./constants";
import {transformStructure} from "./utils";

// Create the context
const AppContext = createContext();

// Create a provider component
export const AppProvider = ({ children }) => {
  const { user, urls } = getDjangoConstants();
  const [state, setState] = useState({
    user,
    urls,
    omeroTreeData: null,
  });

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

  // Function to update the state (optional)
  const updateState = (newState) =>
    setState((prevState) => ({ ...prevState, ...newState }));

  return (
    <AppContext.Provider
      value={{ state, updateState, loadomeroTreeData, apiLoading, apiError }}
    >
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use the AppContext
export const useAppContext = () => {
  return useContext(AppContext);
};
