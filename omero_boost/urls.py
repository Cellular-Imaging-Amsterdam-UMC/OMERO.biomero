#!/usr/bin/env python
# -*- coding: utf-8 -*-
from django.urls import path, re_path
from . import views

urlpatterns = [
    # API URLs
    path("api/list_dir/", views.list_directory, name="list_directory"),
    path("api/file_info/", views.file_info, name="file_info"),
    path("api/import_selected/", views.import_selected, name="import_selected"),
    path('api/biomero/workflows/', views.list_workflows, name='list_workflows'),
    path('api/biomero/workflows/metadata/', views.get_workflow_metadata, name='get_workflow_metadata'),
    # Webclient URLs
    path("upload/", views.omero_boost_upload, name="omero_boost_upload"),
    path(
        "local_file_browser/",
        views.get_folder_contents,
        name="local_file_browser",
    ),
    path(
        "monitor_workflows/",
        views.omero_boost_monitor_workflows,
        name="omero_boost_monitor_workflows",
    ),
    # Webclient templates and script menu
    re_path(
        r"^webclient_templates/(?P<base_template>[a-z0-9_]+)/",
        views.webclient_templates,
        name="webclient_templates",
    ),
    re_path(r"^get_script_menu/$", views.get_script_menu, name="get_script_menu"),
]
