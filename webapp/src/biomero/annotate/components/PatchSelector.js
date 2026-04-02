import React from "react";
import { Button, Card, Elevation } from "@blueprintjs/core";

const getPatchPreviewStyle = (patch, image) => {
  const imageWidth = Number(image?.sizeX || patch.imageWidth || patch.width || 1);
  const imageHeight = Number(image?.sizeY || patch.imageHeight || patch.height || 1);
  const patchWidth = Number(patch.width || 1);
  const patchHeight = Number(patch.height || 1);
  const offsetX = Number(patch.x || 0);
  const offsetY = Number(patch.y || 0);

  return {
    width: `${(imageWidth / patchWidth) * 100}%`,
    height: `${(imageHeight / patchHeight) * 100}%`,
    marginLeft: `-${(offsetX / patchWidth) * 100}%`,
    marginTop: `-${(offsetY / patchHeight) * 100}%`,
    maxWidth: "none",
  };
};

const PatchSelector = ({
  patches,
  imagesById,
  thumbnails,
  selectedPatchId,
  onSelect,
  onAddPatch,
  onRemovePatch,
  totalAnnotations,
  annotationCounts,
}) => {
  if (patches.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-2 border rounded bg-white">
        <div className="text-sm text-gray-500">No patches yet. Generate the first patch to start patch-based annotation.</div>
        <Button icon="add" intent="primary" onClick={onAddPatch}>
          Add New Patch
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
        <span>{`${patches.length} patches`}</span>
        <span>{`${totalAnnotations} total annotations`}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 overflow-y-auto p-2 border rounded bg-white max-h-[400px]">
        {patches.map((patch, index) => {
          const image = imagesById[String(patch.imageId)] || null;
          const annotationCount = annotationCounts[String(patch.id)] || 0;
          const thumbnailSrc = thumbnails[patch.imageId];

          return (
            <Card
              key={patch.id}
              interactive
              elevation={String(selectedPatchId) === String(patch.id) ? Elevation.TWO : Elevation.ZERO}
              className={`p-2 cursor-pointer flex flex-col gap-2 ${
                String(selectedPatchId) === String(patch.id)
                  ? "bg-blue-100 border-blue-500 border"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => onSelect(patch)}
            >
              <div className="w-full aspect-square bg-gray-100 rounded overflow-hidden relative">
                <Button
                  icon="cross"
                  minimal
                  small
                  className="!absolute top-1 right-1 z-10 bg-white/90"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemovePatch(patch);
                  }}
                />
                {thumbnailSrc ? (
                  <img src={thumbnailSrc} alt={patch.imageName || `Patch ${index + 1}`} style={getPatchPreviewStyle(patch, image)} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">No Thumb</div>
                )}
              </div>

              <div className="text-xs font-medium truncate" title={patch.imageName || image?.name || `Image ${patch.imageId}`}>
                {patch.imageName || image?.name || `Image ${patch.imageId}`}
              </div>
              <div className="text-[11px] text-gray-500">{`Patch ${index + 1} · ${patch.width}x${patch.height}`}</div>
              <div className="text-[11px] text-gray-500">{`x:${patch.x}, y:${patch.y}`}</div>
              <div className="text-[11px] text-gray-600">{`${annotationCount} annotations`}</div>
            </Card>
          );
        })}
      </div>

      <Button icon="add" onClick={onAddPatch}>
        Add New Patch
      </Button>
    </div>
  );
};

export default PatchSelector;