import React from "react";
import ScriptCard from "./ScriptCard";

const ScriptCardGroup = ({ scriptGroup }) => {
  return (
    <div className="script-group">
      <div className="group-name">{scriptGroup.name}</div>
      <div className="scripts-container">
        {scriptGroup.ul.map((script) => (
          <ScriptCard key={script.id} script={script} />
        ))}
      </div>
    </div>
  );
};

export default ScriptCardGroup;
