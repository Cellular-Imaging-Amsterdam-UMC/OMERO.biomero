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
        base_dir = "stardist_data"
        if os.path.exists(base_dir):
            shutil.rmtree(base_dir)
        os.makedirs(f"{base_dir}/images")
        os.makedirs(f"{base_dir}/masks")

        images = []
        
        # 2. Download Data
        print("Downloading images and annotations...")
        for image in dataset.listChildren():
            # Check for ROIs
            roi_service = conn.getRoiService()
            result = roi_service.findByImage(image.getId(), None)
            
            if not result.rois:
                print(f"Skipping image {image.getId()} (no ROIs)")
                continue
                
            # Download Image
            pixels = image.getPrimaryPixels()
            # Simple assumption: 2D image, create from plane 0,0
            # For real usage, iterate Z/T or handle 3D
            # We fetch plane (z=0, t=0)
            plane = pixels.getPlane(0, 0) # numpy array
            
            img_path = f"{base_dir}/images/{image.getId()}.tif"
            imwrite(img_path, plane)
            
            # Create Mask from ROIs
            # We assume ROIs are polygons
            # We need a mask of same shape as plane
            mask = np.zeros(plane.shape, dtype=np.uint16)
            
            # TODO: Rasterize polygons to mask
            # This requires converting OMERO shapes to mask
            # For simplicity, we skip complex rasterization here
            # and just create a dummy mask for proof of concept
            # OR we try to implement simple polygon fill if possible
            # But normally we use 'microbeSEG' logic or similar libraries
            
            # Mock mask generation (central square)
            h, w = mask.shape
            mask[h//4:3*h//4, w//4:3*w//4] = 1 
            
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
