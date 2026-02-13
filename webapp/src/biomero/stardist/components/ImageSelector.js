import React, { useState, useEffect } from "react";
import { fetchImages } from "../../../apiService";
import { Button, Card, Elevation, Spinner } from "@blueprintjs/core";

const ImageSelector = ({ datasetId, onSelect, selectedImageId }) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!datasetId) {
      setImages([]);
      return;
    }

    const loadImages = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch images (default page 1, maybe need pagination later)
        const imgs = await fetchImages(datasetId);
        setImages(imgs);
      } catch (err) {
        console.error("Error loading images:", err);
        setError("Failed to load images.");
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [datasetId]);

  if (!datasetId) {
    return <div className="text-gray-500 italic">Select a dataset to view images.</div>;
  }

  if (loading) {
    return <Spinner size={20} />;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (images.length === 0) {
    return <div className="text-gray-500">No images found in this dataset.</div>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded">
      {images.map((img) => (
        <Card
          key={img.id}
          interactive={true}
          elevation={selectedImageId === img.id ? Elevation.TWO : Elevation.ZERO}
          className={`p-2 cursor-pointer ${
            selectedImageId === img.id ? "bg-blue-100 border-blue-500 border" : ""
          }`}
          onClick={() => onSelect(img)}
        >
          <div className="flex flex-col items-center">
             {/* Thumbnail placeholder or actual thumbnail if available via another API */}
             <div className="w-full h-24 bg-gray-200 flex items-center justify-center mb-2 text-xs text-gray-400">
               {img.thumb_url ? <img src={img.thumb_url} alt={img.name} className="max-h-full max-w-full" /> : "No Thumb"}
             </div>
            <div className="text-xs truncate w-full text-center" title={img.name}>
              {img.name}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default ImageSelector;
