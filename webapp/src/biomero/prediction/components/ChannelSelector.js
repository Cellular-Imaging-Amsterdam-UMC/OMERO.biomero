import React from "react";
import { FormGroup, ButtonGroup, Button, Tag } from "@blueprintjs/core";

const ChannelSelector = ({ channels, selectedChannel, onSelect, loading }) => {
  if (!channels || channels.length === 0) {
    return null;
  }

  // Single channel — no need to show selector
  if (channels.length === 1) {
    return (
      <FormGroup label="Channel">
        <Tag minimal>{channels[0].name || "Channel 0"}</Tag>
      </FormGroup>
    );
  }

  return (
    <FormGroup label="Select Channel" helperText="Choose which channel to run prediction on">
      <div className="flex flex-col gap-1">
        {channels.map((ch) => (
          <Button
            key={ch.index}
            active={selectedChannel === ch.index}
            intent={selectedChannel === ch.index ? "primary" : "none"}
            onClick={() => onSelect(ch.index)}
            alignText="left"
            small
            fill
            disabled={loading}
          >
            <div className="flex items-center gap-2 w-full">
              <div 
                className="w-3 h-3 rounded-full border border-gray-300 shrink-0" 
                style={{ backgroundColor: ch.color || "#ccc" }} 
              />
              <span className="truncate">
                {ch.name || `Channel ${ch.index}`}
              </span>
              <span className="text-xs opacity-60 ml-auto">
                #{ch.index}
              </span>
            </div>
          </Button>
        ))}
      </div>
    </FormGroup>
  );
};

export default ChannelSelector;
