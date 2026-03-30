import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Card, Button, Spinner, HTMLSelect, InputGroup, ButtonGroup, NumericInput, ControlGroup } from "@blueprintjs/core";
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

const clampPercent = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(100, Math.max(0, parsed));
};

const sanitizeChannelScale = (scale = {}) => {
    const min = clampPercent(scale.min, 0);
    const max = Math.max(min, clampPercent(scale.max, 100));
    return { min, max };
};

const normalizeImageScalingEntry = (entry = {}, channels = []) => {
    const selectedChannel = entry?.selectedChannel != null ? String(entry.selectedChannel) : "";
    const patchIds = Array.isArray(entry?.patchIds) ? entry.patchIds.map(String) : [];

    const defaultVisibility = Object.fromEntries(
        (channels || []).map((channel) => [String(channel.index), channel.active !== false])
    );
    const channelVisibility = {
        ...defaultVisibility,
        ...Object.fromEntries(
            Object.entries(entry?.channelVisibility || {}).map(([key, value]) => [String(key), Boolean(value)])
        ),
    };
    if (selectedChannel !== "") {
        channelVisibility[selectedChannel] = true;
    }

    const channelScales = Object.fromEntries(
        Object.entries(entry?.channelScales || {}).map(([key, value]) => [String(key), sanitizeChannelScale(value)])
    );
    (channels || []).forEach((channel) => {
        const key = String(channel.index);
        if (!channelScales[key]) {
            channelScales[key] = { min: 0, max: 100 };
        }
    });

    return {
        selectedChannel,
        channelVisibility,
        channelScales,
        patchIds,
    };
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
    const [imageScalingsByImageId, setImageScalingsByImageId] = useState({});
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
        setImageScalingsByImageId({});
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
                setImageScalingsByImageId({});
            }
        } catch (e) {
            console.error("Error loading annotation sets", e);
            toaster.show({ message: "Failed to load annotation sets", intent: "danger" });
        } finally {
            setLoadingAnnotationSets(false);
        }
    }, [toaster]);

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
            setImageScalingsByImageId({});
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
                const savedPatches = data.patches || [];
                const relevantImageIds = savedPatches.length
                    ? Array.from(new Set(savedPatches.map((patch) => patch.imageId).filter(Boolean).map(String)))
                    : Array.from(new Set((data.annotations || []).map((annotation) => annotation.imageId).filter(Boolean).map(String)));
                const fallbackScaling = normalizeImageScalingEntry({
                    selectedChannel: data.selectedChannel,
                    channelVisibility: data.channelVisibility,
                    channelScales: data.channelScales,
                    patchIds: [],
                });
                const nextImageScalings = Object.fromEntries(
                    ((data.imageScalings || []).map((entry) => [
                        String(entry.imageId),
                        normalizeImageScalingEntry(entry),
                    ]))
                );
                if (!data.imageScalings?.length && relevantImageIds.length) {
                    relevantImageIds.forEach((imageId) => {
                        nextImageScalings[String(imageId)] = {
                            ...fallbackScaling,
                            patchIds: savedPatches
                                .filter((patch) => String(patch.imageId) === String(imageId))
                                .map((patch) => String(patch.id)),
                        };
                    });
                }
                setImageScalingsByImageId(nextImageScalings);
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

    const currentScalingImageId = useMemo(() => {
        if (viewerPatch?.imageId != null) {
            return String(viewerPatch.imageId);
        }
        if (selectedImage?.id != null) {
            return String(selectedImage.id);
        }
        return null;
    }, [selectedImage, viewerPatch]);

    const updateImageScalingEntry = useCallback((imageId, updater) => {
        if (imageId == null) {
            return;
        }

        setImageScalingsByImageId((currentEntries) => {
            const key = String(imageId);
            const baseEntry = normalizeImageScalingEntry(currentEntries[key], channels);
            const nextEntry = typeof updater === "function" ? updater(baseEntry) : updater;
            return {
                ...currentEntries,
                [key]: normalizeImageScalingEntry(nextEntry, channels),
            };
        });
    }, [channels]);

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

    const loadChannels = useCallback(async (imageId) => {
        try {
            const data = await fetchImageChannels(imageId);
            setChannels(data.channels || []);
            setImageScalingsByImageId((currentEntries) => ({
                ...currentEntries,
                [String(imageId)]: normalizeImageScalingEntry(currentEntries[String(imageId)], data.channels || []),
            }));
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
    }, []);

    useEffect(() => {
        if (selectedImage) {
            loadChannels(selectedImage.id);
        } else {
            setChannels([]);
            setImageMeta({ sizeZ: 1, sizeT: 1, sizeX: null, sizeY: null });
        }
    }, [loadChannels, selectedImage]);

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
    const annotationSetChannelOptions = channels.map((channel) => ({
        value: String(channel.index),
        label: channel.name || `Channel ${channel.index}`,
    }));
    const currentImageScaling = useMemo(
        () => normalizeImageScalingEntry(
            currentScalingImageId ? imageScalingsByImageId[currentScalingImageId] : {},
            channels
        ),
        [channels, currentScalingImageId, imageScalingsByImageId]
    );
    const selectedAnnotationChannel = currentImageScaling.selectedChannel;
    const channelVisibility = currentImageScaling.channelVisibility;
    const channelScales = currentImageScaling.channelScales;
    const selectedAnnotationChannelScale = sanitizeChannelScale(channelScales[selectedAnnotationChannel]);

    const handleAnnotationSetChannelScaleChange = useCallback((channelIndex, field, value) => {
        if (currentScalingImageId == null) {
            return;
        }

        updateImageScalingEntry(currentScalingImageId, (currentEntry) => {
            const key = String(channelIndex);
            const previous = sanitizeChannelScale(currentEntry.channelScales[key]);
            let nextChannelScale;

            if (field === "range" && Array.isArray(value)) {
                nextChannelScale = sanitizeChannelScale({ min: value[0], max: value[1] });
            } else {
                const nextValue = Number.isFinite(value) ? value : (field === "min" ? previous.min : previous.max);
                nextChannelScale = field === "min"
                    ? sanitizeChannelScale({ min: nextValue, max: previous.max })
                    : sanitizeChannelScale({ min: previous.min, max: nextValue });
            }

            return {
                ...currentEntry,
                channelScales: {
                    ...currentEntry.channelScales,
                    [key]: nextChannelScale,
                },
            };
        });
    }, [currentScalingImageId, updateImageScalingEntry]);

    const handleSelectedAnnotationChannelChange = useCallback((value) => {
        if (currentScalingImageId == null) {
            return;
        }

        updateImageScalingEntry(currentScalingImageId, (currentEntry) => ({
            ...currentEntry,
            selectedChannel: value,
            channelVisibility: value === ""
                ? currentEntry.channelVisibility
                : {
                    ...currentEntry.channelVisibility,
                    [String(value)]: true,
                },
        }));
    }, [currentScalingImageId, updateImageScalingEntry]);

    const handleCurrentImageChannelVisibilityChange = useCallback((nextVisibility) => {
        if (currentScalingImageId == null) {
            return;
        }

        updateImageScalingEntry(currentScalingImageId, (currentEntry) => ({
            ...currentEntry,
            channelVisibility: nextVisibility,
        }));
    }, [currentScalingImageId, updateImageScalingEntry]);

    const handleCurrentImageChannelScalesChange = useCallback((nextScales) => {
        if (currentScalingImageId == null) {
            return;
        }

        updateImageScalingEntry(currentScalingImageId, (currentEntry) => ({
            ...currentEntry,
            channelScales: nextScales,
        }));
    }, [currentScalingImageId, updateImageScalingEntry]);

    useEffect(() => {
        if (!channels.length || selectedAnnotationChannel === "") {
            return;
        }

        updateImageScalingEntry(currentScalingImageId, (currentEntry) => ({
            ...currentEntry,
            channelVisibility: {
                ...currentEntry.channelVisibility,
                [String(selectedAnnotationChannel)]: true,
            },
        }));
    }, [channels, currentScalingImageId, selectedAnnotationChannel, updateImageScalingEntry]);

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
            const imagesWithPatches = Array.from(new Set(patches.map((patch) => String(patch.imageId)).filter(Boolean)));
            const relevantScalingImageIds = imagesWithPatches.length
                ? imagesWithPatches
                : Array.from(new Set(datasetImages.map((image) => String(image.id)).filter(Boolean)));
            const payload = {
                version: "2.0",
                name: annotationSetName,
                description: annotationSetDescription,
                datasetId: String(datasetId),
                imageScalings: relevantScalingImageIds.map((imageId) => {
                    const entry = normalizeImageScalingEntry(imageScalingsByImageId[String(imageId)], channels);
                    return {
                        imageId: String(imageId),
                        selectedChannel: entry.selectedChannel !== "" ? String(entry.selectedChannel) : null,
                        channelVisibility: Object.fromEntries(
                            Object.entries(entry.channelVisibility).map(([key, value]) => [String(key), Boolean(value)])
                        ),
                        channelScales: Object.fromEntries(
                            Object.entries(entry.channelScales).map(([key, value]) => [String(key), sanitizeChannelScale(value)])
                        ),
                        patchIds: patches
                            .filter((patch) => String(patch.imageId) === String(imageId))
                            .map((patch) => String(patch.id)),
                    };
                }),
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
                <div className="w-[24rem] flex flex-col gap-4 overflow-y-auto min-h-0 pr-1 shrink-0 h-full max-h-[calc(100vh-260px)]">
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
                                <NumericInput
                                    min={1}
                                    minorStepSize={1}
                                    majorStepSize={32}
                                    placeholder="Width"
                                    value={patchWidth}
                                    onValueChange={(valueAsNumber) => setPatchWidth(valueAsNumber || DEFAULT_PATCH_SIZE)}
                                    disabled={!datasetId || loadingImages}
                                    className="numeric-input"
                                />
                                <NumericInput
                                    min={1}
                                    minorStepSize={1}
                                    majorStepSize={32}
                                    placeholder="Height"
                                    value={patchHeight}
                                    onValueChange={(valueAsNumber) => setPatchHeight(valueAsNumber || DEFAULT_PATCH_SIZE)}
                                    disabled={!datasetId || loadingImages}
                                    className="numeric-input"
                                />
                            </div>
                        )}

                        {channels.length > 0 && currentScalingImageId && (
                            <div className="flex flex-col gap-3 mb-3">
                                <HTMLSelect
                                    fill
                                    value={selectedAnnotationChannel}
                                    onChange={(event) => handleSelectedAnnotationChannelChange(event.target.value)}
                                    disabled={!channels.length}
                                >
                                    <option value="">Select annotation channel</option>
                                    {annotationSetChannelOptions.map((channel) => (
                                        <option key={channel.value} value={channel.value}>
                                            {channel.label}
                                        </option>
                                    ))}
                                </HTMLSelect>

                                {selectedAnnotationChannel !== "" && (
                                    <div className="rounded border bg-white p-2.5 min-w-0">
                                        <div className="text-xs font-bold uppercase text-gray-500 mb-2">
                                            Image Normalization
                                        </div>
                                        <ControlGroup fill={true} vertical={false} className="gap-3 items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="normalization-input-label">Min</span>
                                                <NumericInput
                                                    min={0}
                                                    max={100}
                                                    stepSize={0.1}
                                                    majorStepSize={0.5}
                                                    value={selectedAnnotationChannelScale.min}
                                                    onValueChange={(valueAsNumber) => handleAnnotationSetChannelScaleChange(selectedAnnotationChannel, "min", valueAsNumber)}
                                                    className="normalization-input"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="normalization-input-label">Max</span>
                                                <NumericInput
                                                    min={0}
                                                    max={100}
                                                    stepSize={0.1}
                                                    majorStepSize={0.5}
                                                    value={selectedAnnotationChannelScale.max}
                                                    onValueChange={(valueAsNumber) => handleAnnotationSetChannelScaleChange(selectedAnnotationChannel, "max", valueAsNumber)}
                                                    className="normalization-input"
                                                />
                                            </div>
                                        </ControlGroup>
                                    </div>
                                )}
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
                                className="bp5-input min-h-[44px] resize-y"
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
                </div>

                <div className="w-3/4 flex flex-grow flex-col min-w-0 max-h-[calc(100vh-260px)]">
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
                                channelVisibility={channelVisibility}
                                onChannelVisibilityChange={handleCurrentImageChannelVisibilityChange}
                                channelScales={channelScales}
                                onChannelScalesChange={handleCurrentImageChannelScalesChange}
                                lockedChannelIndex={selectedAnnotationChannel !== "" ? selectedAnnotationChannel : null}
                            />
                        )}
                    </Card>
                                </div>
                        </div>
        </div>
        );
};

export default AnnotationTab;
