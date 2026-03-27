import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Button, Slider, ButtonGroup, Icon, InputGroup, Checkbox, Tag } from "@blueprintjs/core";
import ImageChannelControls from "./ImageChannelControls";
import { traceContours, subtractAnnotations, eraseFromAnnotations, appendToAnnotations } from "../utils/GeometryUtils";
import { fetchImageRenderInfo } from "../../../apiService";

const clampPercent = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(100, Math.max(0, parsed));
};

const AnnotationViewer = ({ image, annotations, onAnnotationsChange, channels = [], imageMeta = { sizeZ: 1, sizeT: 1 }, featureTypes, onFeatureTypesChange, patch = null }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
    const patchViewportRef = useRef(null);
    const imageRef = useRef(null);
  
  // View State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  // Tool State
  const [tool, setTool] = useState("brush"); 
  const [brushSize, setBrushSize] = useState(20);
  const [collisionDetection, setCollisionDetection] = useState(false);
    const [mode, setMode] = useState("new");
  
  // Feature Types State
  const [activeFeatureType, setActiveFeatureType] = useState(featureTypes[0]?.id || "1");
  const [newFeatureName, setNewFeatureName] = useState("");
  const [newFeatureColor, setNewFeatureColor] = useState("#ff0000");
  const [editingFeatureId, setEditingFeatureId] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);

  // Interaction State
  const [currentPoints, setCurrentPoints] = useState([]); // For polygon tool
  const [isDrawing, setIsDrawing] = useState(false); // For brush
  
  // Offscreen canvas for brush
  const maskCanvas = useMemo(() => document.createElement("canvas"), []);
  
  // Channel Visibility
  const [channelVisibility, setChannelVisibility] = useState({});
        const [renderChannels, setRenderChannels] = useState([]);
        const [imagePixelRange, setImagePixelRange] = useState({ min: 0, max: 255 });
        const [projectionMode, setProjectionMode] = useState("normal");
    const [intensityMinPercent, setIntensityMinPercent] = useState("0");
    const [intensityMaxPercent, setIntensityMaxPercent] = useState("100");

  useEffect(() => {
    if (channels.length > 0) {
      const vis = {};
      channels.forEach(ch => {
        vis[ch.index] = ch.active !== false;
      });
      setChannelVisibility(vis);
    }
  }, [channels]);

  const toggleChannelVisibility = (idx) => {
    setChannelVisibility(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };
  
  const [z, setZ] = useState(0);
  const [t, setT] = useState(0);
    const activePatch = patch && String(patch.imageId) === String(image?.id) ? patch : null;
    const patchOffsetX = activePatch ? Number(activePatch.x || 0) : 0;
    const patchOffsetY = activePatch ? Number(activePatch.y || 0) : 0;
    const patchWidth = activePatch ? Number(activePatch.width) || 256 : null;
    const patchHeight = activePatch ? Number(activePatch.height) || 256 : null;

  useEffect(() => {
    setZ(0);
    setT(0);
  }, [image]);

    useEffect(() => {
        let cancelled = false;

        if (!image?.id) {
            setRenderChannels([]);
            setImagePixelRange({ min: 0, max: 255 });
            setProjectionMode("normal");
            return () => {
                cancelled = true;
            };
        }

        const loadRenderInfo = async () => {
            const renderInfo = await fetchImageRenderInfo(image.id);
            if (cancelled || !renderInfo) {
                return;
            }

            const pixelMin = Number(renderInfo?.pixel_range?.[0]);
            const pixelMax = Number(renderInfo?.pixel_range?.[1]);

            if (!cancelled) {
                setRenderChannels(renderInfo.channels || []);
                if (Number.isFinite(pixelMin) && Number.isFinite(pixelMax) && pixelMax > pixelMin) {
                    setImagePixelRange({ min: pixelMin, max: pixelMax });
                }
                setProjectionMode(renderInfo?.rdefs?.projection || "normal");
            }
        };

        loadRenderInfo();

        return () => {
            cancelled = true;
        };
    }, [image?.id]);
  
  const imageUrl = useMemo(() => {
    if (!image) return null;
    const base = `/webgateway/render_image/${image.id}/${z}/${t}/`;

                if (!channels.length) return base;

        const effectiveMinPercent = clampPercent(intensityMinPercent, 0);
        const effectiveMaxPercent = Math.max(effectiveMinPercent, clampPercent(intensityMaxPercent, 100));
        const pixelMin = Number.isFinite(imagePixelRange.min) ? imagePixelRange.min : 0;
        const pixelMax = Number.isFinite(imagePixelRange.max) ? imagePixelRange.max : 255;
        const pixelSpan = Math.max(1, pixelMax - pixelMin);

        const channelParam = channels.map((ch) => {
            const chNum = ch.index + 1;
            const visible = channelVisibility[ch.index] !== false;
            const channelPrefix = visible ? `${chNum}` : `-${chNum}`;
            const rawColor = String(renderChannels[ch.index]?.color || ch.color || "FF0000")
                .replace(/^#/, "")
                .replace(/^\$/, "")
                .toUpperCase();
            const color = `$${rawColor}`;
            const windowStart = Math.round(pixelMin + (pixelSpan * effectiveMinPercent) / 100);
            const windowEnd = Math.round(pixelMin + (pixelSpan * effectiveMaxPercent) / 100);

            return `${channelPrefix}|${windowStart}:${Math.max(windowStart + 1, windowEnd)}${color}`;
        }).join(",");

        const params = new URLSearchParams();
        params.set("c", channelParam);
        params.set("m", "c");
        params.set("p", projectionMode);
        params.set("q", "0.9");
        params.set("_render", `${effectiveMinPercent}-${effectiveMaxPercent}-${Object.keys(channelVisibility)
            .sort()
            .map((key) => `${key}:${channelVisibility[key] !== false ? 1 : 0}`)
            .join("-")}`);

        return `${base}?${params.toString()}`;
    }, [image, channels, channelVisibility, imagePixelRange, intensityMinPercent, intensityMaxPercent, projectionMode, renderChannels, z, t]);

    useEffect(() => {
        setImageLoaded(false);
    }, [imageUrl]);

  useEffect(() => {
      // Sync active feature if list changes or empty
      if (featureTypes.length > 0) {
          if (!activeFeatureType || !featureTypes.find(ft => ft.id === activeFeatureType)) {
              setActiveFeatureType(featureTypes[0].id);
          }
      } else {
          setActiveFeatureType(null);
      }
  }, [featureTypes, activeFeatureType]);

  // --- Drawing Helpers ---

  const toLocalPoints = useCallback((points) => {
      if (!activePatch) {
          return points;
      }
      return points.map(([x, y]) => [x - patchOffsetX, y - patchOffsetY]);
  }, [activePatch, patchOffsetX, patchOffsetY]);

  const toGlobalPoints = useCallback((points) => {
      if (!activePatch) {
          return points;
      }
      return points.map(([x, y]) => [x + patchOffsetX, y + patchOffsetY]);
  }, [activePatch, patchOffsetX, patchOffsetY]);

  const fitToViewport = useCallback(() => {
      const container = containerRef.current;
      const img = imageRef.current;
      if (!container || !img) {
          return;
      }

      const containerRect = container.getBoundingClientRect();
      const contentWidth = activePatch ? patchWidth : img.naturalWidth;
      const contentHeight = activePatch ? patchHeight : img.naturalHeight;
      if (!contentWidth || !contentHeight || !containerRect.width || !containerRect.height) {
          return;
      }

      const nextZoom = Math.min(
          containerRect.width / contentWidth,
          containerRect.height / contentHeight,
          1
      );
      const nextPanX = (containerRect.width - (contentWidth * nextZoom)) / 2;
      const nextPanY = (containerRect.height - (contentHeight * nextZoom)) / 2;

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
  }, [activePatch, patchHeight, patchWidth]);

  const syncCanvasDimensions = useCallback(() => {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      if (!canvas || !img) {
          return;
      }

      canvas.width = activePatch ? patchWidth : img.naturalWidth;
      canvas.height = activePatch ? patchHeight : img.naturalHeight;
  }, [activePatch, patchWidth, patchHeight]);

  const getCanvasPoint = (e) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      if (activePatch && patchViewportRef.current) {
          const rect = patchViewportRef.current.getBoundingClientRect();
          const scaleX = canvasRef.current.width / rect.width;
          const scaleY = canvasRef.current.height / rect.height;
          const x = (e.clientX - rect.left) * scaleX;
          const y = (e.clientY - rect.top) * scaleY;

          return { x, y };
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const canvas = canvasRef.current;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      return { x, y };
  };

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 1. Draw existing annotations for current plane
      annotations
        .filter(ann => (ann.z ?? 0) === z && (ann.t ?? 0) === t)
                .forEach((ann) => {
          if (!ann.points || ann.points.length < 2) return;
          const type = featureTypes.find(t => t.id === ann.typeId) || { color: "yellow" };
                    const points = toLocalPoints(ann.points);
          
          ctx.beginPath();
                    ctx.moveTo(points[0][0], points[0][1]);
                    for (let i = 1; i < points.length; i++) {
                            ctx.lineTo(points[i][0], points[i][1]);
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
          ctx.strokeStyle = mode === "subtract" ? "red" : mode === "append" ? "orange" : "lime";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(currentPoints[0][0], currentPoints[0][1]);
          for (let i = 1; i < currentPoints.length; i++) {
              ctx.lineTo(currentPoints[i][0], currentPoints[i][1]);
          }
          ctx.stroke();
          
          // Draw points
          ctx.fillStyle = mode === "subtract" ? "red" : mode === "append" ? "orange" : "lime";
          const ptSize = 3; 
          currentPoints.forEach(p => {
              ctx.beginPath();
              ctx.arc(p[0], p[1], ptSize, 0, 2 * Math.PI);
              ctx.fill();
          });
      }
        }, [annotations, currentPoints, featureTypes, mode, toLocalPoints, tool, z, t]);
  
  useEffect(() => {
     requestAnimationFrame(draw);
    }, [draw, zoom, pan]); 

    useEffect(() => {
            syncCanvasDimensions();
            requestAnimationFrame(draw);
    }, [activePatch, draw, syncCanvasDimensions]);

  // --- Handlers ---

  const handleMouseDown = (e) => {
      if (!image) return;
      if (tool === "pan") {
          setIsPanning(true);
          setLastPanPoint({ x: e.clientX, y: e.clientY });
          return;
      }
      
      // Block adding if no features
      if ((mode === "new" || mode === "append") && (!featureTypes.length || !activeFeatureType)) {
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
          if (maskCanvas.width !== canvasRef.current.width || maskCanvas.height !== canvasRef.current.height) {
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
          setPan(p => ({ x: p.x + dx, y: p.y + dy }));
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
          const type = featureTypes.find(t => t.id === activeFeatureType);
          const color = mode === "subtract" ? "#ff0000" : mode === "append" ? "#f59e0b" : (type?.color || "yellow");
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
          const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
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
      const currentPlaneAnnotations = annotations.filter(a => (a.z ?? 0) === z && (a.t ?? 0) === t);
      
      if (mode === "subtract") {
          let currentAnns = currentPlaneAnnotations.map((annotation) => ({
              ...annotation,
              points: toLocalPoints(annotation.points || []),
          }));
          const otherAnns = annotations.filter(a => (a.z ?? 0) !== z || (a.t ?? 0) !== t);
          newPolys.forEach(erasePoly => {
               currentAnns = eraseFromAnnotations(erasePoly, currentAnns, width, height);
          });
          const nextAnnotations = currentAnns.map((annotation) => ({
              ...annotation,
              points: toGlobalPoints(annotation.points || []),
          }));
          onAnnotationsChange([...otherAnns, ...nextAnnotations]);
      } else if (mode === "append") {
          handleAppendToExisting(newPolys);
      } else {
          const newAnns = newPolys.map(pts => ({
              id: crypto.randomUUID(),
              points: toGlobalPoints(pts),
              typeId: activeFeatureType,
              generated: true,
              z, t
          }));
          
          if (collisionDetection) {
              handleCollisionAndAdd(newAnns);
          } else {
              onAnnotationsChange([...annotations, ...newAnns]);
          }
      }
  };

  const handleAppendToExisting = (newPolys) => {
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      const currentPlaneAnnotations = annotations
          .filter(a => (a.z ?? 0) === z && (a.t ?? 0) === t)
          .map((annotation) => ({
              ...annotation,
              points: toLocalPoints(annotation.points || []),
          }));
      const otherPlaneAnnotations = annotations.filter(a => (a.z ?? 0) !== z || (a.t ?? 0) !== t);
      const differentFeatureAnnotations = currentPlaneAnnotations.filter((annotation) => annotation.typeId !== activeFeatureType);
      let sameFeatureAnnotations = currentPlaneAnnotations.filter((annotation) => annotation.typeId === activeFeatureType);

      newPolys.forEach((points) => {
          const nextAnnotations = appendToAnnotations(points, sameFeatureAnnotations, width, height);
          if (nextAnnotations) {
              sameFeatureAnnotations = nextAnnotations;
          }
      });

      const nextPlaneAnnotations = [...differentFeatureAnnotations, ...sameFeatureAnnotations].map((annotation) => ({
          ...annotation,
          points: toGlobalPoints(annotation.points || []),
      }));
      onAnnotationsChange([...otherPlaneAnnotations, ...nextPlaneAnnotations]);
  };
  
  const handleCollisionAndAdd = (newPolys) => {
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;
      let currentAnns = annotations
          .filter(a => (a.z ?? 0) === z && (a.t ?? 0) === t)
          .map((annotation) => ({
              ...annotation,
              points: toLocalPoints(annotation.points || []),
          }));
      const otherAnns = annotations.filter(a => (a.z ?? 0) !== z || (a.t ?? 0) !== t);
      newPolys.forEach(newPoly => {
           const localPoints = toLocalPoints(newPoly.points);
           const resultPolys = subtractAnnotations(localPoints, currentAnns, width, height);
           resultPolys.forEach(pts => {
               currentAnns.push({
                   id: crypto.randomUUID(),
                   points: pts,
                   typeId: newPoly.typeId,
                   generated: true,
                   z, t
               });
           });
      });
      const nextAnnotations = currentAnns.map((annotation) => ({
          ...annotation,
          points: toGlobalPoints(annotation.points || []),
      }));
      onAnnotationsChange([...otherAnns, ...nextAnnotations]);
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

          setZoom(prevZoom => {
              const newZoom = Math.min(Math.max(0.1, prevZoom * (1 + scaleAmount)), 20);
              if (newZoom !== prevZoom) {
                  const zoomRatio = newZoom / prevZoom;
                  setPan(p => ({
                      x: mouseX - (mouseX - p.x) * zoomRatio,
                      y: mouseY - (mouseY - p.y) * zoomRatio
                  }));
              }
              return newZoom;
          });
      };

      container.addEventListener("wheel", handleWheel, { passive: false });
      return () => container.removeEventListener("wheel", handleWheel);
  }, [image]);

  const deleteAnnotation = (id) => {
      onAnnotationsChange(annotations.filter(a => a.id !== id));
  };
  
  // --- Feature Management ---
  const addFeatureType = () => {
      if (!newFeatureName) return;
      const newType = {
          id: crypto.randomUUID(),
          name: newFeatureName,
          color: newFeatureColor
      };
      onFeatureTypesChange([...featureTypes, newType]);
      setNewFeatureName("");
  };
  
  const deleteFeatureType = (id) => {
      const newTypes = featureTypes.filter(t => t.id !== id);
      onFeatureTypesChange(newTypes);
  };
  
  const updateFeatureName = (id, newName) => {
      const newTypes = featureTypes.map(ft => 
          ft.id === id ? { ...ft, name: newName } : ft
      );
      onFeatureTypesChange(newTypes);
  };
  
  const handleImageLoad = (e) => {
       setImageLoaded(true);
       if (canvasRef.current) {
           syncCanvasDimensions();
           fitToViewport();
           draw();
       }
  };

  const patchViewportStyle = activePatch ? {
      width: patchWidth,
      height: patchHeight,
      overflow: "hidden",
  } : undefined;

  const patchImageOffsetStyle = activePatch ? {
      transform: `translate(${-patchOffsetX}px, ${-patchOffsetY}px)`,
  } : undefined;

  const imageStyle = activePatch
      ? {
          transform: patchImageOffsetStyle.transform,
          maxWidth: "none",
          opacity: imageLoaded ? 1 : 0,
      }
      : { opacity: imageLoaded ? 1 : 0 };

  if (!image) return <div className="p-4 text-gray-400">Select an image</div>;

  return (
        <div className="flex h-full min-h-0 gap-0 overflow-hidden">
       {/* Toolbar / Sidebar */}
             <div className="w-64 flex flex-col gap-4 p-2 border-r bg-gray-50 overflow-hidden shrink-0 min-h-0">
           {/* Image Channels */}
           {channels.length > 0 && (
               <div className="border-b pb-2">
                   <ImageChannelControls 
                        channels={channels}
                        visibility={channelVisibility}
                        onToggle={toggleChannelVisibility}
                        minPercent={intensityMinPercent}
                        maxPercent={intensityMaxPercent}
                        onMinPercentChange={setIntensityMinPercent}
                        onMaxPercentChange={setIntensityMaxPercent}
                        onAutoScale={() => {
                            setIntensityMinPercent("0");
                            setIntensityMaxPercent("99");
                        }}
                   />
               </div>
           )}

           {/* Tools */}
           <div className="flex flex-col gap-2">
               <h5>Tools</h5>
               <ButtonGroup fill>
                   <Button icon="hand" active={tool === "pan"} onClick={() => setTool("pan")} title="Pan/Zoom (Ctrl+Scroll)" />
                   <Button icon="polygon-filter" active={tool === "polygon"} onClick={() => setTool("polygon")} title="Polygon (Right Click to Finish)" disabled={(mode === "new" || mode === "append") && featureTypes.length === 0} />
                   <Button icon="draw" active={tool === "brush"} onClick={() => setTool("brush")} title="Brush" disabled={(mode === "new" || mode === "append") && featureTypes.length === 0} />
               </ButtonGroup>
               
               <div className="flex gap-2 items-center mt-2 px-1">
                   <span className="text-xs font-bold w-12">Mode:</span>
                   <ButtonGroup>
                       <Button 
                           small 
                           active={mode === "new"} 
                           onClick={() => setMode("new")} 
                           intent={mode === "new" ? "primary" : "none"}
                       >New</Button>
                       <Button 
                           small 
                           active={mode === "append"} 
                           onClick={() => setMode("append")}
                           intent={mode === "append" ? "warning" : "none"}
                       >Append</Button>
                       <Button 
                           small 
                           active={mode === "subtract"} 
                           onClick={() => setMode("subtract")}
                           intent={mode === "subtract" ? "danger" : "none"}
                       >Subtract</Button>
                   </ButtonGroup>
               </div>
               
               {mode === "new" && (
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
                           min={5} max={200} 
                           value={brushSize} 
                           onChange={setBrushSize} 
                           labelStepSize={50}
                       />
                   </div>
               )}
           </div>
           
           <div className="border-t pt-2 shrink-0">
               <h5 className="pd-2">Features</h5>
               <div className="flex flex-col gap-2 mb-2">
                   {featureTypes.map(ft => (
                       <div 
                           key={ft.id}
                           className={`p-1 border rounded cursor-pointer flex items-center gap-2 ${activeFeatureType === ft.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white'}`}
                           onClick={() => setActiveFeatureType(ft.id)}
                       >
                           <div className="w-4 h-4 rounded-full border" style={{ background: ft.color }} />
                           
                           {editingFeatureId === ft.id ? (
                               <input 
                                   className="flex-1 min-w-0 text-sm border rounded px-1"
                                   value={ft.name}
                                   autoFocus
                                   onClick={(e) => e.stopPropagation()}
                                   onChange={(e) => updateFeatureName(ft.id, e.target.value)}
                                   onBlur={() => setEditingFeatureId(null)}
                                   onKeyDown={(e) => { if (e.key === 'Enter') setEditingFeatureId(null); }}
                               />
                           ) : (
                               <span 
                                   className="text-sm flex-1 truncate"
                                   onClick={(e) => {
                                       e.stopPropagation();
                                       setActiveFeatureType(ft.id);
                                       setEditingFeatureId(ft.id);
                                   }}
                               >{ft.name}</span>
                           )}
                           
                           <Icon icon="cross" size={12} className="text-gray-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); deleteFeatureType(ft.id); }} />
                       </div>
                   ))}
               </div>
               
               {/* Add New Feature */}
               <div className="flex gap-1 flex-col mt-2 p-2 bg-white rounded border">
                   <InputGroup 
                       placeholder="Name" 
                       value={newFeatureName} 
                       onChange={e => setNewFeatureName(e.target.value)} 
                       small 
                   />
                   <div className="flex gap-1">
                       <input 
                           type="color" 
                           value={newFeatureColor} 
                           onChange={e => setNewFeatureColor(e.target.value)}
                           className="h-6 w-8 p-0 border-0 cursor-pointer"
                       />
                       <Button icon="add" small onClick={addFeatureType} disabled={!newFeatureName} fill>Add</Button>
                   </div>
               </div>
           </div>
           
           <div className="border-t pt-2 flex-1 min-h-0 flex flex-col overflow-hidden">
               <div className="flex items-center justify-between gap-2">
                   <h5>Annotations ({annotations.length})</h5>
                   {activePatch && <Tag minimal>{`Patch ${activePatch.width}x${activePatch.height}`}</Tag>}
               </div>
               <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto pr-1">
                   {annotations.map((ann, i) => {
                       const ft = featureTypes.find(t => t.id === ann.typeId);
                       return (
                           <div key={ann.id} className="flex justify-between items-center text-xs p-1 bg-white border hover:bg-gray-100">
                               <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full" style={{ background: ft?.color || 'gray' }} />
                                   <span>{ft?.name || 'Unknown'} #{i+1}</span>
                               </div>
                               <Button icon="trash" minimal small onClick={() => deleteAnnotation(ann.id)} />
                           </div>
                   )})}
               </div>
           </div>
       </div>

       {/* Canvas Area */}
       <div className="flex-1 flex items-stretch relative min-h-0 overflow-hidden">
         {/* Z Slider */}
         <div className="flex flex-col items-center pt-1 shrink-0 pb-6 w-12">
           <span className="text-xs font-bold text-gray-500 mb-2 mr-[20px]">Z:</span>
           <span className="text-xs text-gray-400 mb-2 mr-[20px]">{Math.max(1, z + 1)}/{Math.max(1, imageMeta?.sizeZ || 1)}</span>
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
           <div className="flex-1 relative overflow-hidden bg-gray-200 border rounded cursor-crosshair min-h-0 max-h-[calc(100vh-420px)]" ref={containerRef}>
               <div 
                   style={{ 
                       transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
                       transformOrigin: "0 0",
                       transition: isPanning ? "none" : "transform 0.1s"
                   }}
                   className="absolute left-0 top-0 origin-top-left"
               >
                   <div ref={patchViewportRef} className="relative inline-block" style={patchViewportStyle}>
                       <img 
                           key={imageUrl}
                           ref={imageRef}
                           src={imageUrl} 
                           alt="work" 
                           className="block pointer-events-none select-none max-w-none" 
                           style={imageStyle}
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
               </div>
               
               {/* Zoom Controls Overlay */}
               <div className="absolute bottom-4 right-4 flex gap-2">
                   <Button icon="minus" onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))} />
                   <Button text={`${Math.round(zoom * 100)}%`} disabled />
                   <Button icon="plus" onClick={() => setZoom(prev => Math.min(10, prev * 1.2))} />
                   <Button icon="reset" onClick={fitToViewport} />
               </div>
           </div>

           {/* T Slider */}
           <div className="flex items-center gap-3 shrink-0 pb-1 w-full pl-2 pr-6">
             <span className="text-xs font-bold text-gray-500 text-right">T:</span>
             <span className="text-xs text-gray-400 w-6 text-right">{Math.max(1, t + 1)}/{Math.max(1, imageMeta?.sizeT || 1)}</span>
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
