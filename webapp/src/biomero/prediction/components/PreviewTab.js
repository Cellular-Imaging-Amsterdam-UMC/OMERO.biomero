import React, { useState, useEffect } from "react";
import { H4, Card } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import ImageSelector from "./ImageSelector";
import ModelSelector from "./ModelSelector";
import ChannelSelector from "./ChannelSelector";
import PreviewViewer from "./PreviewViewer";
import { fetchImageChannels } from "../../../apiService";

const PreviewTab = () => {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedModel, setSelectedModel] = useState("2D_versatile_fluo");
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [imageMeta, setImageMeta] = useState({ sizeZ: 1, sizeT: 1 });

  // Helper to extract ID from string like "dataset-123"
  const getDatasetId = (selection) => {
      if (!selection || selection.length === 0) return null;
      const str = selection[0];
      if (str.startsWith("dataset-")) {
          return str.split("-")[1];
      }
      return null;
  };

  const datasetId = getDatasetId(selectedDatasets);

  const handleDatasetChange = (newSelection) => {
      setSelectedDatasets(newSelection);
      setSelectedImage(null);
      setChannels([]);
      setSelectedChannel(0);
      setImageMeta({ sizeZ: 1, sizeT: 1 });
  };

  const handleImageSelect = (img) => {
      setSelectedImage(img);
      setSelectedChannel(0);
  };

  // Fetch channels when image changes
  useEffect(() => {
      if (!selectedImage) {
          setChannels([]);
          setSelectedChannel(0);
          setImageMeta({ sizeZ: 1, sizeT: 1 });
          return;
      }

      const loadChannels = async () => {
          setLoadingChannels(true);
          try {
              const data = await fetchImageChannels(selectedImage.id);
              setChannels(data.channels || []);
              setImageMeta({ sizeZ: data.sizeZ || 1, sizeT: data.sizeT || 1 });
              // Default to first active channel, or channel 0
              const firstActive = (data.channels || []).find(ch => ch.active);
              setSelectedChannel(firstActive ? firstActive.index : 0);
          } catch (e) {
              console.error("Failed to load channels:", e);
              setChannels([]);
              setImageMeta({ sizeZ: 1, sizeT: 1 });
          } finally {
              setLoadingChannels(false);
          }
      };

      loadChannels();
  }, [selectedImage]);

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-1/3 flex flex-col gap-4 overflow-y-auto min-h-0 pr-1">
             <Card>
                <DatasetSelectWithPopover 
                    label="Select Dataset"
                    value={selectedDatasets}
                    onChange={handleDatasetChange}
                    multiSelect={false}
                    allowedCategories={["datasets"]}
                    buttonText={selectedDatasets.length ? `${selectedDatasets.length} selected` : "Select Dataset"}
                />
             </Card>
             
             <Card>
                 <ModelSelector 
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                 />
             </Card>

             {channels.length > 1 && (
                 <Card>
                     <ChannelSelector 
                        channels={channels}
                        selectedChannel={selectedChannel}
                        onSelect={setSelectedChannel}
                        loading={loadingChannels}
                     />
                 </Card>
             )}

             <Card className="flex-1 min-h-[200px] flex flex-col">
                 <h5 className="bp5-heading mb-2">Select Image</h5>
                 <ImageSelector 
                    datasetId={datasetId}
                    selectedImageId={selectedImage?.id}
                    onSelect={handleImageSelect}
                 />
             </Card>
        </div>

        <div className="w-2/3 flex flex-col min-w-0">
             <Card className="flex-1 flex flex-col min-h-0 min-w-0 pb-0 shadow-none border">
                 <h5 className="bp5-heading mb-2">Preview</h5>
                 <div className="flex-1 min-h-0 mt-2">
                   <PreviewViewer 
                    image={selectedImage}
                    model={selectedModel}
                    channel={selectedChannel}
                    channels={channels}
                    imageMeta={imageMeta}
                 />
                 </div>
             </Card>
        </div>
      </div>
    </div>
  );
};

export default PreviewTab;
