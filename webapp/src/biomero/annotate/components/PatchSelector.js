import React from "react";
import { Button, Card, Elevation } from "@blueprintjs/core";

const getPatchPreviewStyle = (patch, imageWidth, imageHeight) => {
  const pW = Number(patch.patch_width || 1);
  const pH = Number(patch.patch_height || 1);
  const oX = Number(patch.patch_x || 0);
  const oY = Number(patch.patch_y || 0);
  const iW = Number(imageWidth || 1);
  const iH = Number(imageHeight || 1);

  return {
    width: `${(iW / pW) * 100}%`,
    height: `${(iH / pH) * 100}%`,
    marginLeft: `-${(oX / pW) * 100}%`,
    marginTop: `-${(oY / pH) * 100}%`,
    maxWidth: "none",
  };
};

/**
 * Displays patches for the current image with thumbnail previews.
 *
 * Props:
 *   patches: array of unit objects where is_patch === true for the selected image
 *   selectedPatchIndex: index of the currently selected patch (in the full units array)
 *   imageId: current image ID (for thumbnail URL)
 *   imageWidth: image width in pixels
 *   imageHeight: image height in pixels
 *   onSelectPatch: (unitIndex) => void
 *   onAddPatch: () => void
 *   onRemovePatch: (unitIndex) => void — optional, for removing patches
 */
const PatchSelector = ({
  patches = [],
  selectedPatchIndex,
  imageId,
  imageWidth,
  imageHeight,
  onSelectPatch,
  onAddPatch,
  onRemovePatch,
}) => {
  const thumbnailUrl = imageId
    ? `/webgateway/render_thumbnail/${imageId}/96/`
    : null;

  if (patches.length === 0) {
    return (
      <div style={{ padding: 8 }}>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          No patches for this image.
        </p>
        <Button icon="add" small onClick={onAddPatch}>
          Add Patch
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "#888",
        }}
      >
        <span>{patches.length} patches</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {patches.map((patch, i) => {
          const isSelected = patch._unitIndex === selectedPatchIndex;
          return (
            <Card
              key={patch._unitIndex}
              interactive
              elevation={isSelected ? Elevation.TWO : Elevation.ZERO}
              style={{
                padding: 6,
                cursor: "pointer",
                background: isSelected ? "#e8f0fe" : undefined,
                border: isSelected ? "1px solid #4a90d9" : "1px solid #ddd",
              }}
              onClick={() => onSelectPatch(patch._unitIndex)}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  background: "#f0f0f0",
                  borderRadius: 4,
                  overflow: "hidden",
                  position: "relative",
                  marginBottom: 4,
                }}
              >
                {onRemovePatch && (
                  <Button
                    icon="cross"
                    minimal
                    small
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      zIndex: 10,
                      background: "rgba(255,255,255,0.9)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePatch(patch._unitIndex);
                    }}
                  />
                )}
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={`Patch ${i + 1}`}
                    style={getPatchPreviewStyle(patch, imageWidth, imageHeight)}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      fontSize: 10,
                      color: "#aaa",
                    }}
                  >
                    No preview
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500 }}>
                Patch {i + 1}
              </div>
              <div style={{ fontSize: 10, color: "#888" }}>
                {patch.patch_width}x{patch.patch_height} at ({patch.patch_x},{patch.patch_y})
              </div>
              <div style={{ fontSize: 10, color: patch.processed ? "#0d8050" : "#888" }}>
                {patch.processed ? "✓ Done" : "Pending"}
              </div>
            </Card>
          );
        })}
      </div>

      <Button icon="add" small onClick={onAddPatch}>
        Add Patch
      </Button>
    </div>
  );
};

export default PatchSelector;
