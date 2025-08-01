import React, { useState } from "react";
import { Collapse, Button } from "@blueprintjs/core";

const CollapsibleSection = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <h5>
        <Button
          minimal
          onClick={() => setIsOpen(!isOpen)}
          icon={isOpen ? "chevron-down" : "chevron-right"}
        >
          {title}
        </Button>
      </h5>
      <Collapse isOpen={isOpen}>
        <div>{children}</div>
      </Collapse>
    </div>
  );
};

export default CollapsibleSection;
