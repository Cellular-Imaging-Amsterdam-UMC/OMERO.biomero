import React, { useMemo, useState, useEffect, useCallback } from "react";
import { H4, Card, Button, Spinner, HTMLSelect, InputGroup, ButtonGroup } from "@blueprintjs/core";
import DatasetSelectWithPopover from "../../components/DatasetSelectWithPopover";
import ImageSelector from "./ImageSelector";
import PatchSelector from "./PatchSelector";
import AnnotationViewer from "./AnnotationViewer";
import { useAppContext } from "../../../AppContext";
import {
    fetchImages,
    fetchThumbnails,
    fetchAnnotationSets,
    fetchMapAnnotations,
    saveMapAnnotation,
    fetchImageChannels,
} from "../../../apiService";

const DEFAULT_FEATURE_TYPES = [
    { id: "1", name: "Cell", color: "#00ff00" },
    { id: "2", name: "Nucleus", color: "#0000ff" },
];
const DEFAULT_PATCH_SIZE = 256;
const VIEW_MODE_IMAGES = "images";
const VIEW_MODE_PATCHES = "patches";

const getDefaultFeatureTypes = () => DEFAULT_FEATURE_TYPES.map((featureType) => ({ ...featureType }));
const toNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
};

const getImageDimensions = (image) => ({
        width: toNumber(image?.sizeX),
        height: toNumber(image?.sizeY),
});

const sanitizeDatasetSelection = (selection = []) => {
    if (!Array.isArray(selection) || selection.length === 0) {
        return [];
    }
    return [selection[0]];
};

