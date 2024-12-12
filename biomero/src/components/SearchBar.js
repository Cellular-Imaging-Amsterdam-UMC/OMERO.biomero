import React from "react";

const SearchBar = ({ searchQuery, setSearchQuery }) => {
    const handleSearch = (event) => {
        const query = event.target.value.toLowerCase();
        setSearchQuery(query); // Update search query in parent component
    };

    return (
        <input
            type="text"
            id="scripts-menu-searchBar"
            placeholder="Search scripts..."
            value={searchQuery} // Controlled input to reflect current query
            onChange={handleSearch}
            className="w-full sm:w-auto p-2 border rounded-md text-sm"
        />
    );
};

export default SearchBar;
