import React from "react";
import { Button, Checkbox, NumericInput, ControlGroup} from "@blueprintjs/core";

const ImageChannelControls = ({
  channels,
  visibility,
  onToggle,
  channelScales = {},
  onChannelScaleChange,
  onChannelAutoScale,
  title = "Image Channels",
  normalizationLabel = "Normalization",
  lockedChannelIndex = null,
  showAutoButton = true,
}) => {
  if (!channels || channels.length === 0) return null;

  return (
    <div className="min-w-0">
      <div className="text-xs font-bold uppercase text-gray-500 mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-3">
        {channels.map((ch) => (
          <div key={ch.index} className="rounded border bg-white p-2.5 min-w-0 relative">
            <div className="flex items-center justify-between gap-2 mb-2">
              <Checkbox
                checked={visibility?.[ch.index] !== false}
                onChange={() => onToggle?.(ch.index)}
                className="mb-0 min-w-0"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-gray-300 shrink-0"
                    style={{ backgroundColor: ch.color || '#ccc' }}
                  />
                  <span className="text-sm font-medium truncate">
                    {ch.name || `Channel ${ch.index}`}
                  </span>
                </span>
              </Checkbox>

              {showAutoButton && (
                <Button small minimal onClick={() => onChannelAutoScale?.(ch.index)}>
                  Auto
                </Button>
              )}
            </div>

            <ControlGroup fill={true} vertical={false} className="gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="normalization-input-label">Min</span>
                <NumericInput
                  min={0}
                  max={100}
                  stepSize={0.500}
                  value={channelScales?.[ch.index]?.min ?? 0}
                  onValueChange={(valueAsNumber) => onChannelScaleChange?.(ch.index, "min", valueAsNumber)}
                  className="normalization-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="normalization-input-label">Max</span>
                <NumericInput
                  min={0}
                  max={100}
                  stepSize={0.5}
                  value={channelScales?.[ch.index]?.max ?? 100}
                  onValueChange={(valueAsNumber) => onChannelScaleChange?.(ch.index, "max", valueAsNumber)}
                  className="normalization-input"
                />
              </div>
            </ControlGroup>

            <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-2">
              {normalizationLabel}
            </div>

            {lockedChannelIndex !== null && String(lockedChannelIndex) === String(ch.index) && (
              <div className="absolute inset-0 rounded bg-white/35 cursor-not-allowed z-10" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageChannelControls;
