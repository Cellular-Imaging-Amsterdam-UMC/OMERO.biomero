#!/usr/bin/env python
# -*- coding: utf-8 -*-
from django.urls import path, re_path
from . import views

urlpatterns = [
    # Import page URLs
    path('server_side_browser/', views.server_side_browser_page, name='server_side_browser_page'),
    path('api/list_dir/', views.list_directory, name='list_directory'),
    path('api/file_info/', views.file_info, name='file_info'),
    path('api/import_selected/', views.import_selected, name='import_selected'),

    # Database page URLs
    path('imports/', views.imports_database_page, name='imports_database_page'),
    path('workflows/', views.workflows_database_page, name='workflows_database_page'),

    # Webclient templates and script menu
    re_path(r'^webclient_templates/(?P<base_template>[a-z0-9_]+)/',
            views.webclient_templates, name='webclient_templates'),
    re_path(r'^get_script_menu/$', views.get_script_menu, name='get_script_menu'),
]
