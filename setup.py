#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
from setuptools import setup, find_packages


# Utility function to read the README file.
def read(fname):
    return open(os.path.join(os.path.dirname(__file__), fname)).read()


setup(
    name="omero-boost",
    version="0.1.0",
    packages=find_packages(exclude=["ez_setup"]),
    description="A Python plugin for OMERO.web combining database pages, script menu, and web importer functionality",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Environment :: Web Environment",
        "Framework :: Django",
        "Intended Audience :: Developers",
        "Natural Language :: English",
        "Operating System :: OS Independent",
        "Programming Language :: JavaScript",
        "Programming Language :: Python :: 3",
        "Topic :: Internet :: WWW/HTTP",
        "Topic :: Internet :: WWW/HTTP :: Dynamic Content",
        "Topic :: Internet :: WWW/HTTP :: WSGI",
        "Topic :: Scientific/Engineering :: Visualization",
        "Topic :: Software Development :: Libraries :: Application Frameworks",
    ],
    author="Cellular Imaging Amsterdam UMC",
    author_email="cellularimaging@amsterdamumc.nl",
    license="AGPL-3.0",
    url="https://github.com/Cellular-Imaging-Amsterdam-UMC/omero-boost",
    download_url="https://github.com/Cellular-Imaging-Amsterdam-UMC/omero-boost/archive/refs/heads/main.zip",
    keywords=[
        "OMERO.web",
        "plugin",
        "database pages",
        "imports database",
        "workflows database",
        "script menu",
        "web importer",
    ],
    install_requires=[
        "omero-web>=5.6.0", 
        "pyjwt",
        "biomero>=2.0.0-alpha.2"],
    python_requires=">=3",
    include_package_data=True,
    zip_safe=False,
    package_data={
        "omero_boost": [
            # Static files
            "static/css/*.css",
            "static/img/*.svg",
            "static/js/*.js",
            # Template files
            "templates/omeroboost/webclientplugins/*.html",
            # Configuration files
            "*.omero",
        ],
    },
    entry_points={
        "console_scripts": [
            "omero-boost-setup=omero_boost.setup_integration:main",
        ],
    },
)
