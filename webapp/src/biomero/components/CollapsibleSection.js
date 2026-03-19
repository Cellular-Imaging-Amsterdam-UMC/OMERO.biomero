import React, { useState } from "react";
import { Collapse, Button, Icon, Tag } from "@blueprintjs/core";

const CollapsibleSection = ({ title, children, versionSummary, versionCheckLoading }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <h5>
        <Button
          minimal
          onClick={() => setIsOpen(!isOpen)}
          icon={isOpen ? "chevron-down" : "chevron-right"}
        >
          <span className="flex items-center">
            {title}
            {/* Version summary for Models Settings */}
            {versionSummary && (
              <span className="ml-2">
                {versionCheckLoading ? (
                  <Tag minimal intent="none" className="ml-2">
                    Checking versions...
                  </Tag>
                ) : versionSummary.total > 0 ? (
                  <>
                    {versionSummary.outdated > 0 ? (
                      <Tag minimal intent="warning" className="ml-2">
                        {versionSummary.outdated} update{versionSummary.outdated !== 1 ? 's' : ''} available
                      </Tag>
                    ) : (
                      <Tag minimal intent="success" className="ml-2">
                        {versionSummary.upToDate}/{versionSummary.total} up to date
                      </Tag>
                    )}
                  </>
                ) : null}
              </span>
            )}
          </span>
        </Button>
      </h5>
      <Collapse isOpen={isOpen}>
        <div>{children}</div>
      </Collapse>
    </div>
  );
};

export default CollapsibleSection;
