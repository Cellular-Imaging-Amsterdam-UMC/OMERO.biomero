import React from "react";

const UploadButton = ({ uploadUrl }) => {
    const handleUpload = () => {
        console.log("Redirecting to upload script URL:", uploadUrl);
    };

    return (
        <button
            id="scripts-menu-uploadButton"
            className="scripts-menu-upload-button p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            onClick={handleUpload}
            >
            Upload Script
        </button>

    );
};

export default UploadButton;
