import React, { useEffect, useState } from "react";
import { useAppContext } from "../../AppContext";
import { Card, Elevation, H6, Button } from "@blueprintjs/core";

const ScriptCard = ({ script }) => {
  const { openScriptWindow, fetchScriptDetails, state, apiLoading, apiError } =
    useAppContext();
  const [isCardLoaded, setIsCardLoaded] = useState(false);

  useEffect(() => {
    if (!isCardLoaded && !state.scripts.find((s) => s.id === script.id)) {
      fetchScriptDetails(script.id, script.name);
      setIsCardLoaded(true);
    }
  }, []);

  const handleCardClick = () => {
    const scriptUrl = `/webclient/script_ui/${script.id}`;
    openScriptWindow(scriptUrl);
  };

  const isSlurmWorkflow = script.name === "Slurm Workflow";

  return (
    <Card
      key={script.id}
      className="script-card"
      interactive={true}
      onClick={handleCardClick}
      selected={isSlurmWorkflow}
      elevation={Elevation.ONE}
    >
      <ScriptDetailsContent
        script={script}
        apiLoading={apiLoading}
        handleCardClick={handleCardClick}
        isSlurmWorkflow={isSlurmWorkflow}
      />
      {apiError && <p className="error">{apiError}</p>}
    </Card>
  );
};

const ScriptDetailsContent = ({
  script,
  apiLoading,
  handleCardClick,
  isSlurmWorkflow,
}) => {
  return (
    <div>
      <H6 className={`script-name ${apiLoading ? "bp5-skeleton" : ""}`}>
        {apiLoading ? "Loading..." : script.name || "Lorem ipsum dolor"}
      </H6>
      <p className={`${apiLoading ? "bp5-skeleton" : ""}`}>
        {script?.description || "No description available"}
      </p>
      <p className={`${apiLoading ? "bp5-skeleton" : ""}`}>
        <strong>Authors:</strong> {script?.authors || "Unknown"}
      </p>
      <p className={`${apiLoading ? "bp5-skeleton" : ""}`}>
        <strong>Version:</strong> {script?.version || "Unknown"}
      </p>
      <Button
        intent={isSlurmWorkflow ? "success" : "primary"}
        icon="document"
        rightIcon="take-action"
        onClick={handleCardClick}
      >
        Run script
      </Button>
    </div>
  );
};

export default ScriptCard;
