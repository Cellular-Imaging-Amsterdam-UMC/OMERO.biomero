import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  Button,
  Spinner,
  Callout,
  Checkbox,
  Divider,
  Tag,
  Slider,
} from "@blueprintjs/core";
import {
  runPredictionPrediction,
  saveAnnotateAnnotation,
  fetchAnnotateAnnotation,
} from "../../../apiService";
import ImageChannelControls from "./ImageChannelControls";

/**
 * Assign a stable hue to each channel index so overlays look distinct.
 * We use well-spaced hues rather than the golden angle to keep things readable.
 */
const CHANNEL_HUES = [200, 30, 130, 310, 60, 270, 0, 170];
const getChannelHue = (idx) => CHANNEL_HUES[idx % CHANNEL_HUES.length];

// Warm hues for existing ROI layers — distinct from the prediction palette
const ROI_HUES = [43, 16, 340, 160, 290, 220];
const getRoiHue = (idx) => ROI_HUES[idx % ROI_HUES.length];

const PreviewViewer = ({
  image,
  model,
  channel = 0,
  channels = [],
  imageMeta = { sizeZ: 1, sizeT: 1 },
  annotationSetId = null,
}) => {
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Track natural image dimensions for the SVG viewBox
  const [imageDims, setImageDims] = useState({ w: 0, h: 0 });

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null); // null | { ok: bool, msg: string }

  const [existingAnnotations, setExistingAnnotations] = useState([]); // parsed ROI polygons
  const [existingRoiVisibility, setExistingRoiVisibility] = useState({}); // roiId → bool
  const [annotationSetPolygons, setAnnotationSetPolygons] = useState([]);

  // Accumulated predictions keyed by channel index
  // { [channelIdx]: { polygons: [...], count: int, visible: bool } }
  const [predictions, setPredictions] = useState({});

  // Image channel visibility — which OMERO channels to render
  // { [channelIdx]: bool }
  const [channelVisibility, setChannelVisibility] = useState({});
  const [channelScales, setChannelScales] = useState({});

  const [z, setZ] = useState(0);
  const [t, setT] = useState(0);

  // Build the OMERO render_image URL with channel visibility
  // Format: ?c=1,-2,3 (1-indexed, negative = hidden)
  const imageUrl = useMemo(() => {
    if (!image) return null;

    const base = `/webgateway/render_image/${image.id}/${z}/${t}/`;

    if (channels.length === 0) return `${base}?q=1.0`;

    // Build channel string — convert 0-100% scales to pixel window values
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
  }, [image, channels, channelVisibility, channelScales, z, t]);

  // Initialize channel visibility and contrast windows when channels change
  useEffect(() => {
    if (channels.length > 0) {
      const vis = {};
      const scales = {};
      channels.forEach((ch) => {
        vis[ch.index] = ch.active !== false;
        if (ch.window) {
          // Convert OMERO window start/end to 0-100% scale
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

  // Clear all predictions and reset view when image or model changes
  useEffect(() => {
    setPredictions({});
    setError(null);
    setSaveResult(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setZ(0);
    setT(0);
    setImageDims({ w: 0, h: 0 });
  }, [image, model]);

  // Parse a GeoJSON FeatureCollection into the internal annotation format and
  // update state, preserving existing visibility choices for known ROIs.
  const applyAnnotationFeatures = useCallback((fc) => {
    const parsed = (fc.features || [])
      .map((f) => {
        const pts = f.geometry?.coordinates?.[0];
        const plane = f.geometry?.plane;
        if (!pts || pts.length < 3) return null;
        return {
          id: f.id,
          points: pts,
          z: plane?.z ?? 0,
          t: plane?.t ?? 0,
          c: plane?.c ?? -1,
          roiId: f.properties?.roiId,
        };
      })
      .filter(Boolean);
    setExistingAnnotations(parsed);
    // Initialise visibility for any new ROI IDs (default: visible)
    setExistingRoiVisibility((prev) => {
      const next = { ...prev };
      parsed.forEach((ann) => {
        const key = String(ann.roiId ?? ann.id);
        if (!(key in next)) next[key] = true;
      });
      return next;
    });
  }, []);

  // Fetch ROIs from selected annotation set
  useEffect(() => {
    setAnnotationSetPolygons([]);
    if (!image || !annotationSetId) return;
    fetchAnnotateAnnotation(image.id, annotationSetId)
      .then((result) => {
        const features = result.features || [];
        const polys = features
          .map((f) => {
            const pts = f.geometry?.coordinates?.[0];
            if (!pts || pts.length < 3) return null;
            return { id: f.id, points: pts, z: f.geometry?.plane?.z ?? 0, t: f.geometry?.plane?.t ?? 0 };
          })
          .filter(Boolean);
        setAnnotationSetPolygons(polys);
      })
      .catch(() => setAnnotationSetPolygons([]));
  }, [image, annotationSetId]);

  // --- Zoom & Pan handlers ---
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

  const handleMouseDown = (e) => {
    // Any mouse button can pan (preview is read-only, no drawing tools)
    e.preventDefault();
    setIsPanning(true);
    setLastPanPoint({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan((p) => ({
        x: p.x + (e.clientX - lastPanPoint.x),
        y: p.y + (e.clientY - lastPanPoint.y),
      }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Group existing annotations by OMERO ROI ID for per-layer display
  const roiGroups = useMemo(() => {
    const map = new Map();
    existingAnnotations.forEach((ann) => {
      const key = String(ann.roiId ?? ann.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ann);
    });
    return Array.from(map.entries()).map(([roiId, shapes]) => ({
      roiId,
      shapes,
    }));
  }, [existingAnnotations]);

  const handleRun = async () => {
    if (!image || !model) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runPredictionPrediction(
        image.id,
        model,
        channel,
        z,
        t,
      );

      if (result.error) {
        setError(result.error);
      } else {
        // Accumulate: store predictions under the current channel key, grouping by z_t
        setPredictions((prev) => {
          const next = { ...prev };
          if (!next[channel]) {
            next[channel] = { dataByPlane: {}, visible: true };
          }
          next[channel].dataByPlane[`${z}_${t}`] = {
            polygons: result.polygons || [],
            count: result.count || 0,
          };
          return next;
        });
      }
    } catch (e) {
      console.error("Preview failed", e);
      const msg = e.response?.data?.error || e.message || "Prediction failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const togglePredictionVisibility = (chIdx) => {
    setPredictions((prev) => ({
      ...prev,
      [chIdx]: {
        ...prev[chIdx],
        visible: !prev[chIdx].visible,
      },
    }));
  };

  const clearPrediction = (chIdx) => {
    setPredictions((prev) => {
      const next = { ...prev };
      delete next[chIdx];
      return next;
    });
  };

  const toggleChannelVisibility = (chIdx) => {
    setChannelVisibility((prev) => ({
      ...prev,
      [chIdx]: !prev[chIdx],
    }));
  };

  const toggleRoiVisibility = (roiId) => {
    setExistingRoiVisibility((prev) => ({ ...prev, [roiId]: !prev[roiId] }));
  };

  // Total detected objects across all channels
  const totalCount = Object.values(predictions).reduce(
    (sum, chData) =>
      sum +
      Object.values(chData.dataByPlane || {}).reduce(
        (s, p) => s + (p.count || 0),
        0,
      ),
    0,
  );
  const channelsWithPredictions = Object.keys(predictions).map(Number);

  const hasPredictionsForCurrentPlane = channelsWithPredictions.some(
    (chIdx) =>
      predictions[chIdx]?.dataByPlane?.[`${z}_${t}`]?.polygons?.length > 0,
  );

  const handleSaveAnnotations = async () => {
    if (!image) return;
    setSaving(true);
    setSaveResult(null);
    try {
      let saved = 0;
      for (const chIdx of channelsWithPredictions) {
        const planeData = predictions[chIdx]?.dataByPlane?.[`${z}_${t}`];
        if (!planeData?.polygons?.length) continue;

        const geojsonPayload = {
          type: "FeatureCollection",
          features: planeData.polygons.map((polygon) => ({
            type: "Feature",
            id: crypto.randomUUID(),
            geometry: {
              type: "Polygon",
              coordinates: [polygon.points],
              plane: { c: chIdx, z, t },
            },
            properties: { objectType: "annotation" },
          })),
        };

        await saveAnnotateAnnotation(
          image.id,
          geojsonPayload,
          null, // tableId — optional, skips tracking table update
          null, // unitIndex
          z, // zSlice
          t, // timepoint
          chIdx, // channel
          null, // patchOffset
          "prediction_preview", // configName
        );
        saved++;
      }
      setSaveResult({
        ok: true,
        msg: `Saved ${saved} channel(s) as annotations`,
      });
    } catch (e) {
      const msg = e.response?.data?.error || e.message || "Save failed";
      setSaveResult({ ok: false, msg });
    } finally {
      setSaving(false);
    }
  };

  if (!image) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 text-gray-400 border rounded">
        Select an image to view
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Top bar: Run button + summary */}
      <div className="flex items-center gap-3">
        <Button
          intent="primary"
          onClick={handleRun}
          loading={loading}
          icon="play"
          disabled={!model}
        >
          Run Preview
        </Button>

        <Button
          intent="success"
          icon="floppy-disk"
          onClick={handleSaveAnnotations}
          loading={saving}
          disabled={!hasPredictionsForCurrentPlane}
          title="Save current plane predictions as OMERO ROIs"
        >
          Save as Annotation
        </Button>

        {channels.length > 1 && (
          <span
            className="text-xs px-2 py-1 rounded flex items-center gap-1"
            style={{ background: "rgba(0,0,0,0.06)" }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: channels[channel]?.color || "#ccc" }}
            />
            {channels[channel]?.name || `Ch ${channel}`}
          </span>
        )}

        {totalCount > 0 && !loading && (
          <span className="text-sm text-gray-600">
            Total: <strong>{totalCount}</strong> object
            {totalCount !== 1 ? "s" : ""} across{" "}
            {channelsWithPredictions.length} channel
            {channelsWithPredictions.length !== 1 ? "s" : ""}
          </span>
        )}

        <span className="ml-auto" />
        <span className="text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
        <Button
          icon="zoom-to-fit"
          minimal
          small
          onClick={resetView}
          title="Reset zoom"
        />
      </div>

      {error && (
        <Callout intent="danger" icon="error" className="mb-1">
          {error}
        </Callout>
      )}

      {saveResult && (
        <Callout
          intent={saveResult.ok ? "success" : "danger"}
          icon={saveResult.ok ? "tick" : "error"}
          className="mb-1"
        >
          {saveResult.msg}
        </Callout>
      )}

      <div className="flex gap-3 items-stretch relative flex-1 min-h-0 overflow-hidden">
        {/* Z Slider (Left of image viewer) */}
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
          {/* Image viewer with zoom+pan */}
          <div
            ref={containerRef}
            className="relative overflow-hidden border rounded bg-gray-200 flex-1 min-h-0 max-h-[calc(100vh-420px)]"
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                transition: isPanning ? "none" : "transform 0.1s",
              }}
              className="inline-block relative"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Preview"
                style={{ display: "block", maxWidth: "none" }}
                onLoad={(e) =>
                  setImageDims({
                    w: e.target.naturalWidth,
                    h: e.target.naturalHeight,
                  })
                }
              />
              {imageDims.w > 0 && (
                <svg
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ width: imageDims.w, height: imageDims.h }}
                  viewBox={`0 0 ${imageDims.w} ${imageDims.h}`}
                >
                  {!annotationSetId && roiGroups.map((group, idx) => {
                    if (!existingRoiVisibility[group.roiId]) return null;
                    const hue = getRoiHue(idx);
                    return group.shapes
                      .filter((ann) => ann.z === z && ann.t === t)
                      .map((ann, si) => {
                        const pts = ann.points;
                        if (!pts || pts.length < 3) return null;
                        return (
                          <polygon
                            key={`${group.roiId}-${si}`}
                            points={pts.map((p) => p.join(",")).join(" ")}
                            fill={`hsla(${hue},90%,55%,0.08)`}
                            stroke={`hsla(${hue},90%,55%,0.9)`}
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      });
                  })}
                  {Object.entries(predictions).map(([chIdx, chData]) => {
                    if (!chData.visible) return null;
                    const planeData = chData.dataByPlane?.[`${z}_${t}`];
                    if (!planeData?.polygons) return null;
                    const hue = getChannelHue(parseInt(chIdx));
                    return planeData.polygons.map((polygon, pi) => {
                      const pts = polygon.points;
                      if (!pts || pts.length === 0) return null;
                      return (
                        <polygon
                          key={`pred-${chIdx}-${pi}`}
                          points={pts.map((p) => p.join(",")).join(" ")}
                          fill={`hsla(${hue},85%,55%,0.12)`}
                          stroke={`hsl(${hue},85%,55%)`}
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      );
                    });
                  })}
                  {/* Annotation set overlay */}
                  {annotationSetPolygons
                    .filter((poly) => (poly.z ?? 0) === z && (poly.t ?? 0) === t)
                    .map((poly, idx) => (
                    <polygon
                      key={`annset-${poly.id}`}
                      points={poly.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                      fill="none"
                      stroke={`hsl(${getRoiHue(idx)}, 80%, 60%)`}
                      strokeWidth={2}
                      opacity={0.8}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
              )}
            </div>

            {loading && (
              <div
                className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center rounded"
                style={{ zIndex: 10 }}
              >
                <div className="bg-white rounded-lg p-4 flex items-center gap-3 shadow-lg">
                  <Spinner size={24} />
                  <span className="text-sm font-medium">
                    Running StarDist on Ch {channel}...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* T Slider (Bottom of image viewer) */}
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

        {/* Controls sidebar */}
        {(channels.length > 0 ||
          channelsWithPredictions.length > 0 ||
          roiGroups.length > 0) && (
          <div className="w-52 flex flex-col gap-3 shrink-0">
            {/* Image Channels / Contrast */}
            {channels.length > 0 && (
              <ImageChannelControls
                channels={channels}
                visibility={channelVisibility}
                onToggle={toggleChannelVisibility}
                channelScales={channelScales}
                onChannelScaleChange={handleChannelScaleChange}
                onChannelAutoScale={handleChannelAutoScale}
              />
            )}

            {/* Existing ROI layers */}
            {!annotationSetId && roiGroups.length > 0 && (
              <div>
                <Divider className="mb-2" />
                <div className="text-xs font-bold uppercase text-gray-500 mb-2">
                  Existing Annotations
                </div>
                <div className="flex flex-col gap-1">
                  {roiGroups.map((group, idx) => {
                    const hue = getRoiHue(idx);
                    const onPlane = group.shapes.filter(
                      (a) => a.z === z && a.t === t,
                    ).length;
                    return (
                      <div
                        key={group.roiId}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          checked={!!existingRoiVisibility[group.roiId]}
                          onChange={() => toggleRoiVisibility(group.roiId)}
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
                              className="inline-block w-3 h-3 rounded shrink-0"
                              style={{
                                backgroundColor: `hsla(${hue}, 90%, 55%, 0.35)`,
                                border: `1.5px dashed hsla(${hue}, 90%, 45%, 0.9)`,
                              }}
                            />
                            <span
                              className="text-sm truncate max-w-[70px]"
                              title={`ROI ${group.roiId}`}
                            >
                              ROI {group.roiId}
                            </span>
                            <Tag minimal round small>
                              {onPlane}/{group.shapes.length}
                            </Tag>
                          </span>
                        </Checkbox>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prediction Overlays */}
            {channelsWithPredictions.length > 0 && (
              <div>
                <Divider className="mb-2" />
                <div className="text-xs font-bold uppercase text-gray-500 mb-2">
                  Predictions
                </div>
                <div className="flex flex-col gap-1">
                  {channelsWithPredictions.map((chIdx) => {
                    const pred = predictions[chIdx];
                    const chMeta = channels.find((c) => c.index === chIdx);
                    const hue = getChannelHue(chIdx);
                    return (
                      <div key={chIdx} className="flex items-center gap-2">
                        <Checkbox
                          checked={pred.visible}
                          onChange={() => togglePredictionVisibility(chIdx)}
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
                              className="inline-block w-3 h-3 rounded shrink-0"
                              style={{
                                backgroundColor: `hsl(${hue}, 85%, 55%)`,
                                border: `1px solid hsl(${hue}, 85%, 40%)`,
                              }}
                            />
                            <span className="text-sm">
                              {chMeta?.name || `Ch ${chIdx}`}
                            </span>
                            <Tag minimal round small>
                              {pred.count}
                            </Tag>
                          </span>
                        </Checkbox>
                        <Button
                          icon="cross"
                          minimal
                          small
                          onClick={() => clearPrediction(chIdx)}
                          title="Remove prediction"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewViewer;
