import React from "react";
import { useAppContext } from "../../AppContext";
import { Button } from "@blueprintjs/core";

const UploadButton = () => {
  const { openImportScriptWindow } = useAppContext();
  const handleUploadClick = () => {
    openImportScriptWindow();
  };

  return (
    <Button icon="document" rightIcon="upload" onClick={handleUploadClick}>
      Upload Script
    </Button>
  );
};

export default UploadButton;
