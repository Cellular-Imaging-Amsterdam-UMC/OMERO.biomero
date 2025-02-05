import React from "react";
import { InputGroup } from "@blueprintjs/core";

const SearchBar = ({ searchQuery, setSearchQuery }) => {
  const handleSearch = (event) => {
    const query = event.target.value.toLowerCase();
    setSearchQuery(query); // Update search query in parent component
  };

  return (
    <InputGroup
      large
      type="search"
      placeholder="Search scripts..."
      value={searchQuery}
      onChange={handleSearch}
      id="scripts-menu-searchBar"
    />
  );
};

export default SearchBar;
