#!/usr/bin/env python
# -*- coding: utf-8 -*-
from django.urls import path, re_path
from . import views

urlpatterns = [
    # API URLs
    path("api/import_selected/",
         views.import_selected,
         name="import_selected"),
    path("api/biomero/admin/config/",
         views.get_biomero_config,
         name="get_biomero_config"),
    path("api/biomero/workflows/",
         views.list_workflows,
         name="list_workflows"),
    path("api/biomero/workflows/<str:name>/metadata/",
         views.get_workflow_metadata,
         name="get_workflow_metadata"),
    path("api/biomero/workflows/<str:name>/github/",
         views.get_workflow_github,
         name="get_workflow_github"),
    path("api/biomero/workflows/run/",
         views.run_workflow_script,
         name="run_workflow_script"),  # POST
    path("api/biomero/admin/config/save/",
         views.save_biomero_config,
         name="save_biomero_config"),  # POST
    # Webclient URLs
    path("get_folder_contents/",
         views.get_folder_contents,
         name="get_folder_contents",
         ),
    path("canvas/",
         views.canvas,
         name="canvas",
         ),
    # Webclient templates and script menu
    re_path(r"^get_script_menu/$",
            views.get_script_menu,
            name="get_script_menu"),
]
