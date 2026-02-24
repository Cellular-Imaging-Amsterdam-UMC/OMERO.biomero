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
  Popover,
  Menu,
  MenuItem,
  InputGroup,
  Checkbox,
  Spinner,
} from "@blueprintjs/core";
import ImageChannelControls from "./ImageChannelControls";
import {
  traceContours,
  subtractAnnotations,
  eraseFromAnnotations,
} from "../utils/GeometryUtils";
import { samSetImage, samPredict } from "../../../apiService";

const AnnotationViewer = ({
  image,
  annotations,
  onAnnotationsChange,
  channels = [],
  imageMeta = { sizeZ: 1, sizeT: 1 },
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
  const [mode, setMode] = useState("add"); // 'add' or 'subtract'

  // Feature Types State
  const [activeFeatureType, setActiveFeatureType] = useState(
    featureTypes[0]?.id || "1",
  );
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newFeatureColor, setNewFeatureColor] = useState("#ff0000");
  const [editingFeatureId, setEditingFeatureId] = useState(null);

  // Interaction State
  const [currentPoints, setCurrentPoints] = useState([]); // For polygon tool
  const [isDrawing, setIsDrawing] = useState(false); // For brush

  // SAM State
  const [samPoints, setSamPoints] = useState([]); // [{x, y, label}]
  const [samBox, setSamBox] = useState(null); // {x1, y1, x2, y2}
  const [samBoxStart, setSamBoxStart] = useState(null); // drag start
  const [samPreviewPolys, setSamPreviewPolys] = useState([]); // preview polygons
  const [samCacheKey, setSamCacheKey] = useState(null);
  const [samLoading, setSamLoading] = useState(false);

  // Offscreen canvas for brush
  const maskCanvas = useMemo(() => document.createElement("canvas"), []);

  // Channel Visibility
  const [channelVisibility, setChannelVisibility] = useState({});
  const [channelWindows, setChannelWindows] = useState({});

  useEffect(() => {
    if (channels.length > 0) {
      const vis = {};
      const wins = {};
      channels.forEach((ch) => {
        vis[ch.index] = ch.active !== false;
        if (ch.window) {
          wins[ch.index] = { start: ch.window.start, end: ch.window.end };
        }
      });
      setChannelVisibility(vis);
      setChannelWindows(wins);
    }
  }, [channels]);

  const handleWindowChange = (idx, { start, end }) => {
    setChannelWindows((prev) => ({ ...prev, [idx]: { start, end } }));
  };

  const toggleChannelVisibility = (idx) => {
    setChannelVisibility((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const [z, setZ] = useState(0);
  const [t, setT] = useState(0);

  useEffect(() => {
    setZ(0);
    setT(0);
  }, [image]);

  const imageUrl = useMemo(() => {
    if (!image) return null;
    const base = `/webgateway/render_image/${image.id}/${z}/${t}/`;

    if (channels.length <= 1) return `${base}?q=0.9`;

    // Build channel string with window/color parameters
    const channelParam = channels
      .map((ch) => {
        const chNum = ch.index + 1; // OMERO uses 1-indexed
        const visible = channelVisibility[ch.index] !== false;
        const prefix = visible ? "" : "-";
        const win = channelWindows[ch.index];
        if (win) {
          const color = (ch.color || "#ffffff").replace("#", "");
          return `${prefix}${chNum}|${win.start}:${win.end}$${color}`;
        }
        return `${prefix}${chNum}`;
      })
      .join(",");

    return `${base}?c=${channelParam}&q=0.9`;
  }, [image, channels, channelVisibility, channelWindows, z, t]);

  useEffect(() => {
    // Sync active feature if list changes or empty
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

  // --- Drawing Helpers ---

  const getCanvasPoint = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    return { x, y };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw existing annotations for current plane
    annotations
      .filter((ann) => (ann.z ?? 0) === z && (ann.t ?? 0) === t)
      .forEach((ann, idx) => {
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

    // 2. Draw current interaction
    if (tool === "polygon" && currentPoints.length > 0) {
      ctx.strokeStyle = mode === "subtract" ? "red" : "lime";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentPoints[0][0], currentPoints[0][1]);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i][0], currentPoints[i][1]);
      }
      ctx.stroke();

      // Draw points
      ctx.fillStyle = mode === "subtract" ? "red" : "lime";
      const ptSize = 3;
      currentPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], ptSize, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // 3. Draw SAM prompts and preview
    if (tool === "sam-point" || tool === "sam-box") {
      // Draw SAM prompt points
      samPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = p.label === 1 ? "#00ff00" : "#ff0000";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw SAM box
      if (samBox) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          samBox.x1,
          samBox.y1,
          samBox.x2 - samBox.x1,
          samBox.y2 - samBox.y1,
        );
        ctx.setLineDash([]);
      }

      // Draw SAM preview polygons
      const previewType = featureTypes.find(
        (ft) => ft.id === activeFeatureType,
      );
      const previewColor = previewType?.color || "#00ff00";
      samPreviewPolys.forEach((pts) => {
        if (!pts || pts.length < 3) return;
        ctx.setLineDash([8, 4]);
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 2;
        ctx.fillStyle = previewColor + "33";
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.setLineDash([]);
      });
    }
  };

  useEffect(() => {
    requestAnimationFrame(draw);
  }, [
    annotations,
    currentPoints,
    zoom,
    pan,
    featureTypes,
    mode,
    samPoints,
    samBox,
    samPreviewPolys,
    tool,
  ]);

  // --- Handlers ---

  const handleMouseDown = (e) => {
    if (!image) return;
    if (tool === "pan") {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    // Block adding if no features
    if (mode === "add" && (!featureTypes.length || !activeFeatureType)) {
      return;
    }

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
      const pt = getCanvasPoint(e);
      const mCtx = maskCanvas.getContext("2d");
      mCtx.beginPath();
      mCtx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      mCtx.fill();

      const ctx = canvasRef.current.getContext("2d");
      const type = featureTypes.find((t) => t.id === activeFeatureType);
      const color = mode === "subtract" ? "#ff0000" : type?.color || "yellow";
      ctx.fillStyle = color + "80";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (tool === "sam-box" && samBoxStart) {
      const pt = getCanvasPoint(e);
      setSamBox({
        x1: Math.min(samBoxStart.x, pt.x),
        y1: Math.min(samBoxStart.y, pt.y),
        x2: Math.max(samBoxStart.x, pt.x),
        y2: Math.max(samBoxStart.y, pt.y),
      });
      draw();
    }
  };

  const handleMouseUp = (e) => {
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
        maskCanvas.height,
      );
      const polys = traceContours(imageData);
      processNewPolygons(polys);
      draw();
    }

    if (tool === "sam-box" && samBoxStart && e) {
      const pt = getCanvasPoint(e);
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
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    if (mode === "subtract") {
      let currentAnns = annotations.filter(
        (a) => (a.z ?? 0) === z && (a.t ?? 0) === t,
      );
      let otherAnns = annotations.filter(
        (a) => (a.z ?? 0) !== z || (a.t ?? 0) !== t,
      );
      newPolys.forEach((erasePoly) => {
        currentAnns = eraseFromAnnotations(
          erasePoly,
          currentAnns,
          width,
          height,
        );
      });
      onAnnotationsChange([...otherAnns, ...currentAnns]);
    } else {
      const newAnns = newPolys.map((pts) => ({
        id: crypto.randomUUID(),
        points: pts,
        typeId: activeFeatureType,
        generated: true,
        z,
        t,
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
    let currentAnns = annotations.filter(
      (a) => (a.z ?? 0) === z && (a.t ?? 0) === t,
    );
    let otherAnns = annotations.filter(
      (a) => (a.z ?? 0) !== z || (a.t ?? 0) !== t,
    );
    newPolys.forEach((newPoly) => {
      const resultPolys = subtractAnnotations(
        newPoly.points,
        currentAnns,
        width,
        height,
      );
      resultPolys.forEach((pts) => {
        currentAnns.push({
          id: crypto.randomUUID(),
          points: pts,
          typeId: newPoly.typeId,
          generated: true,
          z,
          t,
        });
      });
    });
    onAnnotationsChange([...otherAnns, ...currentAnns]);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    if (tool === "polygon" && currentPoints.length > 2) {
      finishPolygon();
    } else {
      setCurrentPoints([]);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomSpeed = 0.001;
      const scaleAmount = -e.deltaY * zoomSpeed;

      setZoom((prevZoom) => {
        const newZoom = Math.min(
          Math.max(0.1, prevZoom * (1 + scaleAmount)),
          20,
        );
        if (newZoom !== prevZoom) {
          const zoomRatio = newZoom / prevZoom;
          setPan((p) => ({
            x: mouseX - (mouseX - p.x) * zoomRatio,
            y: mouseY - (mouseY - p.y) * zoomRatio,
          }));
        }
        return newZoom;
      });
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [image]);

  const deleteAnnotation = (id) => {
    onAnnotationsChange(annotations.filter((a) => a.id !== id));
  };

  // --- Feature Management ---
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
    const newTypes = featureTypes.filter((t) => t.id !== id);
    onFeatureTypesChange(newTypes);
  };

  const updateFeatureName = (id, newName) => {
    const newTypes = featureTypes.map((ft) =>
      ft.id === id ? { ...ft, name: newName } : ft,
    );
    onFeatureTypesChange(newTypes);
  };

  const handleImageLoad = (e) => {
    if (canvasRef.current) {
      canvasRef.current.width = e.target.naturalWidth;
      canvasRef.current.height = e.target.naturalHeight;
      draw();
    }
  };

  // --- SAM Helpers ---

  const getSamChannel = useCallback(() => {
    if (channels.length <= 1) return 0;
    const visible = channels.filter(
      (ch) => channelVisibility[ch.index] !== false,
    );
    return visible.length > 0 ? visible[0].index : 0;
  }, [channels, channelVisibility]);

  // Clear SAM state when image/plane changes
  useEffect(() => {
    setSamCacheKey(null);
    setSamPoints([]);
    setSamBox(null);
    setSamBoxStart(null);
    setSamPreviewPolys([]);
  }, [image, z, t]);

  const ensureSamImage = useCallback(async () => {
    if (samCacheKey) return samCacheKey;
    if (!image) return null;
    try {
      const ch = getSamChannel();
      const res = await samSetImage(image.id, z, t, ch);
      setSamCacheKey(res.cache_key);
      return res.cache_key;
    } catch (e) {
      console.error("SAM set_image failed:", e);
      return null;
    }
  }, [image, z, t, getSamChannel, samCacheKey]);

  const runSamPredict = useCallback(
    async (points, box) => {
      setSamLoading(true);
      try {
        const key = await ensureSamImage();
        if (!key) return;
        const ch = getSamChannel();
        const kwargs = {
          imageId: image.id,
          z,
          t,
          channel: ch,
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
    [ensureSamImage, image, z, t, getSamChannel],
  );

  const acceptSamPreview = useCallback(() => {
    if (samPreviewPolys.length === 0) return;
    const newAnns = samPreviewPolys.map((pts) => ({
      id: crypto.randomUUID(),
      points: pts,
      typeId: activeFeatureType,
      generated: true,
      z,
      t,
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
    z,
    t,
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

  if (!image) return <div className="p-4 text-gray-400">Select an image</div>;

  return (
    <div className="flex h-full gap-0">
      {/* Toolbar / Sidebar */}
      <div className="w-64 flex flex-col gap-4 p-2 border-r bg-gray-50 overflow-y-auto shrink-0">
        {/* Image Channels / Contrast */}
        {channels.length > 0 && (
          <div className="border-b pb-2">
            <ImageChannelControls
              channels={channels}
              visibility={channelVisibility}
              onToggle={toggleChannelVisibility}
              channelWindows={channelWindows}
              onWindowChange={handleWindowChange}
            />
          </div>
        )}

        {/* Tools */}
        <div className="flex flex-col gap-2">
          <h5>Tools</h5>
          <ButtonGroup fill>
            <Button
              icon="hand"
              active={tool === "pan"}
              onClick={() => setTool("pan")}
              title="Pan/Zoom (Ctrl+Scroll)"
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
            </ButtonGroup>
          </div>

          {mode === "add" && (
            <div className="mt-2 px-1">
              <Checkbox
                checked={collisionDetection}
                onChange={(e) => setCollisionDetection(e.target.checked)}
                label="Avoid Overlap"
                title="When enabled, new annotations will be clipped by existing ones"
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
                className={`p-1 border rounded cursor-pointer flex items-center gap-2 ${activeFeatureType === ft.id ? "ring-2 ring-blue-500 bg-blue-50" : "bg-white"}`}
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

          {/* Add New Feature */}
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
      <div className="flex-1 flex items-stretch relative min-h-0 overflow-hidden">
        {/* Z Slider */}
        <div className="flex flex-col items-center pt-1 shrink-0 pb-6 w-12">
          <span className="text-xs font-bold text-gray-500 mb-2 mr-[20px]">
            Z:
          </span>
          <span className="text-xs text-gray-400 mb-2 mr-[20px]">
            {Math.max(1, z + 1)}/{Math.max(1, imageMeta?.sizeZ || 1)}
          </span>
          <div className="flex-1 py-1">
            <Slider
              min={0}
              max={Math.max(0, (imageMeta?.sizeZ || 1) - 1)}
              stepSize={1}
              value={z}
              onChange={setZ}
              vertical
              showTrackFill={false}
              labelRenderer={false}
              disabled={!imageMeta || imageMeta.sizeZ <= 1}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
          <div
            className="flex-1 relative overflow-hidden bg-gray-200 border rounded cursor-crosshair min-h-0 max-h-[calc(100vh-420px)]"
            ref={containerRef}
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

            {/* Zoom Controls Overlay */}
            <div className="absolute bottom-4 right-4 flex gap-2">
              <Button
                icon="minus"
                onClick={() => setZoom((prev) => Math.max(0.1, prev * 0.8))}
              />
              <Button text={`${Math.round(zoom * 100)}%`} disabled />
              <Button
                icon="plus"
                onClick={() => setZoom((prev) => Math.min(10, prev * 1.2))}
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

          {/* T Slider */}
          <div className="flex items-center gap-3 shrink-0 pb-1 w-full pl-2 pr-6">
            <span className="text-xs font-bold text-gray-500 text-right">
              T:
            </span>
            <span className="text-xs text-gray-400 w-6 text-right">
              {Math.max(1, t + 1)}/{Math.max(1, imageMeta?.sizeT || 1)}
            </span>
            <div className="flex-1">
              <Slider
                min={0}
                max={Math.max(0, (imageMeta?.sizeT || 1) - 1)}
                stepSize={1}
                value={t}
                onChange={setT}
                showTrackFill={false}
                labelRenderer={false}
                disabled={!imageMeta || imageMeta.sizeT <= 1}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationViewer;
