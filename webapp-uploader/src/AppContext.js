import React, { createContext, useContext, useState } from "react";

// Create the context
const AppContext = createContext();

// Create a provider component
export const AppProvider = ({ children }) => {
  const [state, setState] = useState({
    user: null, // Example: User data
    theme: "light", // Example: Theme setting
  });

  // Function to update the state (optional)
  const updateState = (newState) =>
    setState((prevState) => ({ ...prevState, ...newState }));

  return (
    <AppContext.Provider value={{ state, updateState }}>
      {children}
    </AppContext.Provider>
  );
};

// Custom hook to use the AppContext
export const useAppContext = () => {
  return useContext(AppContext);
};
