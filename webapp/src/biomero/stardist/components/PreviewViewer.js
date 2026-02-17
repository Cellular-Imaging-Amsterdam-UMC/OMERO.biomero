import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Button, Spinner, Callout, Checkbox, Divider, Tag } from "@blueprintjs/core";
import { runStardistPrediction } from "../../../apiService";

/**
 * Assign a stable hue to each channel index so overlays look distinct.
 * We use well-spaced hues rather than the golden angle to keep things readable.
 */
const CHANNEL_HUES = [200, 30, 130, 310, 60, 270, 0, 170];
const getChannelHue = (idx) => CHANNEL_HUES[idx % CHANNEL_HUES.length];

const PreviewViewer = ({ image, model, channel = 0, channels = [] }) => {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Accumulated predictions keyed by channel index
  // { [channelIdx]: { polygons: [...], count: int, visible: bool } }
  const [predictions, setPredictions] = useState({});

  // Image channel visibility — which OMERO channels to render
  // { [channelIdx]: bool }
  const [channelVisibility, setChannelVisibility] = useState({});

  // Constants
  const Z = 0;
  const T = 0;

  // Build the OMERO render_image URL with channel visibility
  // Format: ?c=1,-2,3 (1-indexed, negative = hidden)
  const imageUrl = useMemo(() => {
    if (!image) return null;

    const base = `/webgateway/render_image/${image.id}/${Z}/${T}/`;

    if (channels.length <= 1) return base;

    // Build channel string
    const channelParam = channels.map(ch => {
      const chNum = ch.index + 1; // OMERO uses 1-indexed
      const visible = channelVisibility[ch.index] !== false; // default true
      return visible ? `${chNum}` : `-${chNum}`;
    }).join(",");

    return `${base}?c=${channelParam}`;
  }, [image, channels, channelVisibility]);

  // Initialize channel visibility when channels change
  useEffect(() => {
    if (channels.length > 0) {
      const vis = {};
      channels.forEach(ch => {
        vis[ch.index] = ch.active !== false; // default to OMERO's active state
      });
      setChannelVisibility(vis);
    }
  }, [channels]);

  // Clear all predictions and reset view when image or model changes
  useEffect(() => {
    setPredictions({});
    setError(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [image, model]);

  // --- Zoom & Pan handlers ---
  const handleWheel = useCallback((e) => {
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
      setPan(p => ({
        x: mouseX - (mouseX - p.x) * zoomRatio,
        y: mouseY - (mouseY - p.y) * zoomRatio,
      }));
      setZoom(newZoom);
    }
  }, [zoom]);

  const handleMouseDown = (e) => {
    // Any mouse button can pan (preview is read-only, no drawing tools)
    e.preventDefault();
    setIsPanning(true);
    setLastPanPoint({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan(p => ({
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

  // Redraw canvas whenever predictions change
  const drawOverlays = useCallback(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    Object.entries(predictions).forEach(([chIdx, data]) => {
      if (!data.visible || !data.polygons) return;

      const hue = getChannelHue(parseInt(chIdx));

      data.polygons.forEach((polygon, pIdx) => {
        const pts = polygon.points;
        if (!pts || pts.length === 0) return;

        const strokeColor = `hsl(${hue}, 85%, 55%)`;
        const fillColor = `hsla(${hue}, 85%, 55%, 0.12)`;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.fillStyle = fillColor;

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      });
    });
  }, [predictions]);

  useEffect(() => {
    drawOverlays();
  }, [drawOverlays]);

  const handleRun = async () => {
    if (!image || !model) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runStardistPrediction(image.id, model, channel);

      if (result.error) {
        setError(result.error);
      } else {
        // Accumulate: store predictions under the current channel key
        setPredictions(prev => ({
          ...prev,
          [channel]: {
            polygons: result.polygons || [],
            count: result.count || 0,
            visible: true,
          }
        }));
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
    setPredictions(prev => ({
      ...prev,
      [chIdx]: {
        ...prev[chIdx],
        visible: !prev[chIdx].visible,
      }
    }));
  };

  const clearPrediction = (chIdx) => {
    setPredictions(prev => {
      const next = { ...prev };
      delete next[chIdx];
      return next;
    });
  };

  const toggleChannelVisibility = (chIdx) => {
    setChannelVisibility(prev => ({
      ...prev,
      [chIdx]: !prev[chIdx],
    }));
  };

  // Total detected objects across all channels
  const totalCount = Object.values(predictions).reduce(
    (sum, d) => sum + (d.count || 0), 0
  );
  const channelsWithPredictions = Object.keys(predictions).map(Number);

  if (!image) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 text-gray-400 border rounded">
        Select an image to view
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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

        {channels.length > 1 && (
          <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{background: 'rgba(0,0,0,0.06)'}}>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: channels[channel]?.color || '#ccc' }}
            />
            {channels[channel]?.name || `Ch ${channel}`}
          </span>
        )}

        {totalCount > 0 && !loading && (
          <span className="text-sm text-gray-600">
            Total: <strong>{totalCount}</strong> object{totalCount !== 1 ? "s" : ""} across {channelsWithPredictions.length} channel{channelsWithPredictions.length !== 1 ? "s" : ""}
          </span>
        )}

        <span className="ml-auto" />
        <span className="text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
        <Button icon="zoom-to-fit" minimal small onClick={resetView} title="Reset zoom" />
      </div>

      {error && (
        <Callout intent="danger" icon="error" className="mb-1">
          {error}
        </Callout>
      )}

      <div className="flex gap-3 items-start">
        {/* Image viewer with zoom+pan */}
        <div
          ref={containerRef}
          className="relative overflow-hidden border rounded bg-gray-200"
          style={{ flex: '1 1 0', minHeight: '400px', maxHeight: '600px', cursor: isPanning ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isPanning ? 'none' : 'transform 0.1s',
            }}
            className="inline-block relative"
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Preview"
              style={{ display: 'block', maxWidth: 'none' }}
              onLoad={(e) => {
                if (canvasRef.current) {
                  canvasRef.current.width = e.target.naturalWidth;
                  canvasRef.current.height = e.target.naturalHeight;
                  canvasRef.current.style.width = e.target.naturalWidth + 'px';
                  canvasRef.current.style.height = e.target.naturalHeight + 'px';
                  drawOverlays();
                }
              }}
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 pointer-events-none"
            />
          </div>

          {loading && (
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center rounded" style={{ zIndex: 10 }}>
              <div className="bg-white rounded-lg p-4 flex items-center gap-3 shadow-lg">
                <Spinner size={24} />
                <span className="text-sm font-medium">Running StarDist on Ch {channel}...</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls sidebar */}
        {(channels.length > 1 || channelsWithPredictions.length > 0) && (
          <div className="w-52 flex flex-col gap-3 shrink-0">
            {/* Image Channel Visibility */}
            {channels.length > 1 && (
              <div>
                <div className="text-xs font-bold uppercase text-gray-500 mb-2">
                  Image Channels
                </div>
                <div className="flex flex-col gap-1">
                  {channels.map(ch => (
                    <Checkbox
                      key={ch.index}
                      checked={channelVisibility[ch.index] !== false}
                      onChange={() => toggleChannelVisibility(ch.index)}
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
                  {channelsWithPredictions.map(chIdx => {
                    const pred = predictions[chIdx];
                    const chMeta = channels.find(c => c.index === chIdx);
                    const hue = getChannelHue(chIdx);
                    return (
                      <div key={chIdx} className="flex items-center gap-2">
                        <Checkbox
                          checked={pred.visible}
                          onChange={() => togglePredictionVisibility(chIdx)}
                          className="mb-0 flex items-center"
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
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
