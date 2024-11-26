import React, { useEffect } from "react";
import { useAppContext } from "./AppContext";
import FileBrowser from "./FileBrowser";
import OmeroDataBrowser from "./OmeroDataBrowser";
import { Button, MenuItem } from "@blueprintjs/core";
import { ItemPredicate, ItemRenderer, Select } from "@blueprintjs/select";

const App = () => {
  const { state, loadomeroTreeData, loadFolderData } = useAppContext();

  useEffect(() => {
    loadomeroTreeData(); // Load tree data on component mount
    loadFolderData(); // Load local folder data on component mount
  }, []);

  const TOP_100_FILMS = [
    { title: "The Shawshank Redemption", year: 1994 },
    { title: "The Godfather", year: 1972 },
    // ...
  ].map((f, index) => ({ ...f, rank: index + 1 }));

  const filterFilm = (query, film, _index, exactMatch) => {
    const normalizedTitle = film.title.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    if (exactMatch) {
      return normalizedTitle === normalizedQuery;
    } else {
      return (
        `${film.rank}. ${normalizedTitle} ${film.year}`.indexOf(
          normalizedQuery
        ) >= 0
      );
    }
  };

  const renderFilm = (film, { handleClick, handleFocus, modifiers, query }) => {
    if (!modifiers.matchesPredicate) {
      return null;
    }
    return (
      <MenuItem
        active={modifiers.active}
        disabled={modifiers.disabled}
        key={film.rank}
        label={film.year.toString()}
        onClick={handleClick}
        onFocus={handleFocus}
        roleStructure="listoption"
        text={`${film.rank}. ${film.title}`}
      />
    );
  };

  const FilmSelect = () => {
    const [selectedFilm, setSelectedFilm] = React.useState();
    return (
      <Select
        items={TOP_100_FILMS}
        itemPredicate={filterFilm}
        itemRenderer={renderFilm}
        noResults={
          <MenuItem
            disabled={true}
            text="No results."
            roleStructure="listoption"
          />
        }
        onItemSelect={setSelectedFilm}
      >
        <Button
          text={selectedFilm?.title || "Select a film..."}
          rightIcon="double-caret-vertical"
          placeholder="Select a film"
        />
      </Select>
    );
  };

  return (
    <div className="bg-[#f0f1f5] w-full h-full absolute top-0">
      <div className="flex space-x-4">
        <div className="w-1/4">
          {/* Add blueprint pulldown menu */}
          <FilmSelect />
          <h1 className="text-base font-bold p-4 pb-0">OMERO Data!!!</h1>
          {state.omeroTreeData && <OmeroDataBrowser />}
        </div>
        <div className="w-1/2">
          <h1 className="text-base font-bold p-4 pb-0">Local folders</h1>
          {state.folderData && <FileBrowser />}
        </div>
        <div className="w-1/4"></div>
      </div>
    </div>
  );
};

export default App;
