import React, { useState, useEffect } from "react";
import ScriptCard from "./ScriptCard"; // Import ScriptCard
import SearchBar from "./SearchBar"; // Assuming SearchBar is another component
import UploadButton from "./UploadButton"; // Assuming UploadButton is another component

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
    <div className="tab-container h-full">
        <div className="tab-controls flex justify-between items-center mb-4">
            {/* Tabs on the Left */}
            <div className="tab-buttons flex space-x-4">
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

            {/* Search and Upload on the Right */}
            <div className="tab-right-controls flex space-x-4">
            <SearchBar />
            <UploadButton uploadUrl="/script_upload" />
            </div>
        </div>

        {/* Scripts Display Area */}
        <div id="scripts-menu-tabContent" className="scripts-content overflow-auto">
            {menuData.map((folder) => (
            <div
                key={folder.name}
                id={folder.name}
                className={`tabcontent ${folder.name === activeTab ? "block" : "hidden"}`}
            >
                <div className="scripts-grid">
                    {/* Render Scripts in Columns */}
                    {renderScripts(folder)}
                </div>
            </div>
            ))}
        </div>
    </div>

  );
};

export default TabContainer;
