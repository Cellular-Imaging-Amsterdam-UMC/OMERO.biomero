import React from "react";

const SearchBar = () => {
    const handleSearch = (event) => {
        const query = event.target.value.toLowerCase();
        // Implement search logic
        console.log("Searching for:", query);
    };

    return (
        <input
            type="text"
            id="scripts-menu-searchBar"
            placeholder="Search scripts..."
            onChange={handleSearch}
            className="w-full sm:w-auto p-2 border rounded-md text-sm"
        />

    );
};

export default SearchBar;
