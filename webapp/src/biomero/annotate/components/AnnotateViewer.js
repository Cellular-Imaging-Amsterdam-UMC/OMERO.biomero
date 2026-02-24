/**
 * Thin wrapper around AnnotationViewer that supports z/t/c props on the image object.
 *
 * The StarDist AnnotationViewer hardcodes Z=0, T=0 and renders all channels.
 * This wrapper intercepts the image prop and rewrites the thumbnail URL so the
 * correct plane is shown.  It does this by overriding the image URL via a
 * hidden <img> preload and patching the AnnotationViewer's expected URL
 * pattern through a custom image object.
 *
 * Approach: We construct a modified image ID string that encodes the z/t/c
 * parameters.  Because the AnnotationViewer builds the URL as:
 *   `/webgateway/render_image/${image.id}/${Z}/${T}/`
 * with Z=0 and T=0, we override `image.id` to include the actual z and t:
 *   image.id = `${realId}/${z}/${t}` so the URL becomes
 *   `/webgateway/render_image/${realId}/${z}/${t}/0/0/`
 * But this adds extra path segments which won't work.
 *
 * Instead, we'll use a simpler approach: pass an imageUrl override.
 * Since AnnotationViewer doesn't accept a custom URL prop, we need to
 * duplicate the minimal viewer logic here.
 *
 * Actually the simplest fix: AnnotationViewer uses the pattern:
 *   `/webgateway/render_image/${image.id}/${Z}/${T}/`
 * We can make Z and T dynamic by also passing them on the image object.
 * Let's just fork the URL construction.
 */

import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  Button,
  Slider,
  ButtonGroup,
  Icon,
  InputGroup,
  Checkbox,
} from "@blueprintjs/core";
import {
  traceContours,
  subtractAnnotations,
  eraseFromAnnotations,
} from "../../stardist/utils/GeometryUtils";

/**
 * AnnotateViewer — adapted from StarDist AnnotationViewer with z/t/c support.
 *
 * Props:
 *   image: { id, name, z?, t?, c? }
 *   annotations, onAnnotationsChange, featureTypes, onFeatureTypesChange
 *   (same as AnnotationViewer)
 */
