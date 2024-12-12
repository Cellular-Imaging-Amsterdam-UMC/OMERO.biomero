import React, { useState, useEffect } from "react";
import ScriptCard from "./ScriptCard"; // Import ScriptCard
import SearchBar from "./SearchBar"; // Assuming SearchBar is another component
import UploadButton from "./UploadButton"; // Assuming UploadButton is another component

const TabContainer = ({ menuData }) => {
  const [activeTab, setActiveTab] = useState(menuData[0]?.name || "");
  const [searchQuery, setSearchQuery] = useState(""); // Search query state
  const [filteredData, setFilteredData] = useState(menuData); // Filtered menu data

  // Set active tab only on initial render or when menuData changes significantly (not just updates)
  useEffect(() => {
    if (!menuData.some(folder => folder.name === activeTab)) {
      setActiveTab(menuData[0]?.name || "");
    }
  }, [menuData]); // Ensure this runs only if the menuData array changes structurally

  // Filter menuData based on searchQuery
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredData(menuData); // Reset to original menuData
    } else {
      const lowerCaseQuery = searchQuery.toLowerCase();
      const filtered = menuData.map((folder) => ({
        ...folder,
        ul: folder.ul?.map((group) => ({
          ...group,
          ul: group.ul?.filter((script) =>
            script.name.toLowerCase().includes(lowerCaseQuery)
          ),
        })).filter((group) => group.ul && group.ul.length > 0), // Remove empty groups
      })).filter((folder) => folder.ul && folder.ul.length > 0); // Remove empty folders

      setFilteredData(filtered);
    }
  }, [searchQuery, menuData]);

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
          {filteredData.map((folder) => (
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
          <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
          <UploadButton uploadUrl="/script_upload" />
        </div>
      </div>

      {/* Scripts Display Area */}
      <div id="scripts-menu-tabContent" className="scripts-content overflow-auto">
        {filteredData.length === 0 ? (
          <div>Loading...</div> // Show loading state if filteredData is empty
        ) : (
          filteredData.map((folder) => (
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
          ))
        )}
      </div>
    </div>
  );
};

export default TabContainer;
