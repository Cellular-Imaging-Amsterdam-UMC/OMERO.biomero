import React, { useState } from "react";
import { Collapse, Button, H5, Icon, Tag, Tooltip } from "@blueprintjs/core";

const CollapsibleSection = ({ title, children, versionSummary, versionCheckLoading, onRefresh, errorCount }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <H5 className="flex items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <Icon 
            icon={isOpen ? "chevron-down" : "chevron-right"} 
            className="mr-2" 
          />
          <span>{title}</span>
          {/* Validation error count tag — same style as version warning tags */}
          {errorCount > 0 && (
            <Tooltip content="Expand this section to see and fix the validation errors">
              <Tag minimal intent="danger" className="ml-2">
                {errorCount} validation error{errorCount !== 1 ? 's' : ''}
              </Tag>
            </Tooltip>
          )}
          {/* Version summary for Models Settings */}
          {versionSummary && (
            <span className="ml-2 flex items-center">
              {versionCheckLoading ? (
                <Tag minimal intent="none" className="ml-2">
                  Checking versions...
                </Tag>
              ) : versionSummary.total > 0 ? (
                <>
                  {/* Status unavailable indicator */}
                  {versionSummary.rateLimited > 0 ? (
                    <Tooltip 
                      content={`GitHub API rate limit exceeded. Version status unavailable for ${versionSummary.rateLimited} models.${
                        versionSummary.rateLimitResetTime 
                          ? ` Rate limit resets at ${versionSummary.rateLimitResetTime.toLocaleTimeString()}` 
                          : ''
                      }`}
                    >
                      <Tag minimal intent="warning" className="ml-2">
                        ? / {versionSummary.total}
                      </Tag>
                    </Tooltip>
                  ) : versionSummary.stale > 0 ? (
                    <Tooltip content={`${versionSummary.stale} models showing stale data due to rate limiting`}>
                      <Tag minimal intent="none" className="ml-2 text-orange-500">
                        {versionSummary.upToDate}/{versionSummary.total} up to date (stale)
                      </Tag>
                    </Tooltip>
                  ) : versionSummary.outdated > 0 ? (
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
        </H5>
        
        {/* Refresh button - separate from clickable title */}
        {onRefresh && (
          <Tooltip content="Refresh version check (clears cache)">
            <Button
              minimal
              small
              icon="refresh"
              onClick={() => onRefresh()}
              disabled={versionCheckLoading}
            />
          </Tooltip>
        )}
      </div>
      <Collapse isOpen={isOpen}>
        <div>{children}</div>
      </Collapse>
    </div>
  );
};

export default CollapsibleSection;
