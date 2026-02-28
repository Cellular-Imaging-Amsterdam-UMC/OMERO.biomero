import React, { useState, useEffect } from "react";
import { fetchImages, fetchThumbnails } from "../../../apiService";
import { Card, Elevation, Spinner } from "@blueprintjs/core";

const ImageSelector = ({ datasetId, onSelect, selectedImageId }) => {
  const [images, setImages] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!datasetId) {
      setImages([]);
      setThumbnails({});
      return;
    }

    const loadImages = async () => {
      setLoading(true);
      setError(null);
      try {
        const imgs = await fetchImages(datasetId);
        setImages(imgs);
        
        // Fetch thumbnails for the images
        if (imgs.length > 0) {
            const imageIds = imgs.map(img => img.id);
            // Fetch in batches to be safe? The API handles multiple IDs.
            // Let's just fetch all at once for now as per AppContext logic
            try {
                // We might want to batch this if there are many images
                const batchSize = 50;
                let allThumbs = {};
                for (let i = 0; i < imageIds.length; i += batchSize) {
                    const chunk = imageIds.slice(i, i + batchSize);
                    const thumbs = await fetchThumbnails(chunk);
                    Object.assign(allThumbs, thumbs);
                }
                setThumbnails(allThumbs);
            } catch (thumbErr) {
                console.error("Error loading thumbnails:", thumbErr);
                // Don't fail the whole view if thumbs fail
            }
        }
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

  if (loading && images.length === 0) {
    return <Spinner size={20} />;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  if (images.length === 0) {
    return <div className="text-gray-500">No images found in this dataset.</div>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto p-2 border rounded bg-white">
      {images.map((img) => (
        <Card
          key={img.id}
          interactive={true}
          elevation={selectedImageId === img.id ? Elevation.TWO : Elevation.ZERO}
          className={`p-2 cursor-pointer flex flex-col items-center gap-2 ${
            selectedImageId === img.id ? "bg-blue-100 border-blue-500 border" : "hover:bg-gray-50"
          }`}
          onClick={() => onSelect(img)}
        >
           {/* Thumbnail */}
           <div className="w-full h-24 bg-gray-100 flex items-center justify-center rounded overflow-hidden relative">
             {thumbnails[img.id] ? (
                 <img src={thumbnails[img.id]} alt={img.name} className="max-h-full max-w-full object-contain" />
             ) : (
                 <div className="text-xs text-gray-400">
                     {loading ? <Spinner size={16} /> : "No Thumb"}
                 </div>
             )}
           </div>
           
           <div className="text-xs truncate w-full text-center font-medium" title={img.name}>
              {img.name}
           </div>
        </Card>
      ))}
    </div>
  );
};

export default ImageSelector;
