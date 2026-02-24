import React from "react";
import { Checkbox, RangeSlider } from "@blueprintjs/core";

const ImageChannelControls = ({
  channels,
  visibility,
  onToggle,
  channelWindows,
  onWindowChange,
}) => {
  if (!channels || channels.length === 0) return null;

  const multiChannel = channels.length > 1;

  return (
    <div>
      <div className="text-xs font-bold uppercase text-gray-500 mb-2">
        {multiChannel ? "Image Channels" : "Contrast"}
      </div>
      <div className="flex flex-col gap-1">
        {channels.map((ch) => {
          const win = channelWindows?.[ch.index];
          const hasSlider = win && ch.window && onWindowChange;
          return (
            <div key={ch.index}>
              {multiChannel && (
                <Checkbox
                  checked={visibility[ch.index] !== false}
                  onChange={() => onToggle(ch.index)}
                  className="mb-0 flex items-center"
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                      style={{ backgroundColor: ch.color || "#ccc" }}
                    />
                    <span className="text-sm">
                      {ch.name || `Channel ${ch.index}`}
                    </span>
                  </span>
                </Checkbox>
              )}
              {hasSlider && (
                <div className={`${multiChannel ? "pl-6" : ""} pr-1 pb-2`}>
                  <RangeSlider
                    min={ch.window.min}
                    max={ch.window.max}
                    stepSize={Math.max(
                      1,
                      Math.floor((ch.window.max - ch.window.min) / 500),
                    )}
                    value={[win.start, win.end]}
                    onChange={([start, end]) =>
                      onWindowChange(ch.index, { start, end })
                    }
                    labelRenderer={false}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ImageChannelControls;
