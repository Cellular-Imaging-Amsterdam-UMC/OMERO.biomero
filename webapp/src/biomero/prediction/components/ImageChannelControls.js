import React from "react";
import { Checkbox } from "@blueprintjs/core";

const ImageChannelControls = ({ channels, visibility, onToggle }) => {
  if (!channels || channels.length <= 1) return null;

  return (
    <div>
      <div className="text-xs font-bold uppercase text-gray-500 mb-2">
        Image Channels
      </div>
      <div className="flex flex-col gap-1">
        {channels.map((ch) => (
          <Checkbox
            key={ch.index}
            checked={visibility[ch.index] !== false}
            onChange={() => onToggle(ch.index)}
            className="mb-0 flex items-center"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                style={{ backgroundColor: ch.color || '#ccc' }}
              />
              <span className="text-sm">
                {ch.name || `Channel ${ch.index}`}
              </span>
            </span>
          </Checkbox>
        ))}
      </div>
    </div>
  );
};

export default ImageChannelControls;
