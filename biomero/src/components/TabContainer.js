import React, { useState, useEffect } from "react";
import ScriptCard from "./ScriptCard"; // Import ScriptCard

const TabContainer = ({ menuData }) => {
  const [activeTab, setActiveTab] = useState(menuData[0]?.name || "");

  // Update active tab based on menuData changes
  useEffect(() => {
    if (menuData.length > 0) {
      setActiveTab(menuData[0].name);
    }
  }, [menuData]);

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  const renderScripts = (folder) => {
    return folder.ul?.map((group) => {
      return group.ul?.map((script) => (
        <ScriptCard key={script.id} script={script} />
      ));
    });
  };

  return (
    <div>
      <div className="tab-buttons">
        {menuData.map((folder) => (
          <button
            key={folder.name}
            className={`tablink ${folder.name === activeTab ? "active" : ""}`}
            onClick={() => handleTabClick(folder.name)}
          >
            {folder.name}
          </button>
        ))}
      </div>
      <div id="scripts-menu-tabContent">
        {menuData.map((folder) => (
          <div
            key={folder.name}
            id={folder.name}
            className="tabcontent"
            style={{ display: folder.name === activeTab ? "block" : "none" }}
          >
            {/* Render Scripts by iterating through nested ul */}
            {renderScripts(folder)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabContainer;
