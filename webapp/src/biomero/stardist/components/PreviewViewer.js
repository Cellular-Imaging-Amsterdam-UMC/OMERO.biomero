import React, { useRef, useEffect, useState } from "react";
import { Button, Spinner, Callout } from "@blueprintjs/core";
import { runStardistPrediction } from "../../../apiService";

const PreviewViewer = ({ image, model }) => {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [overlays, setOverlays] = useState(null);
  const [error, setError] = useState(null);
  const [resultCount, setResultCount] = useState(0);

  // Constants
  const Z = 0;
  const T = 0;
  
  const imageUrl = image 
    ? `/webgateway/render_image/${image.id}/${Z}/${T}/`
    : null;

  useEffect(() => {
    // Clear overlays when image or model changes
    setOverlays(null);
    setError(null);
    setResultCount(0);
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [image, model]);

  useEffect(() => {
    if (overlays && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Generate distinct colors for each object
      const colors = overlays.map((_, i) => {
        const hue = (i * 137.508) % 360; // Golden angle for distinct hues
        return `hsl(${hue}, 80%, 60%)`;
      });

      overlays.forEach((polygon, idx) => {
        const pts = polygon.points;
        if (!pts || pts.length === 0) return;

        ctx.strokeStyle = colors[idx];
        ctx.lineWidth = 2;
        ctx.fillStyle = colors[idx].replace("60%)", "60%, 0.15)").replace("hsl", "hsla");

        ctx.beginPath();
        // Points are already in [x, y] format from our backend
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      });
    }
  }, [overlays]);

  const handleRun = async () => {
    if (!image || !model) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runStardistPrediction(image.id, model);
      
      if (result.error) {
        setError(result.error);
        setOverlays(null);
      } else {
        setOverlays(result.polygons || []);
        setResultCount(result.count || 0);
      }
    } catch (e) {
      console.error("Preview failed", e);
      const msg = e.response?.data?.error || e.message || "Prediction failed";
      setError(msg);
    } finally {
      setLoading(false);
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 mb-2">
        <Button 
            intent="primary" 
            onClick={handleRun} 
            loading={loading}
            icon="play"
            disabled={!model}
        >
            Run Preview
        </Button>
        
        {resultCount > 0 && !loading && (
          <span className="text-sm text-gray-600">
            Detected <strong>{resultCount}</strong> object{resultCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && (
        <Callout intent="danger" icon="error" className="mb-2">
          {error}
        </Callout>
      )}

      <div className="relative border inline-block self-start">
        <img 
            src={imageUrl} 
            alt="Preview" 
            className="max-w-full max-h-[500px] display-block"
            onLoad={(e) => {
                if (canvasRef.current) {
                    canvasRef.current.width = e.target.naturalWidth;
                    canvasRef.current.height = e.target.naturalHeight;
                    // If we have overlays, redraw them at new size
                    if (overlays) {
                      // Trigger re-render of overlays
                      setOverlays([...overlays]);
                    }
                }
            }}
        />
        <canvas 
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
        
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center rounded">
            <div className="bg-white rounded-lg p-4 flex items-center gap-3 shadow-lg">
              <Spinner size={24} />
              <span className="text-sm font-medium">Running StarDist...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewViewer;
