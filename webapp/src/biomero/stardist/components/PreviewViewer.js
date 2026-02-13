import React, { useRef, useEffect, useState } from "react";
import { Button, Spinner } from "@blueprintjs/core";

const PreviewViewer = ({ image, model, onRunPreview }) => {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [overlays, setOverlays] = useState(null);

  // Constants (could be passed as props or fetched)
  const Z = 0;
  const T = 0;
  
  const imageUrl = image 
    ? `/webgateway/render_image/${image.id}/${Z}/${T}/`
    : null;

  useEffect(() => {
    // Clear overlays when image changes
    setOverlays(null);
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [image]);

  useEffect(() => {
    if (overlays && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Draw overlays (simple polygons)
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 2;
      
      overlays.forEach(polygon => {
        ctx.beginPath();
        if (polygon.length > 0) {
            ctx.moveTo(polygon[0][1], polygon[0][0]); // y, x -> x, y ? Check stardist output format
            for (let i = 1; i < polygon.length; i++) {
                ctx.lineTo(polygon[i][1], polygon[i][0]);
            }
            ctx.closePath();
            ctx.stroke();
        }
      });
    }
  }, [overlays]);

  const handleRun = async () => {
    if (!image || !model) return;
    setLoading(true);
    try {
      // Mock result for now, or call onRunPreview if it handles the API call
      // const result = await onRunPreview(image.id, model);
      
      // Simulating API delay and result
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock Stardist-like output (list of polygons in [y, x] format)
      // Just a simple square in the middle
      const mockResult = [
          [[50, 50], [50, 150], [150, 150], [150, 50]]
      ];
      setOverlays(mockResult);
      
    } catch (e) {
      console.error("Preview failed", e);
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
      <div className="relative border inline-block self-start">
        <img 
            src={imageUrl} 
            alt="Preview" 
            className="max-w-full max-h-[500px] display-block"
            // Ensure canvas matches image size. 
            // Real implementation needs to handle loading state to get natural dimensions
            onLoad={(e) => {
                if (canvasRef.current) {
                    canvasRef.current.width = e.target.width;
                    canvasRef.current.height = e.target.height;
                }
            }}
        />
        <canvas 
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
        />
      </div>
      
      <div>
        <Button 
            intent="primary" 
            onClick={handleRun} 
            loading={loading}
            icon="play"
        >
            Run Preview
        </Button>
      </div>
    </div>
  );
};

export default PreviewViewer;
