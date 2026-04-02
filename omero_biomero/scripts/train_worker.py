import argparse
import os
import shutil
import numpy as np
from tifffile import imwrite
from omero.gateway import BlitzGateway
from stardist.models import Config2D, StarDist2D, StarDistData2D
from csbdeep.utils import normalize
from glob import glob
import zipfile

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--dataset-id", type=int, required=True)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--val-split", type=float, default=0.15)
    parser.add_argument("--patch-size", type=int, default=256)
    parser.add_argument("--model-name", required=True)
    args = parser.parse_args()

    # 1. Connect to OMERO
    conn = BlitzGateway(host=args.host, port=args.port)
    conn.connect(sUuid=args.session)

    if not conn.isConnected():
        print("Failed to connect to OMERO")
        return

    try:
        print(f"Connected to OMERO. Fetching dataset {args.dataset_id}...")
        dataset = conn.getObject("Dataset", args.dataset_id)
        if not dataset:
            print("Dataset not found")
            return

        # Prepare directories
        base_dir = "prediction_data"
        if os.path.exists(base_dir):
            shutil.rmtree(base_dir)
        os.makedirs(f"{base_dir}/images")
        os.makedirs(f"{base_dir}/masks")

        images = []

        import json
        from skimage.draw import polygon
        import omero

        # 2. Download Data
        print("Downloading images and annotations...")
        annotation_payload = None
        latest_annotation_file = None
        for ann in dataset.listAnnotations():
            if not isinstance(ann, omero.gateway.FileAnnotationWrapper):
                continue
            if ann.getNs() != "biomero.prediction.annotations":
                continue
            if latest_annotation_file is None or ann.getId() > latest_annotation_file.getId():
                latest_annotation_file = ann

        if latest_annotation_file:
            try:
                content = b""
                for chunk in latest_annotation_file.getFileInChunks():
                    content += chunk
                annotation_payload = json.loads(content)
            except Exception as e:
                print(f"Failed to load dataset annotation set {latest_annotation_file.getId()}: {e}")

        for image in dataset.listChildren():
            found_polys = []
            if annotation_payload and "annotations" in annotation_payload:
                found_polys = [
                    ann
                    for ann in annotation_payload["annotations"]
                    if str(ann.get("imageId")) == str(image.getId())
                ]

            if not found_polys:
                print(f"Skipping image {image.getId()} (no dataset-level annotations)")
                continue

            # Download Image
            pixels = image.getPrimaryPixels()
            # We fetch plane (z=0, t=0)
            plane = pixels.getPlane(0, 0) # numpy array

            img_path = f"{base_dir}/images/{image.getId()}.tif"
            imwrite(img_path, plane)

            # Create Mask from Polygons
            mask = np.zeros(plane.shape, dtype=np.uint16)

            for idx, poly in enumerate(found_polys):
                points = poly.get("points")
                if not points or len(points) < 3: continue

                # points is [[x,y], ..]
                # skimage polygon expects rows(y), cols(x)
                rr = [p[1] for p in points]
                cc = [p[0] for p in points]

                try:
                    r_idx, c_idx = polygon(rr, cc, shape=mask.shape)
                    mask[r_idx, c_idx] = idx + 1 # Instance labels 1..N
                except Exception as e:
                    print(f"Error rasterizing polygon {idx} on image {image.getId()}: {e}")

            mask_path = f"{base_dir}/masks/{image.getId()}.tif"
            imwrite(mask_path, mask)

            images.append(image.getId())

        print(f"Downloaded {len(images)} annotated images.")

        if len(images) == 0:
            print("No training data found.")
            return

        # 3. Train
        print(f"Starting training for {args.epochs} epochs...")

        # Data reading
        X = sorted(glob(f"{base_dir}/images/*.tif"))
        Y = sorted(glob(f"{base_dir}/masks/*.tif"))

        # In real world, we would restart from existing model or use defaults
        # configuration
        conf = Config2D (
            n_rays       = 32,
            grid         = (2,2),
            n_channel_in = 1,
            train_patch_size = (args.patch_size, args.patch_size),
            train_batch_size = args.batch_size,
            train_epochs = args.epochs,
            train_learning_rate = 0.0003,
        )

        model = StarDist2D(conf, name=args.model_name, basedir="models")

        # Need to read images into numpy arrays
        # Stardist expects lists of arrays
        from tifffile import imread
        X_data = [normalize(imread(x), 1,99.8, axis=(0,1)) for x in X]
        Y_data = [imread(y) for y in Y]

        model.train(X_data, Y_data, validation_split=args.val_split)

        print("Training finished.")

        # 4. Upload Model
        # Zip the model directory and upload as FileAnnotation or original file
        model_path = f"models/{args.model_name}"
        zip_path = f"{args.model_name}.zip"

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(model_path):
                for file in files:
                    zipf.write(os.path.join(root, file),
                               os.path.relpath(os.path.join(root, file),
                               os.path.join(model_path, '..')))

        print(f"Model zipped to {zip_path}. Uploading...")

        # Upload to OMERO (attach to Dataset?)
        # For now, just leave it on disk or print location

        print("Done.")

    finally:
        conn.close()

if __name__ == "__main__":
    main()
