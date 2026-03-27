import React from "react";
import { Button, Checkbox, InputGroup } from "@blueprintjs/core";

const ImageChannelControls = ({
  channels,
  visibility,
  onToggle,
  minPercent,
  maxPercent,
  onMinPercentChange,
  onMaxPercentChange,
  onAutoScale,
}) => {
  if (!channels || channels.length === 0) return null;

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

      <div className="mt-3 pt-3 border-t flex flex-col gap-2">
        <div className="text-xs font-bold uppercase text-gray-500">
          Intensity Scaling
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <InputGroup
            type="number"
            min={0}
            max={100}
            inputMode="decimal"
            placeholder="Min %"
            value={minPercent}
            onChange={(event) => onMinPercentChange(event.target.value)}
          />
          <InputGroup
            type="number"
            min={0}
            max={100}
            inputMode="decimal"
            placeholder="Max %"
            value={maxPercent}
            onChange={(event) => onMaxPercentChange(event.target.value)}
          />
          <Button small onClick={onAutoScale}>
            Auto
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImageChannelControls;
