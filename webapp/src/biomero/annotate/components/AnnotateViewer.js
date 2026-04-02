/**
 * AnnotateViewer — annotation editor with z/t/c support.
 *
 * Uses SVG overlay for vector-quality annotations at any zoom level.
 * A secondary canvas is used only for brush stroke preview (performance).
 *
 * Props:
 *   image: { id, name, z?, t?, c? }
 *   annotations, onAnnotationsChange, featureTypes, onFeatureTypesChange
 *   channelInfo, channels, patch
 */

import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  Button,
  Slider,
  ButtonGroup,
  Icon,
  InputGroup,
  Checkbox,
  Spinner,
  Tag,
  Intent,
} from "@blueprintjs/core";
import ImageChannelControls from "./ImageChannelControls";
import {
  traceContours,
  subtractAnnotations,
  appendToAnnotations,
  eraseFromAnnotations,
} from "../utils/GeometryUtils";
import { samSetImage, samPredict } from "../../../apiService";

const AnnotateViewer = ({
  image,
  annotations,
  onAnnotationsChange,
  featureTypes,
  onFeatureTypesChange,
  channelInfo,
  channels = [],
  patch,
}) => {
  const svgRef = useRef(null);
  const brushCanvasRef = useRef(null);
  const containerRef = useRef(null);

  // View State
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  // Tool State
  const [tool, setTool] = useState("brush");
  const [brushSize, setBrushSize] = useState(20);
  const [collisionDetection, setCollisionDetection] = useState(true);
  const [mode, setMode] = useState("add"); // "add" | "subtract" | "append"

  // Selection state for click-to-select
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  // Feature Types State
  const [activeFeatureType, setActiveFeatureType] = useState(
    featureTypes[0]?.id || "1",
  );
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newFeatureColor, setNewFeatureColor] = useState("#ff0000");
  const [editingFeatureId, setEditingFeatureId] = useState(null);

  // Interaction State
  const [currentPoints, setCurrentPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // SAM State
  const [samPoints, setSamPoints] = useState([]);
  const [samBox, setSamBox] = useState(null);
  const [samBoxStart, setSamBoxStart] = useState(null);
  const [samPreviewPolys, setSamPreviewPolys] = useState([]);
  const [samCacheKey, setSamCacheKey] = useState(null);
  const [samLoading, setSamLoading] = useState(false);

  const maskCanvas = useMemo(() => document.createElement("canvas"), []);

  // Track actual image dimensions for the save flow
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });

  // Channel visibility and contrast state (mirrors PreviewViewer pattern)
  const [channelVisibility, setChannelVisibility] = useState({});
  const [channelScales, setChannelScales] = useState({});

  // Initialize channel visibility and scales when channels prop changes
  useEffect(() => {
    if (channels.length > 0) {
      const vis = {};
      const scales = {};
      channels.forEach((ch) => {
        vis[ch.index] = ch.active !== false;
        if (ch.window) {
          const range = ch.window.max - ch.window.min;
          scales[ch.index] = {
            min: range > 0 ? ((ch.window.start - ch.window.min) / range) * 100 : 0,
            max: range > 0 ? ((ch.window.end - ch.window.min) / range) * 100 : 100,
          };
        } else {
          scales[ch.index] = { min: 0, max: 100 };
        }
      });
      setChannelVisibility(vis);
      setChannelScales(scales);
    }
  }, [channels]);

  const toggleChannelVisibility = (idx) => {
    setChannelVisibility((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleChannelScaleChange = (idx, type, value) => {
    setChannelScales((prev) => {
      const current = prev[idx] || { min: 0, max: 100 };
      if (type === "min") return { ...prev, [idx]: { ...current, min: value } };
      if (type === "max") return { ...prev, [idx]: { ...current, max: value } };
      if (type === "range") return { ...prev, [idx]: { min: value[0], max: value[1] } };
      return prev;
    });
  };

  const handleChannelAutoScale = (idx) => {
    setChannelScales((prev) => ({ ...prev, [idx]: { min: 0, max: 100 } }));
  };

  // Patch viewport clipping
  const patchOffsetX = patch ? Number(patch.patch_x || 0) : 0;
  const patchOffsetY = patch ? Number(patch.patch_y || 0) : 0;
  const patchWidth = patch ? Number(patch.patch_width) : null;
  const patchHeight = patch ? Number(patch.patch_height) : null;

  // Overlay dimensions (patch size or full image size)
  const overlayWidth = patchWidth !== null ? patchWidth : imageDims.width;
  const overlayHeight = patchHeight !== null ? patchHeight : imageDims.height;

  // Build image URL with z/t/c support and per-channel contrast
  const Z = image?.z ?? 0;
  const T = image?.t ?? 0;
  const C = image?.c;
  const imageUrl = useMemo(() => {
    if (!image) return null;
    const base = `/webgateway/render_image/${image.id}/${Z}/${T}/`;

    if (channels.length > 0) {
      const channelParam = channels
        .map((ch) => {
          const chNum = ch.index + 1;
          const visible = channelVisibility[ch.index] !== false;
          const prefix = visible ? "" : "-";
          const scale = channelScales[ch.index];
          if (scale && ch.window) {
            const range = ch.window.max - ch.window.min;
            const winStart = Math.round(ch.window.min + (range * scale.min) / 100);
            const winEnd = Math.round(ch.window.min + (range * scale.max) / 100);
            const color = (ch.color || "#ffffff").replace("#", "");
            return `${prefix}${chNum}|${winStart}:${winEnd}$${color}`;
          }
          return `${prefix}${chNum}`;
        })
        .join(",");
      return `${base}?c=${channelParam}&q=1.0`;
    }

    if (C !== undefined && C !== null && channelInfo?.window) {
      return `${base}?c=${C + 1}|${channelInfo.window.start}:${channelInfo.window.end}$FFFFFF&q=1.0`;
    }
    return `${base}?q=1.0`;
  }, [image, Z, T, C, channels, channelVisibility, channelScales, channelInfo]);

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
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [image?.id, Z, T, C]);

  // Keep zoomRef in sync with zoom state
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // --- Coordinate Helpers ---
  const getOverlayPoint = (e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * overlayWidth,
      y: ((e.clientY - rect.top) / rect.height) * overlayHeight,
    };
  };

  // --- Handlers ---
  const handleMouseDown = (e) => {
    if (!image) return;
    if (tool === "pan") {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    if (mode === "add" && (!featureTypes.length || !activeFeatureType)) return;

    const pt = getOverlayPoint(e);
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
      // Size brush canvas and mask canvas to overlay dimensions
      const bCanvas = brushCanvasRef.current;
      if (bCanvas && (bCanvas.width !== overlayWidth || bCanvas.height !== overlayHeight)) {
        bCanvas.width = overlayWidth;
        bCanvas.height = overlayHeight;
      }
      if (maskCanvas.width !== overlayWidth || maskCanvas.height !== overlayHeight) {
        maskCanvas.width = overlayWidth;
        maskCanvas.height = overlayHeight;
      }
      const mCtx = maskCanvas.getContext("2d");
      mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      mCtx.fillStyle = "white";
      mCtx.beginPath();
      mCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      mCtx.fill();
      // Draw brush preview
      if (bCanvas) {
        const bCtx = bCanvas.getContext("2d");
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
        const type = featureTypes.find((t) => t.id === activeFeatureType);
        const color = mode === "subtract" ? "#ff0000" : type?.color || "yellow";
        bCtx.fillStyle = color + "80";
        bCtx.beginPath();
        bCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
        bCtx.fill();
      }
    } else if (tool === "sam-point") {
      const label = e.shiftKey ? 0 : 1;
      const newPoints = [...samPoints, { x: pt.x, y: pt.y, label }];
      setSamPoints(newPoints);
      runSamPredict(newPoints, null);
    } else if (tool === "sam-box") {
      setSamBoxStart({ x: pt.x, y: pt.y });
      setSamBox(null);
      setSamPreviewPolys([]);
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
      const pt = getOverlayPoint(e);
      const mCtx = maskCanvas.getContext("2d");
      mCtx.beginPath();
      mCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      mCtx.fill();
      // Draw brush preview on brushCanvas
      const bCanvas = brushCanvasRef.current;
      if (bCanvas) {
        const bCtx = bCanvas.getContext("2d");
        const type = featureTypes.find((t) => t.id === activeFeatureType);
        const color = mode === "subtract" ? "#ff0000" : type?.color || "yellow";
        bCtx.fillStyle = color + "80";
        bCtx.beginPath();
        bCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
        bCtx.fill();
      }
    }

    if (tool === "sam-box" && samBoxStart) {
      const pt = getOverlayPoint(e);
      setSamBox({
        x1: Math.min(samBoxStart.x, pt.x),
        y1: Math.min(samBoxStart.y, pt.y),
        x2: Math.max(samBoxStart.x, pt.x),
        y2: Math.max(samBoxStart.y, pt.y),
      });
    }
  };

  const handleMouseUp = (e) => {
    if (tool === "pan") {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        handleClickSelect(e);
      }
      setIsPanning(false);
      return;
    }
    if (tool === "brush" && isDrawing) {
      setIsDrawing(false);
      // Clear brush preview
      const bCanvas = brushCanvasRef.current;
      if (bCanvas) {
        const bCtx = bCanvas.getContext("2d");
        bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
      }
      const ctx = maskCanvas.getContext("2d");
      const imageData = ctx.getImageData(
        0,
        0,
        maskCanvas.width,
        maskCanvas.height,
      );
      const polys = traceContours(imageData);
      processNewPolygons(polys);
    }

    if (tool === "sam-box" && samBoxStart && e) {
      const pt = getOverlayPoint(e);
      const box = {
        x1: Math.min(samBoxStart.x, pt.x),
        y1: Math.min(samBoxStart.y, pt.y),
        x2: Math.max(samBoxStart.x, pt.x),
        y2: Math.max(samBoxStart.y, pt.y),
      };
      setSamBoxStart(null);
      if (Math.abs(box.x2 - box.x1) > 3 && Math.abs(box.y2 - box.y1) > 3) {
        setSamBox(box);
        runSamPredict(null, box);
      }
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
    const width = overlayWidth;
    const height = overlayHeight;
    if (mode === "subtract") {
      let currentAnns = [...annotations];
      newPolys.forEach((erasePoly) => {
        currentAnns = eraseFromAnnotations(
          erasePoly,
          currentAnns,
          width,
          height,
        );
      });
      onAnnotationsChange(currentAnns);
    } else if (mode === "append") {
      newPolys.forEach((pts) => {
        const sameTypeAnns = annotations.filter((a) => a.typeId === activeFeatureType);
        const merged = appendToAnnotations(pts, sameTypeAnns, width, height);
        if (merged) {
          const otherAnns = annotations.filter((a) => a.typeId !== activeFeatureType);
          onAnnotationsChange([...otherAnns, ...merged]);
        } else {
          onAnnotationsChange([...annotations, {
            id: crypto.randomUUID(),
            points: pts,
            typeId: activeFeatureType,
            generated: true,
          }]);
        }
      });
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
    const width = overlayWidth;
    const height = overlayHeight;
    let finalAnns = [...annotations];
    newPolys.forEach((newPoly) => {
      const resultPolys = subtractAnnotations(
        newPoly.points,
        finalAnns,
        width,
        height,
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
    const currentZoom = zoomRef.current;
    const newZoom = Math.min(Math.max(0.1, currentZoom * (1 + scaleAmount)), 20);
    if (newZoom !== currentZoom) {
      const zoomRatio = newZoom / currentZoom;
      zoomRef.current = newZoom;
      setPan((p) => ({
        x: mouseX - (mouseX - p.x) * zoomRatio,
        y: mouseY - (mouseY - p.y) * zoomRatio,
      }));
      setZoom(newZoom);
    }
  };

  const deleteAnnotation = (id) => {
    onAnnotationsChange(annotations.filter((a) => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  // Point-in-polygon for click-to-select
  const pointInPolygon = (x, y, points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i][0], yi = points[i][1];
      const xj = points[j][0], yj = points[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  const handleClickSelect = (e) => {
    const pt = getOverlayPoint(e);
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (annotations[i].points && pointInPolygon(pt.x, pt.y, annotations[i].points)) {
        setSelectedAnnotationId(annotations[i].id);
        return;
      }
    }
    setSelectedAnnotationId(null);
  };

  // Delete key handler for selected annotation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotationId) {
        e.preventDefault();
        deleteAnnotation(selectedAnnotationId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAnnotationId, annotations, onAnnotationsChange]);

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
      featureTypes.map((ft) => (ft.id === id ? { ...ft, name: newName } : ft)),
    );
  };

  const handleImageLoad = (e) => {
    const naturalW = e.target.naturalWidth;
    const naturalH = e.target.naturalHeight;
    setImageDims({ width: naturalW, height: naturalH });
  };

  // Expose image dimensions for the save flow
  useEffect(() => {
    if (imageDims.width > 0 && imageDims.height > 0 && image) {
      image._width = imageDims.width;
      image._height = imageDims.height;
    }
  }, [imageDims, image]);

  // --- SAM Helpers ---

  // Clear SAM state when image changes
  useEffect(() => {
    setSamCacheKey(null);
    setSamPoints([]);
    setSamBox(null);
    setSamBoxStart(null);
    setSamPreviewPolys([]);
  }, [image?.id, Z, T, C]);

  const ensureSamImage = useCallback(async () => {
    if (samCacheKey) return samCacheKey;
    if (!image) return null;
    try {
      const res = await samSetImage(image.id, Z, T, C ?? 0);
      setSamCacheKey(res.cache_key);
      return res.cache_key;
    } catch (e) {
      console.error("SAM set_image failed:", e);
      return null;
    }
  }, [image, Z, T, C, samCacheKey]);

  const runSamPredict = useCallback(
    async (points, box) => {
      setSamLoading(true);
      try {
        const key = await ensureSamImage();
        if (!key) return;
        const kwargs = {
          imageId: image.id,
          z: Z,
          t: T,
          channel: C ?? 0,
        };
        if (points && points.length > 0) {
          kwargs.points = points.map((p) => [p.x, p.y]);
          kwargs.labels = points.map((p) => p.label);
        }
        if (box) {
          kwargs.bboxes = [[box.x1, box.y1, box.x2, box.y2]];
        }
        const res = await samPredict(key, kwargs);
        setSamPreviewPolys(res.polygons || []);
      } catch (e) {
        console.error("SAM predict failed:", e);
      } finally {
        setSamLoading(false);
      }
    },
    [ensureSamImage, image, Z, T, C],
  );

  const acceptSamPreview = useCallback(() => {
    if (samPreviewPolys.length === 0) return;
    const newAnns = samPreviewPolys.map((pts) => ({
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
    clearSam();
  }, [
    samPreviewPolys,
    activeFeatureType,
    collisionDetection,
    annotations,
    onAnnotationsChange,
  ]);

  const clearSam = () => {
    setSamPoints([]);
    setSamBox(null);
    setSamBoxStart(null);
    setSamPreviewPolys([]);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (tool !== "sam-point" && tool !== "sam-box") return;
      if (e.key === "Enter") {
        e.preventDefault();
        acceptSamPreview();
      } else if (e.key === "Escape") {
        e.preventDefault();
        clearSam();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tool, acceptSamPreview]);

  // --- SVG Rendering Helpers ---
  const pointsToSvg = (pts) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

  const previewType = featureTypes.find((ft) => ft.id === activeFeatureType);
  const previewColor = previewType?.color || "#00ff00";

  if (!image) return <div>Select an image</div>;

  // SVG overlay element (shared between patch and normal mode)
  const svgOverlay = overlayWidth > 0 && overlayHeight > 0 ? (
    <svg
      ref={svgRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
      }}
      viewBox={`0 0 ${overlayWidth} ${overlayHeight}`}
      preserveAspectRatio="none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      {/* 1. Completed annotations */}
      {annotations.map((ann) => {
        if (!ann.points || ann.points.length < 2) return null;
        const type = featureTypes.find((t) => t.id === ann.typeId) || { color: "yellow" };
        return (
          <polygon
            key={ann.id}
            points={pointsToSvg(ann.points)}
            fill={type.color + "33"}
            stroke={type.color}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* 2. Selection highlight */}
      {selectedAnnotationId && (() => {
        const selected = annotations.find((a) => a.id === selectedAnnotationId);
        if (!selected?.points || selected.points.length < 2) return null;
        return (
          <polygon
            points={pointsToSvg(selected.points)}
            fill="none"
            stroke="#4a9eed"
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        );
      })()}

      {/* 3. In-progress polygon */}
      {tool === "polygon" && currentPoints.length > 0 && (
        <>
          <polyline
            points={pointsToSvg(currentPoints)}
            fill="none"
            stroke={mode === "subtract" ? "red" : "lime"}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {currentPoints.map((p, i) => (
            <circle
              key={i}
              cx={p[0]}
              cy={p[1]}
              r={2}
              fill={mode === "subtract" ? "red" : "lime"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      )}

      {/* 4. SAM prompts and preview */}
      {(tool === "sam-point" || tool === "sam-box") && (
        <>
          {samPoints.map((p, i) => (
            <circle
              key={`sam-pt-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={p.label === 1 ? "#00ff00" : "#ff0000"}
              stroke="#ffffff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {samBox && (
            <rect
              x={samBox.x1}
              y={samBox.y1}
              width={samBox.x2 - samBox.x1}
              height={samBox.y2 - samBox.y1}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {samPreviewPolys.map((pts, i) => {
            if (!pts || pts.length < 3) return null;
            return (
              <polygon
                key={`sam-preview-${i}`}
                points={pointsToSvg(pts)}
                fill={previewColor + "33"}
                stroke={previewColor}
                strokeWidth={1}
                strokeDasharray="8 4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </>
      )}
    </svg>
  ) : null;

  // Brush preview canvas (between image and SVG)
  const brushCanvas = (
    <canvas
      ref={brushCanvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );

  return (
    <div className="flex h-full gap-4">
      {/* Toolbar */}
      <div className="w-64 flex flex-col gap-4 p-2 border-r bg-gray-50 overflow-y-auto shrink-0">
        {/* Channel controls */}
        {channels.length > 0 && (
          <div className="border-b pb-2">
            <ImageChannelControls
              channels={channels}
              visibility={channelVisibility}
              onToggle={toggleChannelVisibility}
              channelScales={channelScales}
              onChannelScaleChange={handleChannelScaleChange}
              onChannelAutoScale={handleChannelAutoScale}
              title="Channels"
              lockedChannelIndex={null}
            />
          </div>
        )}

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
            <Button
              icon="locate"
              active={tool === "sam-point"}
              onClick={() => {
                setTool("sam-point");
                clearSam();
              }}
              title="SAM Point Prompt (Click=fg, Shift+Click=bg)"
              disabled={mode !== "add" || featureTypes.length === 0}
            />
            <Button
              icon="select"
              active={tool === "sam-box"}
              onClick={() => {
                setTool("sam-box");
                clearSam();
              }}
              title="SAM Box Prompt (Drag rectangle)"
              disabled={mode !== "add" || featureTypes.length === 0}
            />
          </ButtonGroup>

          {/* SAM controls */}
          {(tool === "sam-point" || tool === "sam-box") && (
            <div className="flex flex-col gap-1 mt-1 px-1">
              <div className="flex gap-1 items-center">
                <Button
                  small
                  intent="success"
                  icon="tick"
                  onClick={acceptSamPreview}
                  disabled={samPreviewPolys.length === 0}
                >
                  Accept
                </Button>
                <Button small icon="cross" onClick={clearSam}>
                  Clear
                </Button>
                {samLoading && <Spinner size={16} />}
              </div>
              {tool === "sam-point" && (
                <span className="text-xs text-gray-500">
                  Click=foreground, Shift+Click=background. Enter=accept,
                  Esc=clear
                </span>
              )}
              {tool === "sam-box" && (
                <span className="text-xs text-gray-500">
                  Drag rectangle around object. Enter=accept, Esc=clear
                </span>
              )}
            </div>
          )}

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
              <Button
                small
                active={mode === "append"}
                onClick={() => setMode("append")}
                intent={mode === "append" ? "success" : "none"}
              >
                Append
              </Button>
            </ButtonGroup>
          </div>

          {/* Selected annotation indicator */}
          {selectedAnnotationId && (() => {
            const ann = annotations.find((a) => a.id === selectedAnnotationId);
            const ft = ann ? featureTypes.find((t) => t.id === ann.typeId) : null;
            return (
              <div style={{ padding: 8, background: "#ffffcc", borderRadius: 4, fontSize: 12, textAlign: "center", marginTop: 8 }}>
                <em>Selected: {ft?.name || "Unknown"}</em><br />
                <span style={{ fontSize: 11, color: "#888" }}>Press Delete to remove</span>
              </div>
            );
          })()}

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
          {/* Classes section */}
          <div style={{ marginTop: 12 }}>
            <h6 style={{ marginBottom: 8 }}>Classes</h6>
            {featureTypes.map((ft) => {
              const count = annotations.filter((a) => a.typeId === ft.id).length;
              return (
                <div
                  key={ft.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    marginBottom: 4,
                    borderRadius: 4,
                    borderLeft: `3px solid ${ft.color}`,
                    background:
                      activeFeatureType === ft.id
                        ? "rgba(45, 114, 210, 0.15)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => setActiveFeatureType(ft.id)}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      background: ft.color,
                      borderRadius: 2,
                    }}
                  />
                  {editingFeatureId === ft.id ? (
                    <input
                      className="bp5-input"
                      style={{ flex: 1, fontSize: 12 }}
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
                      style={{ flex: 1, fontSize: 13 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFeatureType(ft.id);
                        setEditingFeatureId(ft.id);
                      }}
                    >
                      {ft.name || "Default"}
                    </span>
                  )}
                  <Tag minimal round>{count}</Tag>
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
              );
            })}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              <input
                className="bp5-input"
                placeholder="Add class..."
                value={newFeatureName}
                onChange={(e) => setNewFeatureName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addFeatureType();
                }}
                style={{ flex: 1, fontSize: 12 }}
              />
              <input
                type="color"
                value={newFeatureColor}
                onChange={(e) => setNewFeatureColor(e.target.value)}
                className="h-6 w-8 p-0 border-0 cursor-pointer"
              />
              <Button
                small
                icon="plus"
                onClick={addFeatureType}
                disabled={!newFeatureName.trim()}
              />
            </div>
          </div>
        </div>

        <div className="border-t pt-2 flex-1 overflow-auto min-h-[100px]">
          {/* Object count summary */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h6 style={{ margin: 0 }}>
                {annotations.length} object
                {annotations.length !== 1 ? "s" : ""}
              </h6>
              {annotations.length > 0 && (
                <Button
                  small
                  minimal
                  intent={Intent.DANGER}
                  icon="trash"
                  text="Clear all"
                  onClick={() => onAnnotationsChange([])}
                />
              )}
            </div>
            <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              Click an object on the canvas to select it. Press Delete to
              remove.
            </p>
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
          {patch ? (
            // Patch mode: clip container to patch dimensions, shift full image underneath
            <div
              style={{
                width: patchWidth,
                height: patchHeight,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <img
                src={imageUrl}
                alt="work"
                style={{
                  transform: `translate(-${patchOffsetX}px, -${patchOffsetY}px)`,
                  display: "block",
                  pointerEvents: "none",
                  userSelect: "none",
                  maxWidth: "none",
                }}
                onLoad={handleImageLoad}
              />
              {brushCanvas}
              {svgOverlay}
            </div>
          ) : (
            // Normal mode: full image
            <>
              <img
                src={imageUrl}
                alt="work"
                className="block pointer-events-none select-none max-w-none"
                onLoad={handleImageLoad}
              />
              {brushCanvas}
              {svgOverlay}
            </>
          )}
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
