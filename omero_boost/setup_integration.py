import os
from shutil import copyfile


def main():
    # Step 1: Add the database-pages configuration to OMERO.web
    config_src = os.path.join(
        os.path.dirname(__file__), 'omero-boost.omero'
    )
    config_dst = '/opt/omero/web/config/omero-boost.omero'

    try:
        copyfile(config_src, config_dst)
        print(
            f"Successfully added database-pages configuration: "
            f"{config_src} -> {config_dst}"
        )
    except Exception as e:
        print(f"Error adding database-pages configuration: {e}")