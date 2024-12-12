import React from "react";

const UploadButton = ({ uploadUrl }) => {
    const handleUpload = () => {
        console.log("Redirecting to upload script URL:", uploadUrl);
    };

    return (
        <button
            id="scripts-menu-uploadButton"
            className="scripts-menu-upload-button"
            onClick={handleUpload}
        >
            Upload Script
        </button>
    );
};

export default UploadButton;
