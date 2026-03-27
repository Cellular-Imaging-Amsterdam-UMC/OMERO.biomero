import React, { useState, useEffect } from "react";
import { H4, Card, Button, Spinner, HTMLSelect, InputGroup } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import ImageSelector from "./ImageSelector";
import AnnotationViewer from "./AnnotationViewer";
import { useAppContext } from "../../../AppContext";
import {
    fetchAnnotationSets,
    fetchMapAnnotations,
    saveMapAnnotation,
    fetchImageChannels,
} from "../../../apiService";

const DEFAULT_FEATURE_TYPES = [
    { id: "1", name: "Cell", color: "#00ff00" },
    { id: "2", name: "Nucleus", color: "#0000ff" },
];

const getDefaultFeatureTypes = () => DEFAULT_FEATURE_TYPES.map((featureType) => ({ ...featureType }));

const AnnotationTab = () => {
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
    const [annotationSets, setAnnotationSets] = useState([]);
    const [selectedAnnotationSetId, setSelectedAnnotationSetId] = useState("");
    const [annotationSetName, setAnnotationSetName] = useState("");
    const [annotationSetDescription, setAnnotationSetDescription] = useState("");
    const [datasetAnnotations, setDatasetAnnotations] = useState([]);
    const [featureTypes, setFeatureTypes] = useState(getDefaultFeatureTypes());
  const [loadingAnns, setLoadingAnns] = useState(false);
    const [loadingAnnotationSets, setLoadingAnnotationSets] = useState(false);
  const [channels, setChannels] = useState([]);
  const [imageMeta, setImageMeta] = useState({ sizeZ: 1, sizeT: 1 });
  const [saving, setSaving] = useState(false);

  const { toaster } = useAppContext();

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
  };

    const resetAnnotationEditor = () => {
        setSelectedAnnotationSetId("");
        setAnnotationSetName("");
        setAnnotationSetDescription("");
        setDatasetAnnotations([]);
        setFeatureTypes(getDefaultFeatureTypes());
    };

    useEffect(() => {
        if (selectedImage) {
            loadChannels(selectedImage.id);
        } else {
            setChannels([]);
            setImageMeta({ sizeZ: 1, sizeT: 1 });
        }
    }, [selectedImage]);

    useEffect(() => {
        if (!datasetId) {
            setAnnotationSets([]);
            resetAnnotationEditor();
            return;
        }

        let cancelled = false;

        const fetchSets = async () => {
            setLoadingAnnotationSets(true);
            try {
                const data = await fetchAnnotationSets(datasetId);
                if (cancelled) {
                    return;
                }

                const sets = data.annotationSets || [];
                setAnnotationSets(sets);
                const nextSelection = sets[0] ? String(sets[0].id) : "";
                setSelectedAnnotationSetId(nextSelection);
                if (!nextSelection) {
                    setAnnotationSetName("");
                    setAnnotationSetDescription("");
                    setDatasetAnnotations([]);
                    setFeatureTypes(getDefaultFeatureTypes());
                }
            } catch (e) {
                if (!cancelled) {
                    console.error("Error loading annotation sets", e);
                    toaster.show({ message: "Failed to load annotation sets", intent: "danger" });
                }
            } finally {
                if (!cancelled) {
                    setLoadingAnnotationSets(false);
                }
            }
        };

        fetchSets();

        return () => {
            cancelled = true;
        };
    }, [datasetId, toaster]);

    useEffect(() => {
        if (!datasetId) {
            return;
        }

        if (!selectedAnnotationSetId) {
            setAnnotationSetName("");
            setAnnotationSetDescription("");
            setDatasetAnnotations([]);
            setFeatureTypes(getDefaultFeatureTypes());
            return;
        }

        let cancelled = false;

        const fetchAnnotationSet = async () => {
            setLoadingAnns(true);
            try {
                const data = await fetchMapAnnotations(datasetId, selectedAnnotationSetId);
                if (cancelled) {
                    return;
                }

                setAnnotationSetName(data.name || "");
                setAnnotationSetDescription(data.description || "");
                setDatasetAnnotations(data.annotations || []);
                setFeatureTypes(data.featureTypes?.length ? data.featureTypes : getDefaultFeatureTypes());
            } catch (e) {
                if (!cancelled) {
                    console.error("Error loading annotations", e);
                    toaster.show({ message: "Failed to load annotation set", intent: "danger" });
                }
            } finally {
                if (!cancelled) {
                    setLoadingAnns(false);
                }
            }
        };

        fetchAnnotationSet();

        return () => {
            cancelled = true;
        };
    }, [datasetId, selectedAnnotationSetId, toaster]);

  const loadChannels = async (imageId) => {
        try {
            const data = await fetchImageChannels(imageId);
            setChannels(data.channels || []);
            setImageMeta({ sizeZ: data.sizeZ || 1, sizeT: data.sizeT || 1 });
        } catch (e) {
            console.error("Error loading channels", e);
            setImageMeta({ sizeZ: 1, sizeT: 1 });
        }
  };

    const loadAnnotationSets = async (nextDatasetId, preferredAnnotationSetId = null) => {
        setLoadingAnnotationSets(true);
        try {
            const data = await fetchAnnotationSets(nextDatasetId);
            const sets = data.annotationSets || [];
            setAnnotationSets(sets);

            const preferredExists = preferredAnnotationSetId && sets.some(
                (annotationSet) => String(annotationSet.id) === String(preferredAnnotationSetId)
            );
            const nextSelection = preferredExists
                ? String(preferredAnnotationSetId)
                : (sets[0] ? String(sets[0].id) : "");

            setSelectedAnnotationSetId(nextSelection);
            if (!nextSelection) {
                setAnnotationSetName("");
                setAnnotationSetDescription("");
                setDatasetAnnotations([]);
                setFeatureTypes(getDefaultFeatureTypes());
            }
        } catch (e) {
            console.error("Error loading annotation sets", e);
            toaster.show({ message: "Failed to load annotation sets", intent: "danger" });
        } finally {
            setLoadingAnnotationSets(false);
        }
  };

    const currentImageAnnotations = selectedImage
        ? datasetAnnotations.filter((annotation) => String(annotation.imageId) === String(selectedImage.id))
        : [];
    const annotatedImageCount = new Set(
        datasetAnnotations
            .map((annotation) => annotation.imageId)
            .filter((imageId) => imageId !== undefined && imageId !== null)
            .map(String)
    ).size;
    const selectedAnnotationSummary = annotationSets.find(
        (annotationSet) => String(annotationSet.id) === String(selectedAnnotationSetId)
    );

    const handleImageAnnotationsChange = (nextAnnotations) => {
        if (!selectedImage) {
            return;
        }

        const selectedImageId = String(selectedImage.id);
        const otherAnnotations = datasetAnnotations.filter(
            (annotation) => String(annotation.imageId) !== selectedImageId
        );
        const normalizedAnnotations = nextAnnotations.map((annotation) => ({
            ...annotation,
            imageId: selectedImageId,
        }));

        setDatasetAnnotations([...otherAnnotations, ...normalizedAnnotations]);
    };

  const handleSave = async () => {
        if (!datasetId) {
            return;
        }

        setSaving(true);
        try {
            const payload = {
                version: "2.0",
                name: annotationSetName,
                description: annotationSetDescription,
                datasetId: String(datasetId),
                annotations: datasetAnnotations.map((annotation) => ({
                    ...annotation,
                    imageId: annotation.imageId != null ? String(annotation.imageId) : annotation.imageId,
                })),
                featureTypes,
            };

            const response = await saveMapAnnotation(datasetId, payload, selectedAnnotationSetId || null);
            await loadAnnotationSets(datasetId, response.annotationSetId);

            toaster.show({
                message: selectedAnnotationSetId ? "Annotation set updated" : "Annotation set saved",
                intent: "success",
            });
        } catch (e) {
            console.error("Save failed", e);
            toaster.show({ message: "Failed to save annotation set", intent: "danger" });
        } finally {
            setSaving(false);
        }
  };

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex justify-between items-center shrink-0">
                <H4 className="m-0">Annotate Training Data</H4>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
                <div className="w-[24rem] flex flex-col gap-4 overflow-y-auto min-h-0 pr-1 shrink-0">
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
                        <h5 className="bp5-heading mb-3">Annotation Sets</h5>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-2 items-center">
                                <HTMLSelect
                                    fill
                                    value={selectedAnnotationSetId}
                                    onChange={(event) => setSelectedAnnotationSetId(event.target.value)}
                                    disabled={!datasetId || loadingAnnotationSets}
                                >
                                    <option value="">New annotation set</option>
                                    {annotationSets.map((annotationSet) => (
                                        <option key={annotationSet.id} value={annotationSet.id}>
                                            {annotationSet.name || `Annotation set ${annotationSet.id}`}
                                        </option>
                                    ))}
                                </HTMLSelect>
                                {loadingAnnotationSets && <Spinner size={18} />}
                            </div>

                            <InputGroup
                                placeholder="Annotation set name"
                                value={annotationSetName}
                                onChange={(event) => setAnnotationSetName(event.target.value)}
                                disabled={!datasetId || loadingAnns}
                            />

                            <textarea
                                className="bp5-input min-h-[88px] resize-y"
                                placeholder="Description"
                                value={annotationSetDescription}
                                onChange={(event) => setAnnotationSetDescription(event.target.value)}
                                disabled={!datasetId || loadingAnns}
                            />

                            <div className="text-xs text-gray-500">
                                {selectedAnnotationSummary
                                    ? `${selectedAnnotationSummary.annotationCount} annotations across ${selectedAnnotationSummary.imageCount} images in the saved set.`
                                    : `${datasetAnnotations.length} annotations across ${annotatedImageCount} images in the current draft.`}
                            </div>

                            <Button
                                intent="primary"
                                icon="floppy-disk"
                                onClick={handleSave}
                                loading={saving}
                                disabled={!datasetId || loadingAnns || loadingAnnotationSets}
                            >
                                Save to OMERO
                            </Button>
                        </div>
                    </Card>

                    <Card className="flex-1 min-h-[300px] flex flex-col">
                        <h5 className="bp5-heading mb-2">Select Images</h5>
                        <ImageSelector
                            datasetId={datasetId}
                            selectedImageId={selectedImage?.id}
                            onSelect={setSelectedImage}
                        />
                    </Card>
        </div>

        <div className="w-3/4 flex flex-col min-w-0">
                    <Card className="flex-1 flex flex-col p-0 overflow-hidden min-h-0 shadow-none border">
                        {loadingAnns ? (
                            <div className="flex justify-center items-center h-full">
                                <Spinner />
                            </div>
                        ) : (
                            <AnnotationViewer
                                image={selectedImage}
                                annotations={currentImageAnnotations}
                                onAnnotationsChange={handleImageAnnotationsChange}
                                channels={channels}
                                imageMeta={imageMeta}
                                featureTypes={featureTypes}
                                onFeatureTypesChange={setFeatureTypes}
                            />
                        )}
                    </Card>
        </div>
      </div>
    </div>
  );
};

export default AnnotationTab;
