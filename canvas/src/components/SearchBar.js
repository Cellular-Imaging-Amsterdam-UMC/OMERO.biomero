import React from "react";
import { InputGroup } from "@blueprintjs/core"; // Import the InputGroup component

const SearchBar = ({ searchQuery, setSearchQuery }) => {
  const handleSearch = (event) => {
    const query = event.target.value.toLowerCase();
    setSearchQuery(query); // Update search query in parent component
  };

  return (
    <InputGroup
      large // Apply large size
      type="search"
      placeholder="Search scripts..."
      value={searchQuery} // Controlled input to reflect current query
      onChange={handleSearch}
      id="scripts-menu-searchBar"
    />
  );
};

export default SearchBar;
