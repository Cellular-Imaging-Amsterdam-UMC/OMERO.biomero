import React from "react";
import { useAppContext } from "../../AppContext";
import { Button } from "@blueprintjs/core";

const UploadButton = () => {
  const { openUploadScriptWindow } = useAppContext();
  const handleUploadClick = () => {
    openUploadScriptWindow();
  };

  return (
    <Button icon="document" rightIcon="upload" onClick={handleUploadClick}>
      Upload Script
    </Button>
  );
};

export default UploadButton;