const AnnotationTab = ({ preferredSelectedDatasets = [] }) => {
        const [selectedDatasets, setSelectedDatasets] = useState([]);
        const [selectedImage, setSelectedImage] = useState(null);
        const [datasetImages, setDatasetImages] = useState([]);
        const [datasetThumbnails, setDatasetThumbnails] = useState({});
        const [loadingImages, setLoadingImages] = useState(false);
    const [annotationSets, setAnnotationSets] = useState([]);
    const [selectedAnnotationSetId, setSelectedAnnotationSetId] = useState("");
    const [annotationSetName, setAnnotationSetName] = useState("");
    const [annotationSetDescription, setAnnotationSetDescription] = useState("");
        const [patches, setPatches] = useState([]);
        const [selectedPatchId, setSelectedPatchId] = useState("");
        const [patchWidth, setPatchWidth] = useState(DEFAULT_PATCH_SIZE);
        const [patchHeight, setPatchHeight] = useState(DEFAULT_PATCH_SIZE);
        const [viewMode, setViewMode] = useState(VIEW_MODE_IMAGES);
    const [datasetAnnotations, setDatasetAnnotations] = useState([]);
    const [featureTypes, setFeatureTypes] = useState(getDefaultFeatureTypes());
        const [loadingAnns, setLoadingAnns] = useState(false);
    const [loadingAnnotationSets, setLoadingAnnotationSets] = useState(false);
        const [channels, setChannels] = useState([]);
        const [imageMeta, setImageMeta] = useState({ sizeZ: 1, sizeT: 1, sizeX: null, sizeY: null });
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
    const imagesById = useMemo(
        () => Object.fromEntries(datasetImages.map((image) => [String(image.id), image])),
        [datasetImages]
    );
    const selectedPatch = useMemo(
        () => patches.find((patch) => String(patch.id) === String(selectedPatchId)) || null,
        [patches, selectedPatchId]
    );
    const viewerPatch = useMemo(() => {
        if (viewMode !== VIEW_MODE_PATCHES || !selectedPatch || !selectedImage) {
            return null;
        }
        return String(selectedPatch.imageId) === String(selectedImage.id) ? selectedPatch : null;
    }, [viewMode, selectedPatch, selectedImage]);
    const patchAnnotationCounts = useMemo(() => {
        const counts = {};
        datasetAnnotations.forEach((annotation) => {
            if (!annotation.patchId) {
                return;
            }
            const key = String(annotation.patchId);
            counts[key] = (counts[key] || 0) + 1;
        });
        return counts;
    }, [datasetAnnotations]);

    const handleDatasetChange = (newSelection) => {
        setSelectedDatasets(sanitizeDatasetSelection(newSelection));
        setSelectedImage(null);
        setSelectedPatchId("");
    };

    const resetAnnotationEditor = () => {
        setSelectedAnnotationSetId("");
        setAnnotationSetName("");
        setAnnotationSetDescription("");
        setPatches([]);
        setSelectedPatchId("");
        setDatasetAnnotations([]);
        setFeatureTypes(getDefaultFeatureTypes());
        setSelectedImage(null);
        setChannels([]);
        setImageMeta({ sizeZ: 1, sizeT: 1, sizeX: null, sizeY: null });
        setViewMode(VIEW_MODE_IMAGES);
    };

    useEffect(() => {
        if (selectedDatasets.length === 0 && preferredSelectedDatasets.length > 0) {
            setSelectedDatasets(sanitizeDatasetSelection(preferredSelectedDatasets));
        }
    }, [preferredSelectedDatasets, selectedDatasets.length]);

    const loadAnnotationSets = useCallback(async (nextDatasetId, preferredAnnotationSetId = null) => {
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
                setPatches([]);
                setSelectedPatchId("");
                setDatasetAnnotations([]);
                setFeatureTypes(getDefaultFeatureTypes());
            }
        } catch (e) {
            console.error("Error loading annotation sets", e);
            toaster.show({ message: "Failed to load annotation sets", intent: "danger" });
        } finally {
            setLoadingAnnotationSets(false);
        }
    }, [toaster]);

    useEffect(() => {
        if (selectedImage) {
            loadChannels(selectedImage.id);
        } else {
            setChannels([]);
            setImageMeta({ sizeZ: 1, sizeT: 1, sizeX: null, sizeY: null });
        }
    }, [selectedImage]);

    useEffect(() => {
        if (!datasetId) {
            setDatasetImages([]);
            setDatasetThumbnails({});
            setSelectedImage(null);
            return;
        }

        let cancelled = false;

        const loadDatasetImages = async () => {
            setLoadingImages(true);
            try {
                const loadedImages = [];
                const seenImageIds = new Set();

                for (let page = 1; page <= 50; page += 1) {
                    const pageImages = await fetchImages(datasetId, page, true);
                    if (!pageImages.length) {
                        break;
                    }

                    const freshImages = pageImages.filter((image) => !seenImageIds.has(String(image.id)));
                    if (!freshImages.length) {
                        break;
                    }

                    freshImages.forEach((image) => {
                        seenImageIds.add(String(image.id));
                        loadedImages.push(image);
                    });
                }

                if (cancelled) {
                    return;
                }

                setDatasetImages(loadedImages);

                const nextThumbs = {};
                const batchSize = 50;
                for (let index = 0; index < loadedImages.length; index += batchSize) {
                    const chunk = loadedImages.slice(index, index + batchSize).map((image) => image.id);
                    const thumbs = await fetchThumbnails(chunk);
                    Object.assign(nextThumbs, thumbs);
                }

                if (!cancelled) {
                    setDatasetThumbnails(nextThumbs);
                    if (!loadedImages.length) {
                        setSelectedImage(null);
                    }
                }
            } catch (e) {
                if (!cancelled) {
                    console.error("Error loading dataset images", e);
                    toaster.show({ message: "Failed to load dataset images", intent: "danger" });
                }
            } finally {
                if (!cancelled) {
                    setLoadingImages(false);
                }
            }
        };

        loadDatasetImages();

        return () => {
            cancelled = true;
        };
    }, [datasetId, toaster]);

    useEffect(() => {
        if (!datasetId) {
            setAnnotationSets([]);
            resetAnnotationEditor();
            return;
        }

        setAnnotationSets([]);
        setSelectedAnnotationSetId("");
        setAnnotationSetName("");
        setAnnotationSetDescription("");
        setPatches([]);
        setSelectedPatchId("");
        setDatasetAnnotations([]);
        setFeatureTypes(getDefaultFeatureTypes());
        loadAnnotationSets(datasetId);
    }, [datasetId, loadAnnotationSets]);

    useEffect(() => {
        if (!datasetId) {
            return;
        }

        if (!selectedAnnotationSetId) {
            setAnnotationSetName("");
            setAnnotationSetDescription("");
            setPatches([]);
            setSelectedPatchId("");
            setDatasetAnnotations([]);
            setFeatureTypes(getDefaultFeatureTypes());
            return;
        }

        let cancelled = false;

        const fetchAnnotationSet = async () => {
            const selectedSummary = annotationSets.find(
                (annotationSet) => String(annotationSet.id) === String(selectedAnnotationSetId)
            );
            if (!selectedSummary || String(selectedSummary.datasetId) !== String(datasetId)) {
                return;
            }

            setLoadingAnns(true);
            try {
                const data = await fetchMapAnnotations(datasetId, selectedAnnotationSetId);
                if (cancelled) {
                    return;
                }

                setAnnotationSetName(data.name || "");
                setAnnotationSetDescription(data.description || "");
                setPatches(data.patches || []);
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
    }, [annotationSets, datasetId, selectedAnnotationSetId, toaster]);

    useEffect(() => {
        if (!datasetImages.length) {
            setSelectedImage(null);
            return;
        }

        if (selectedImage && imagesById[String(selectedImage.id)]) {
            return;
        }

        setSelectedImage(null);
    }, [datasetImages, imagesById, selectedImage]);

    useEffect(() => {
        if (viewMode !== VIEW_MODE_PATCHES) {
            return;
        }

        if (!patches.length) {
            setSelectedPatchId("");
            return;
        }

        const activePatch = patches.find((patch) => String(patch.id) === String(selectedPatchId)) || patches[0];
        if (!selectedPatchId || String(activePatch.id) !== String(selectedPatchId)) {
            setSelectedPatchId(String(activePatch.id));
        }

        const patchImage = imagesById[String(activePatch.imageId)] || null;
        if (patchImage) {
            setSelectedImage((current) => (String(current?.id) === String(patchImage.id) ? current : patchImage));
        } else {
            setSelectedImage((current) => {
                if (String(current?.id) === String(activePatch.imageId)) {
                    return current;
                }
                return {
                    id: activePatch.imageId,
                    name: activePatch.imageName || `Image ${activePatch.imageId}`,
                    sizeX: activePatch.imageWidth,
                    sizeY: activePatch.imageHeight,
                };
            });
        }
    }, [viewMode, patches, selectedPatchId, imagesById]);

    const loadChannels = async (imageId) => {
        try {
            const data = await fetchImageChannels(imageId);
            setChannels(data.channels || []);
            setImageMeta({
                sizeZ: data.sizeZ || 1,
                sizeT: data.sizeT || 1,
                sizeX: data.sizeX || null,
                sizeY: data.sizeY || null,
            });
            setDatasetImages((currentImages) => currentImages.map((image) => (
                String(image.id) === String(imageId)
                    ? { ...image, sizeX: data.sizeX || image.sizeX, sizeY: data.sizeY || image.sizeY }
                    : image
            )));
        } catch (e) {
            console.error("Error loading channels", e);
            setImageMeta({ sizeZ: 1, sizeT: 1, sizeX: null, sizeY: null });
        }
    };

    const currentImageAnnotations = selectedImage
        ? datasetAnnotations.filter((annotation) => String(annotation.imageId) === String(selectedImage.id))
        : [];
    const currentPatchAnnotations = selectedPatch
        ? currentImageAnnotations.filter((annotation) => String(annotation.patchId || "") === String(selectedPatch.id))
        : [];
    const currentViewerAnnotations = viewMode === VIEW_MODE_PATCHES ? currentPatchAnnotations : currentImageAnnotations;
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
        const otherAnnotations = viewMode === VIEW_MODE_PATCHES && selectedPatch
            ? datasetAnnotations.filter(
                (annotation) => !(String(annotation.imageId) === selectedImageId && String(annotation.patchId || "") === String(selectedPatch.id))
            )
            : datasetAnnotations.filter((annotation) => String(annotation.imageId) !== selectedImageId);
        const normalizedAnnotations = nextAnnotations.map((annotation) => ({
            ...annotation,
            imageId: selectedImageId,
            patchId: viewMode === VIEW_MODE_PATCHES && selectedPatch ? String(selectedPatch.id) : (annotation.patchId ? String(annotation.patchId) : null),
        }));

        setDatasetAnnotations([...otherAnnotations, ...normalizedAnnotations]);
    };

    const handlePatchSelect = (patch) => {
        setViewMode(VIEW_MODE_PATCHES);
        setSelectedPatchId(String(patch.id));
        const patchImage = imagesById[String(patch.imageId)] || null;
        if (patchImage) {
            setSelectedImage(patchImage);
        }
    };

    const handleRemovePatch = (patchToRemove) => {
        const patchId = String(patchToRemove.id);
        const remainingPatches = patches.filter((patch) => String(patch.id) !== patchId);
        setPatches(remainingPatches);
        setDatasetAnnotations((currentAnnotations) => currentAnnotations.filter(
            (annotation) => String(annotation.patchId || "") !== patchId
        ));

        if (String(selectedPatchId) === patchId) {
            const nextPatch = remainingPatches[0] || null;
            setSelectedPatchId(nextPatch ? String(nextPatch.id) : "");
            if (!nextPatch) {
                setViewMode(VIEW_MODE_IMAGES);
            }
        }
    };

    const handleAddPatch = () => {
        const nextPatchWidth = Math.max(1, Math.round(Number(patchWidth) || DEFAULT_PATCH_SIZE));
        const nextPatchHeight = Math.max(1, Math.round(Number(patchHeight) || DEFAULT_PATCH_SIZE));
        const imagePatchCounts = datasetImages.reduce((counts, image) => {
            counts[String(image.id)] = 0;
            return counts;
        }, {});

        patches.forEach((patch) => {
            const key = String(patch.imageId);
            imagePatchCounts[key] = (imagePatchCounts[key] || 0) + 1;
        });

        const candidates = datasetImages
            .map((image) => {
                const dimensions = getImageDimensions(image);
                return { image, ...dimensions };
            })
            .filter(({ width, height }) => width && height && width >= nextPatchWidth && height >= nextPatchHeight);

        if (!candidates.length) {
            toaster.show({ message: `No images with known dimensions can host a ${nextPatchWidth}x${nextPatchHeight} patch`, intent: "warning" });
            return;
        }

        const minPatchCount = Math.min(...candidates.map(({ image }) => imagePatchCounts[String(image.id)] || 0));
        const preferredImages = candidates.filter(({ image }) => (imagePatchCounts[String(image.id)] || 0) === minPatchCount);
        const target = preferredImages[Math.floor(Math.random() * preferredImages.length)];

        const maxX = Math.max(0, target.width - nextPatchWidth);
        const maxY = Math.max(0, target.height - nextPatchHeight);
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        const newPatch = {
            id: crypto.randomUUID(),
            imageId: String(target.image.id),
            imageName: target.image.name,
            imageWidth: target.width,
            imageHeight: target.height,
            x,
            y,
            width: nextPatchWidth,
            height: nextPatchHeight,
        };

        setPatches((currentPatches) => [...currentPatches, newPatch]);
        setViewMode(VIEW_MODE_PATCHES);
        setSelectedPatchId(String(newPatch.id));
        setSelectedImage(target.image);
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
                patches: patches.map((patch) => ({
                    ...patch,
                    imageId: String(patch.imageId),
                })),
                annotations: datasetAnnotations.map((annotation) => ({
                    ...annotation,
                    imageId: annotation.imageId != null ? String(annotation.imageId) : annotation.imageId,
                    patchId: annotation.patchId != null ? String(annotation.patchId) : null,
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
            <div className="flex gap-4 flex-1 min-h-0">
                <div className="w-[24rem] flex flex-col gap-4 overflow-y-auto min-h-0 pr-1 shrink-0 max-h-[calc(100vh-260px)]">
                    <Card>
                        <DatasetSelectWithPopover
                            label="Select Dataset"
                            value={selectedDatasets}
                            onChange={handleDatasetChange}
                            multiSelect={false}
                            allowedCategories={["datasets"]}
                            buttonText={selectedDatasets.length ? "1 selected" : "Select Dataset"}
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
                                    ? `${selectedAnnotationSummary.patchCount || 0} patches, ${selectedAnnotationSummary.annotationCount} annotations across ${selectedAnnotationSummary.imageCount} images in the saved set.`
                                    : `${patches.length} patches, ${datasetAnnotations.length} annotations across ${annotatedImageCount} images in the current draft.`}
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
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <ButtonGroup>
                                <Button
                                    small
                                    active={viewMode === VIEW_MODE_IMAGES}
                                    onClick={() => setViewMode(VIEW_MODE_IMAGES)}
                                >
                                    Images
                                </Button>
                                <Button
                                    small
                                    active={viewMode === VIEW_MODE_PATCHES}
                                    onClick={() => setViewMode(VIEW_MODE_PATCHES)}
                                >
                                    Patches
                                </Button>
                            </ButtonGroup>
                            {viewMode === VIEW_MODE_PATCHES && (
                                <Button small icon="add" onClick={handleAddPatch} disabled={!datasetId || loadingImages}>
                                    Add Patch
                                </Button>
                            )}
                        </div>

                        {viewMode === VIEW_MODE_PATCHES && (
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <InputGroup
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    placeholder="Width"
                                    value={String(patchWidth)}
                                    onChange={(event) => setPatchWidth(event.target.value)}
                                    disabled={!datasetId || loadingImages}
                                />
                                <InputGroup
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    placeholder="Height"
                                    value={String(patchHeight)}
                                    onChange={(event) => setPatchHeight(event.target.value)}
                                    disabled={!datasetId || loadingImages}
                                />
                            </div>
                        )}

                        {viewMode === VIEW_MODE_IMAGES ? (
                            <>
                                <ImageSelector
                                    datasetId={datasetId}
                                    selectedImageId={selectedImage?.id}
                                    onSelect={(image) => {
                                        setSelectedImage(image);
                                        setViewMode(VIEW_MODE_IMAGES);
                                    }}
                                />
                            </>
                        ) : (
                            <>
                                <PatchSelector
                                    patches={patches}
                                    imagesById={imagesById}
                                    thumbnails={datasetThumbnails}
                                    selectedPatchId={selectedPatchId}
                                    onSelect={handlePatchSelect}
                                    onAddPatch={handleAddPatch}
                                    onRemovePatch={handleRemovePatch}
                                    totalAnnotations={datasetAnnotations.length}
                                    annotationCounts={patchAnnotationCounts}
                                />
                            </>
                        )}
                    </Card>

                    {viewMode === VIEW_MODE_PATCHES && selectedPatch && (
                        <Card>
                            <div className="text-xs text-gray-600">{`Patch ${selectedPatch.width}x${selectedPatch.height} on ${selectedPatch.imageName || selectedImage?.name || `Image ${selectedPatch.imageId}`}`}</div>
                            <div className="text-xs text-gray-500">{`Coords: x=${selectedPatch.x}, y=${selectedPatch.y}`}</div>
                            <div className="text-xs text-gray-500">{`${patchAnnotationCounts[String(selectedPatch.id)] || 0} annotations in this patch`}</div>
                        </Card>
                    )}
                </div>

                <div className="w-3/4 flex flex-col min-w-0 max-h-[calc(100vh-260px)]">
                    <Card className="flex-1 flex flex-col p-0 overflow-hidden min-h-0 shadow-none border">
                        {loadingAnns ? (
                            <div className="flex justify-center items-center h-full">
                                <Spinner />
                            </div>
                        ) : (
                            <AnnotationViewer
                                image={selectedImage}
                                annotations={currentViewerAnnotations}
                                onAnnotationsChange={handleImageAnnotationsChange}
                                channels={channels}
                                imageMeta={imageMeta}
                                featureTypes={featureTypes}
                                onFeatureTypesChange={setFeatureTypes}
                                patch={viewerPatch}
                            />
                        )}
                    </Card>
                                </div>
                        </div>
        </div>
        );
};

export default AnnotationTab;
