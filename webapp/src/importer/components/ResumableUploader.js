import React, { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import Tus from "@uppy/tus";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import { importUploadedFile } from "../../apiService";
import { Callout, Intent } from "@blueprintjs/core";

const getUploadedFilename = (file, response, uploadedFilenameMap) => {
  const uploadUrl = response?.uploadURL;
  if (uploadUrl && uploadedFilenameMap.has(uploadUrl)) {
    return uploadedFilenameMap.get(uploadUrl);
  }

  const responseHeader = response?.xhr?.getResponseHeader?.("Upload-Filename");
  if (responseHeader) {
    return responseHeader;
  }

  return file.name;
};

const ResumableUploader = ({ datasetId, datasetType, group }) => {
  const dashboardRef = useRef(null);
  const uppyRef = useRef(null);
  const uploadedFilenameMapRef = useRef(new Map());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Create Uppy instance
    const uppyInstance = new Uppy({
      id: "uppy-uploader",
      debug: true,
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: null,
        minNumberOfFiles: 1,
      },
    }).use(Tus, {
      endpoint: "/omero_biomero/upload/",
      chunkSize: 150 * 1024 * 1024, // 150MB chunks for faster uploads
      retryDelays: [0, 1000, 3000, 5000],
      limit: 5, // Allow up to 5 concurrent file uploads
      onAfterResponse: (req, res) => {
        const uploadUrl = req.getURL?.();
        const uploadedFilename = res.getHeader?.("Upload-Filename");
        if (uploadUrl && uploadedFilename) {
          uploadedFilenameMapRef.current.set(uploadUrl, uploadedFilename);
        }
      },
    });

    uppyRef.current = uppyInstance;
    setIsReady(true);

    return () => {
      uppyInstance.close();
    };
  }, []);

  useEffect(() => {
    if (!isReady || !dashboardRef.current || !uppyRef.current) return;

    // Mount Dashboard plugin
    uppyRef.current.use(Dashboard, {
      inline: true,
      target: dashboardRef.current,
      width: "100%",
      height: 500,
      showProgressDetails: true,
      proudlyDisplayPoweredByUppy: false,
      note: "Drag and drop files here or click to browse",
    });

    // Handle upload success
    const onUploadSuccess = async (file, response) => {
      console.log("Upload success:", file, response);
      if (!datasetId) {
        console.warn("No dataset selected, skipping import trigger");
        return;
      }

      const uploadedFilename = getUploadedFilename(
        file,
        response,
        uploadedFilenameMapRef.current
      );

      try {
        await importUploadedFile(
          uploadedFilename,
          datasetId,
          datasetType,
          group
        );
        uppyRef.current.info(
          `Import queued for ${uploadedFilename}`,
          "success",
          3000
        );
        if (response?.uploadURL) {
          uploadedFilenameMapRef.current.delete(response.uploadURL);
        }
      } catch (error) {
        console.error("Import trigger failed", error);
        uppyRef.current.info(
          `Import failed for ${uploadedFilename}: ${error.message}`,
          "error",
          5000
        );
        if (response?.uploadURL) {
          uploadedFilenameMapRef.current.delete(response.uploadURL);
        }
      }
    };

    uppyRef.current.on("upload-success", onUploadSuccess);

    return () => {
      if (uppyRef.current) {
        uppyRef.current.off("upload-success", onUploadSuccess);
        // Remove Dashboard plugin on cleanup
        const dashboardPlugin = uppyRef.current.getPlugin("Dashboard");
        if (dashboardPlugin) {
          uppyRef.current.removePlugin(dashboardPlugin);
        }
      }
    };
  }, [isReady, datasetId, datasetType, group]);

  if (!datasetId) {
    return (
      <Callout intent={Intent.WARNING}>
        Please select a dataset to upload to.
      </Callout>
    );
  }

  if (datasetType !== "Dataset") {
    return (
      <Callout intent={Intent.WARNING}>
        Web uploads are only supported for Datasets. Please select a Dataset.
      </Callout>
    );
  }

  return (
    <div className="resumable-uploader p-4">
      <div ref={dashboardRef} style={{ minHeight: "500px" }} />
    </div>
  );
};

export default ResumableUploader;
