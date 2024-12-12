import React, { useEffect, useState } from "react";
import { useAppContext } from "../AppContext";

const ScriptCard = ({ script }) => {
  const { openScriptWindow, fetchScriptDetails, state, apiLoading, apiError } = useAppContext();
  const [isCardLoaded, setIsCardLoaded] = useState(false);

  useEffect(() => {
    if (!isCardLoaded && !state.scripts.find((s) => s.id === script.id)) {
      // Fetch script details only if not already loaded
      fetchScriptDetails(script.id, script.name);
      setIsCardLoaded(true); // Mark the card as loaded
    }
  }, [isCardLoaded, script.id, script.name, fetchScriptDetails, state.scripts]);

  // Handle click to open the script in a popup window
  const handleCardClick = () => {
    const scriptUrl = `/webclient/script_ui/${script.id}`; // Construct the URL dynamically
    openScriptWindow(scriptUrl); // Open the script window
  };

  return (
    <div className="script-card" onClick={handleCardClick}>
      <div className="script-name">{script.name}</div>
      <div className="script-card-content">
        {apiLoading ? (
          <p>Loading...</p>
        ) : (
          <ScriptDetailsContent script={script} />
        )}
      </div>
      {apiError && <p className="error">{apiError}</p>}
    </div>
  );
};

// Subcomponent to format and display the detailed script content
const ScriptDetailsContent = ({ script }) => {
  return (
    <div>
      <p>{script?.description || "No description available"}</p>
      <p>
        <strong>Authors:</strong> {script?.authors || "Unknown"}
      </p>
      <p>
        <strong>Version:</strong> {script?.version || "Unknown"}
      </p>
    </div>
  );
};

export default ScriptCard;
