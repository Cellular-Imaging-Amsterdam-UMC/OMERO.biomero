import React from "react";
import TabContainer from "./TabContainer";
import SearchBar from "./SearchBar";
import UploadButton from "./UploadButton";
import { useAppContext } from "../AppContext";

const ScriptsMenu = () => {
    const { state } = useAppContext();
    const { scripts, loading } = state;

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div id="scripts-menu-draggable">
            <div className="scripts-menu-window-header">
                <div className="scripts-menu-title-container">
                    <img
                        src="/static/scriptmenu/img/script-text-play.svg"
                        alt="Script Icon"
                        className="scripts-menu-script-icon"
                    />
                    <span className="scripts-menu-window-title">Scripts Menu</span>
                </div>
                <div className="scripts-menu-window-controls">
                    <button className="scripts-menu-maximize-btn">□</button>
                    <button className="scripts-menu-close-btn">×</button>
                </div>
            </div>

            <div className="scripts-menu-tabs">
                <SearchBar />
                <UploadButton uploadUrl="/script_upload" />
                <TabContainer menuData={scripts} />
            </div>
        </div>
    );
};

export default ScriptsMenu;
