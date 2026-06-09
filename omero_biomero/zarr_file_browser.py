import os
import json

def read_zarr_file(file_path, folder_uuid=None, image_uuid=None):
    """
    Read Zarr file structure.
    If it is a plate, lists the plate itself.
    If it is an image, lists the image itself.
    Additionally lists any nested labels.
    """
    # 1. Open the root .zattrs
    zattrs_path = os.path.join(file_path, ".zattrs")
    root_attrs = {}
    if os.path.exists(zattrs_path):
        try:
            with open(zattrs_path, "r", encoding="utf-8") as f:
                root_attrs = json.load(f)
        except Exception:
            pass

    children = []

    container_name = os.path.basename(file_path)

    # Check if it is a Plate
    if "plate" in root_attrs:
        plate_meta = root_attrs["plate"]
        plate_name = plate_meta.get("name")
        if not plate_name or plate_name == "/":
            plate_name = container_name
        children.append({
            "name": f"Plate: {plate_name}",
            "type": "Image",
            "uuid": "plate",
            "zarr_type": "plate"
        })
    else:
        # It's a regular Image
        image_name = None
        if "multiscales" in root_attrs and isinstance(root_attrs["multiscales"], list) and root_attrs["multiscales"]:
            image_name = root_attrs["multiscales"][0].get("name")
        if not image_name or image_name == "/":
            image_name = container_name
        children.append({
            "name": image_name,
            "type": "Image",
            "uuid": "image",
            "zarr_type": "image"
        })

    # Check for labels subdirectory
    labels_dir = os.path.join(file_path, "labels")
    if os.path.isdir(labels_dir):
        try:
            for item in os.listdir(labels_dir):
                item_path = os.path.join(labels_dir, item)
                is_zarr = any(
                    os.path.exists(os.path.join(item_path, f))
                    for f in (".zattrs", ".zgroup", ".zarray")
                )
                if is_zarr or os.path.isdir(item_path):
                    display_name = item
                    if item.lower().endswith(".zarr"):
                        display_name = item[:-5]
                    children.append({
                        "name": f"Label: {display_name}",
                        "type": "Image",
                        "uuid": f"labels/{item}",
                        "zarr_type": "image"
                    })
        except Exception:
            pass

    return json.dumps({
        "name": os.path.basename(file_path),
        "children": children
    })