const AnnotateViewer = ({
  image,
  annotations,
  onAnnotationsChange,
  featureTypes,
  onFeatureTypesChange,
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // View State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  // Tool State
  const [tool, setTool] = useState("brush");
  const [brushSize, setBrushSize] = useState(20);
  const [collisionDetection, setCollisionDetection] = useState(false);
  const [mode, setMode] = useState("add");

  // Feature Types State
  const [activeFeatureType, setActiveFeatureType] = useState(
    featureTypes[0]?.id || "1"
  );
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newFeatureColor, setNewFeatureColor] = useState("#ff0000");
  const [editingFeatureId, setEditingFeatureId] = useState(null);

  // Interaction State
  const [currentPoints, setCurrentPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const maskCanvas = useMemo(() => document.createElement("canvas"), []);

  // Track actual image dimensions for the save flow
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });

  // Build image URL with z/t/c support
  const Z = image?.z ?? 0;
  const T = image?.t ?? 0;
  const C = image?.c;
  let imageUrl = null;
  if (image) {
    imageUrl = `/webgateway/render_image/${image.id}/${Z}/${T}/`;
    // Optionally select a single channel
    if (C !== undefined && C !== null) {
      imageUrl += `?c=${C + 1}|0:255$FFFFFF`;
    }
  }

  useEffect(() => {
    if (featureTypes.length > 0) {
      if (
        !activeFeatureType ||
        !featureTypes.find((ft) => ft.id === activeFeatureType)
      ) {
        setActiveFeatureType(featureTypes[0].id);
      }
    } else {
      setActiveFeatureType(null);
    }
  }, [featureTypes, activeFeatureType]);

  // Reset view when image changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [image?.id, Z, T, C]);

  // --- Drawing Helpers ---
  const getCanvasPoint = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    annotations.forEach((ann) => {
      if (!ann.points || ann.points.length < 2) return;
      const type = featureTypes.find((t) => t.id === ann.typeId) || {
        color: "yellow",
      };
      ctx.beginPath();
      ctx.moveTo(ann.points[0][0], ann.points[0][1]);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i][0], ann.points[i][1]);
      }
      ctx.closePath();
      ctx.strokeStyle = type.color;
      ctx.lineWidth = 2;
      ctx.fillStyle = type.color + "33";
      ctx.stroke();
      ctx.fill();
    });

    if (tool === "polygon" && currentPoints.length > 0) {
      ctx.strokeStyle = mode === "subtract" ? "red" : "lime";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentPoints[0][0], currentPoints[0][1]);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i][0], currentPoints[i][1]);
      }
      ctx.stroke();
      ctx.fillStyle = mode === "subtract" ? "red" : "lime";
      const ptSize = 3;
      currentPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], ptSize, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  };

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [annotations, currentPoints, zoom, pan, featureTypes, mode]);

  // --- Handlers ---
  const handleMouseDown = (e) => {
    if (!image) return;
    if (tool === "pan") {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    if (mode === "add" && (!featureTypes.length || !activeFeatureType)) return;

    const pt = getCanvasPoint(e);
    if (tool === "polygon") {
      if (currentPoints.length > 2) {
        const start = currentPoints[0];
        const dist = Math.hypot(pt.x - start[0], pt.y - start[1]);
        if (dist < 10 / zoom) {
          finishPolygon();
          return;
        }
      }
      setCurrentPoints([...currentPoints, [pt.x, pt.y]]);
    } else if (tool === "brush") {
      setIsDrawing(true);
      if (
        maskCanvas.width !== canvasRef.current.width ||
        maskCanvas.height !== canvasRef.current.height
      ) {
        maskCanvas.width = canvasRef.current.width;
        maskCanvas.height = canvasRef.current.height;
      }
      const mCtx = maskCanvas.getContext("2d");
      mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      mCtx.fillStyle = "white";
      mCtx.beginPath();
      mCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      mCtx.fill();
    }
  };

  const handleMouseMove = (e) => {
    if (tool === "pan" && isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    if (tool === "brush" && isDrawing) {
      const pt = getCanvasPoint(e);
      const mCtx = maskCanvas.getContext("2d");
      mCtx.beginPath();
      mCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      mCtx.fill();
      const ctx = canvasRef.current.getContext("2d");
      const type = featureTypes.find((t) => t.id === activeFeatureType);
      const color =
        mode === "subtract" ? "#ff0000" : type?.color || "yellow";
      ctx.fillStyle = color + "80";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handleMouseUp = () => {
    if (tool === "pan") {
      setIsPanning(false);
      return;
    }
    if (tool === "brush" && isDrawing) {
      setIsDrawing(false);
      const ctx = maskCanvas.getContext("2d");
      const imageData = ctx.getImageData(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height
      );
      const polys = traceContours(imageData);
      processNewPolygons(polys);
      draw();
    }
  };

  const finishPolygon = () => {
    if (currentPoints.length < 3) {
      setCurrentPoints([]);
      return;
    }
    processNewPolygons([currentPoints]);
    setCurrentPoints([]);
  };

  const processNewPolygons = (newPolys) => {
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    if (mode === "subtract") {
      let currentAnns = [...annotations];
      newPolys.forEach((erasePoly) => {
        currentAnns = eraseFromAnnotations(
          erasePoly,
          currentAnns,
          width,
          height
        );
      });
      onAnnotationsChange(currentAnns);
    } else {
      const newAnns = newPolys.map((pts) => ({
        id: crypto.randomUUID(),
        points: pts,
        typeId: activeFeatureType,
        generated: true,
      }));
      if (collisionDetection) {
        handleCollisionAndAdd(newAnns);
      } else {
        onAnnotationsChange([...annotations, ...newAnns]);
      }
    }
  };

  const handleCollisionAndAdd = (newPolys) => {
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    let finalAnns = [...annotations];
    newPolys.forEach((newPoly) => {
      const resultPolys = subtractAnnotations(
        newPoly.points,
        finalAnns,
        width,
        height
      );
      resultPolys.forEach((pts) => {
        finalAnns.push({
          id: crypto.randomUUID(),
          points: pts,
          typeId: newPoly.typeId,
          generated: true,
        });
      });
    });
    onAnnotationsChange(finalAnns);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (tool === "polygon" && currentPoints.length > 2) {
      finishPolygon();
    } else {
      setCurrentPoints([]);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomSpeed = 0.001;
    const scaleAmount = -e.deltaY * zoomSpeed;
    const newZoom = Math.min(Math.max(0.1, zoom * (1 + scaleAmount)), 20);
    if (newZoom !== zoom) {
      const zoomRatio = newZoom / zoom;
      setPan((p) => ({
        x: mouseX - (mouseX - p.x) * zoomRatio,
        y: mouseY - (mouseY - p.y) * zoomRatio,
      }));
      setZoom(newZoom);
    }
  };

  const deleteAnnotation = (id) => {
    onAnnotationsChange(annotations.filter((a) => a.id !== id));
  };

  const addFeatureType = () => {
    if (!newFeatureName) return;
    const newType = {
      id: crypto.randomUUID(),
      name: newFeatureName,
      color: newFeatureColor,
    };
    onFeatureTypesChange([...featureTypes, newType]);
    setNewFeatureName("");
  };

  const deleteFeatureType = (id) => {
    onFeatureTypesChange(featureTypes.filter((t) => t.id !== id));
  };

  const updateFeatureName = (id, newName) => {
    onFeatureTypesChange(
      featureTypes.map((ft) => (ft.id === id ? { ...ft, name: newName } : ft))
    );
  };

  const handleImageLoad = (e) => {
    if (canvasRef.current) {
      canvasRef.current.width = e.target.naturalWidth;
      canvasRef.current.height = e.target.naturalHeight;
      setImageDims({
        width: e.target.naturalWidth,
        height: e.target.naturalHeight,
      });
      draw();
    }
  };

  // Expose image dimensions for the save flow
  useEffect(() => {
    if (imageDims.width > 0 && imageDims.height > 0 && image) {
      // Store on the image object so parent can access via ref if needed
      image._width = imageDims.width;
      image._height = imageDims.height;
    }
  }, [imageDims, image]);

  if (!image) return <div>Select an image</div>;

  return (
    <div className="flex h-full gap-4">
      {/* Toolbar */}
      <div className="w-64 flex flex-col gap-4 p-2 border-r bg-gray-50 overflow-y-auto shrink-0">
        <div className="flex flex-col gap-2">
          <h5>Tools</h5>
          <ButtonGroup fill>
            <Button
              icon="hand"
              active={tool === "pan"}
              onClick={() => setTool("pan")}
              title="Pan/Zoom"
            />
            <Button
              icon="polygon-filter"
              active={tool === "polygon"}
              onClick={() => setTool("polygon")}
              title="Polygon (Right Click to Finish)"
              disabled={mode === "add" && featureTypes.length === 0}
            />
            <Button
              icon="draw"
              active={tool === "brush"}
              onClick={() => setTool("brush")}
              title="Brush"
              disabled={mode === "add" && featureTypes.length === 0}
            />
          </ButtonGroup>

          <div className="flex gap-2 items-center mt-2 px-1">
            <span className="text-xs font-bold w-12">Mode:</span>
            <ButtonGroup>
              <Button
                small
                active={mode === "add"}
                onClick={() => setMode("add")}
                intent={mode === "add" ? "primary" : "none"}
              >
                Add
              </Button>
              <Button
                small
                active={mode === "subtract"}
                onClick={() => setMode("subtract")}
                intent={mode === "subtract" ? "danger" : "none"}
              >
                Subtract
              </Button>
            </ButtonGroup>
          </div>

          {mode === "add" && (
            <div className="mt-2 px-1">
              <Checkbox
                checked={collisionDetection}
                onChange={(e) => setCollisionDetection(e.target.checked)}
                label="Avoid Overlap"
              />
            </div>
          )}

          {tool === "brush" && (
            <div className="px-2 pt-2">
              <label>Brush Size: {brushSize} px</label>
              <Slider
                min={5}
                max={200}
                value={brushSize}
                onChange={setBrushSize}
                labelStepSize={50}
              />
            </div>
          )}
        </div>

        <div className="border-t pt-2">
          <h5>Features</h5>
          <div className="flex flex-col gap-2 mb-2">
            {featureTypes.map((ft) => (
              <div
                key={ft.id}
                className={`p-1 border rounded cursor-pointer flex items-center gap-2 ${
                  activeFeatureType === ft.id
                    ? "ring-2 ring-blue-500 bg-blue-50"
                    : "bg-white"
                }`}
                onClick={() => setActiveFeatureType(ft.id)}
              >
                <div
                  className="w-4 h-4 rounded-full border"
                  style={{ background: ft.color }}
                />
                {editingFeatureId === ft.id ? (
                  <input
                    className="flex-1 min-w-0 text-sm border rounded px-1"
                    value={ft.name}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateFeatureName(ft.id, e.target.value)}
                    onBlur={() => setEditingFeatureId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingFeatureId(null);
                    }}
                  />
                ) : (
                  <span
                    className="text-sm flex-1 truncate"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFeatureType(ft.id);
                      setEditingFeatureId(ft.id);
                    }}
                  >
                    {ft.name}
                  </span>
                )}
                <Icon
                  icon="cross"
                  size={12}
                  className="text-gray-400 hover:text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFeatureType(ft.id);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-1 flex-col mt-2 p-2 bg-white rounded border">
            <InputGroup
              placeholder="Name"
              value={newFeatureName}
              onChange={(e) => setNewFeatureName(e.target.value)}
              small
            />
            <div className="flex gap-1">
              <input
                type="color"
                value={newFeatureColor}
                onChange={(e) => setNewFeatureColor(e.target.value)}
                className="h-6 w-8 p-0 border-0 cursor-pointer"
              />
              <Button
                icon="add"
                small
                onClick={addFeatureType}
                disabled={!newFeatureName}
                fill
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t pt-2 flex-1 overflow-auto min-h-[100px]">
          <h5>Annotations ({annotations.length})</h5>
          <div className="flex flex-col gap-1">
            {annotations.map((ann, i) => {
              const ft = featureTypes.find((t) => t.id === ann.typeId);
              return (
                <div
                  key={ann.id}
                  className="flex justify-between items-center text-xs p-1 bg-white border hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: ft?.color || "gray" }}
                    />
                    <span>
                      {ft?.name || "Unknown"} #{i + 1}
                    </span>
                  </div>
                  <Button
                    icon="trash"
                    minimal
                    small
                    onClick={() => deleteAnnotation(ann.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div
        className="flex-1 relative overflow-hidden bg-gray-200 border rounded cursor-crosshair"
        ref={containerRef}
        onWheel={handleWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: isPanning ? "none" : "transform 0.1s",
          }}
          className="inline-block origin-top-left relative"
        >
          <img
            src={imageUrl}
            alt="work"
            className="block pointer-events-none select-none max-w-none"
            onLoad={handleImageLoad}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
          />
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <Button
            icon="minus"
            onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
          />
          <Button text={`${Math.round(zoom * 100)}%`} disabled />
          <Button
            icon="plus"
            onClick={() => setZoom((z) => Math.min(10, z * 1.2))}
          />
          <Button
            icon="reset"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AnnotateViewer;
