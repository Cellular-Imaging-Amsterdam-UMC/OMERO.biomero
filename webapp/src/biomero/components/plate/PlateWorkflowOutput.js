import React from "react";
import { DialogBody } from "@blueprintjs/core";
import WorkflowOutput from "../WorkflowOutput.js";

const PlateWorkflowOutput = ({ onSelectionChange }) => (
  <DialogBody>
    <WorkflowOutput plateMode onSelectionChange={onSelectionChange} />
  </DialogBody>
);

export default PlateWorkflowOutput;
