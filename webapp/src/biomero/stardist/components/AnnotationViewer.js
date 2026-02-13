import React, { useRef, useEffect, useState } from "react";
import { Button, Spinner } from "@blueprintjs/core";

const AnnotationViewer = ({ image, onSaveAnnotations }) => {
  const canvasRef = useRef(null);
  const [polygons, setPolygons] = useState([]);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [saving, setSaving] = useState(false);

  const Z = 0;
  const T = 0;
  const imageUrl = image 
    ? `/webgateway/render_image/${image.id}/${Z}/${T}/`
    : null;

  const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw completed polygons
      ctx.strokeStyle = "#00ff00"; // Green
      ctx.lineWidth = 2;
      ctx.fillStyle = "rgba(0, 255, 0, 0.2)";

      polygons.forEach((poly) => {
          if (poly.length < 2) return;
          ctx.beginPath();
          ctx.moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) {
              ctx.lineTo(poly[i][0], poly[i][1]);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
      });

      // Draw current polygon
      if (currentPolygon.length > 0) {
          ctx.strokeStyle = "#ff0000"; // Red
          ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
          ctx.beginPath();
          ctx.moveTo(currentPolygon[0][0], currentPolygon[0][1]);
          for (let i = 1; i < currentPolygon.length; i++) {
              ctx.lineTo(currentPolygon[i][0], currentPolygon[i][1]);
          }
          ctx.stroke();
          
          // Draw points
          ctx.fillStyle = "red";
          currentPolygon.forEach(p => {
              ctx.beginPath();
              ctx.arc(p[0], p[1], 3, 0, 2 * Math.PI);
              ctx.fill();
          });
      }
  }

  useEffect(() => {
    draw();
  }, [polygons, currentPolygon]);

  useEffect(() => {
    // Reset when image changes
    setPolygons([]);
    setCurrentPolygon([]);
  }, [image]);

  const handleCanvasClick = (e) => {
      if (!image) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if clicking near start point to close
      if (currentPolygon.length > 2) {
          const start = currentPolygon[0];
          const dist = Math.sqrt(Math.pow(x - start[0], 2) + Math.pow(y - start[1], 2));
          if (dist < 10) {
              // Close polygon
              setPolygons([...polygons, currentPolygon]);
              setCurrentPolygon([]);
              return;
          }
      }

      setCurrentPolygon([...currentPolygon, [x, y]]);
  }

  const handleSave = async () => {
    if (polygons.length === 0) return;
    setSaving(true);
    try {
        await onSaveAnnotations(image.id, polygons);
        // Clear after save? Or keep them? Keep them for now.
    } catch (e) {
        console.error("Failed to save annotations", e);
    } finally {
        setSaving(false);
    }
  }

  if (!image) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 text-gray-400 border rounded">
        Select an image to annotate
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative border inline-block self-start">
        <img 
            src={imageUrl} 
            alt="Annotation" 
            className="max-w-full max-h-[500px] display-block select-none"
            draggable={false}
            onLoad={(e) => {
                if (canvasRef.current) {
                    canvasRef.current.width = e.target.width;
                    canvasRef.current.height = e.target.height;
                    draw();
                }
            }}
        />
        <canvas 
            ref={canvasRef}
            className="absolute top-0 left-0 cursor-crosshair"
            onClick={handleCanvasClick}
        />
      </div>
      
      <div className="flex gap-2">
        <Button 
            intent="success" 
            onClick={handleSave} 
            loading={saving}
            icon="floppy-disk"
            disabled={polygons.length === 0}
        >
            Save Annotations
        </Button>
        <Button 
            intent="danger" 
            onClick={() => {
                setPolygons([]);
                setCurrentPolygon([]);
            }} 
            icon="trash"
        >
            Clear All
        </Button>
         <Button 
            intent="warning" 
            onClick={() => setCurrentPolygon([])} 
            icon="undo"
            disabled={currentPolygon.length === 0}
        >
            Cancel Current Shape
        </Button>
        <span className="text-gray-500 text-sm flex items-center ml-2">
            Click points to draw. Click start point (red dot) to close shape.
        </span>
      </div>
    </div>
  );
};

export default AnnotationViewer;
