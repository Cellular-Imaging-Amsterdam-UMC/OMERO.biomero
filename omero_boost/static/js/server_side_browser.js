$(document).ready(function() {
    const columnsDiv = $('#columns');
    const selectedItems = new Set();
    const selectedItemsInfo = {}; // Store additional info for selected files
    let clickTimer = null;

    // CSRF token for POST requests
    const csrftoken = $('[name=csrfmiddlewaretoken]').val();

    // Load the base directory on page load
    loadDirectory('', 0);

    // Add the new event handler here
    $(document).on('click', '.remove-item', function(e) {
        e.stopPropagation();
        const filePath = $(this).siblings('.file-info').find('.file-path').text();
        selectedItems.delete(filePath);
        delete selectedItemsInfo[filePath];
        // Remove selected class from file browser
        $(`.file-name[data-path="${filePath}"]`).parent().removeClass('selected');
        updateSelectedItemsList();
    });
    
    function loadDirectory(path, level = 0) {
        console.log('=== loadDirectory called ===');
        console.log('Path:', path);
        console.log('Level:', level);
        
        // Use the correct URL pattern from urls.py
        $.getJSON('/omeroboost/api/list_dir/', { path: path })
            .done(function(data) {
                console.log('API Response:', data);
                
                // Remove all columns after the current level
                columnsDiv.children().slice(level).remove();
                
                // Create a new column
                const column = $('<div>').addClass('column');
                const list = $('<ul>');
                
                // Add directories first
                data.dirs.forEach(function(dir) {
                    const item = $('<li>')
                        .append($('<span>')
                            .addClass('directory-name')
                            .html('<i class="bi bi-folder"></i> ' + dir.name)
                            .data('path', dir.path)
                            .data('level', level));
                    list.append(item);
                });
                
                // Add files
                data.files.forEach(function(file) {
                    const item = $('<li>')
                        .append($('<span>')
                            .addClass('file-name')
                            .html('<i class="bi bi-file-earmark"></i> ' + file.name)
                            .data('path', file.path));
                        
                    // Add selected class to li instead of file-name
                    if (selectedItems.has(file.path)) {
                        item.addClass('selected');
                    }
                    
                    list.append(item);
                });
                
                column.append(list);
                columnsDiv.append(column);
                
                // Bind click events
                bindClickEvents(column, level);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error('L-Drive Access Error:', {
                    status: jqXHR.status,
                    statusText: jqXHR.statusText,
                    responseText: jqXHR.responseText
                });
            });
    }

    function handleDirectoryClick(item, path, level) {
        // Remove 'active-directory' from all li elements at the same level
        item.closest('.column').find('li').removeClass('active-directory');
        // Add active-directory to the parent li element
        item.closest('li').addClass('active-directory');

        // Load the directory contents
        loadDirectory(path, level + 1);
    }

    function handleDirectoryDoubleClick(item, path, level) {
        // Handle as single click first
        handleDirectoryClick(item, path, level);

        // Then, select all immediate files in the directory
        $.getJSON('/omeroboost/api/list_dir/', { path: path })
            .done(function(data) {
                if (data.error) {
                    console.error('Error loading directory:', data.error);
                    alert(data.error);
                    return;
                }

                // Select all files in the directory (non-recursive)
                data.files.forEach(function(file) {
                    const filePath = file.path;
                    selectedItems.add(filePath);
                    // Fetch file details
                    fetchFileInfo(filePath);
                });

                // Update the UI to reflect selected files
                const lastColumn = columnsDiv.children().last();
                lastColumn.find('.file-name').each(function() {
                    const filePath = $(this).data('path');
                    if (selectedItems.has(filePath)) {
                        $(this).parent().addClass('selected');
                    }
                });

                updateSelectedItemsList();
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error('Failed to load directory:', errorThrown);
                alert('Failed to load directory contents: ' + errorThrown);
            });
    }

    function fetchFileInfo(filePath) {
        // Fetch file information from the server
        $.getJSON('/omeroboost/api/file_info/', { path: filePath })
            .done(function(data) {
                if (data.error) {
                    console.error('Error fetching file info:', data.error);
                    return;
                }
                selectedItemsInfo[filePath] = data;
                updateSelectedItemsList();
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error('Failed to fetch file info:', errorThrown);
                selectedItemsInfo[filePath] = { size: 'Unknown', modified: 'Unknown' };
                updateSelectedItemsList();
            });
    }

    function updateSelectedItemsList() {
        const selectedItemsSection = $('#selected-items-section');
        selectedItemsSection.empty();

        if (selectedItems.size === 0) {
            selectedItemsSection.append('<p>No files selected.</p>');
            return;
        }

        const list = $('<ul>');

        selectedItems.forEach(function(filePath) {
            const fileInfo = selectedItemsInfo[filePath] || {};
            const listItem = $('<li>');
            const fileInfoDiv = $('<div>').addClass('file-info');

            // File Path and Details in same line
            fileInfoDiv.append($('<span>').addClass('file-path').text(filePath));
            fileInfoDiv.append($('<span>').addClass('file-details')
                .text(`${fileInfo.size || 'Unknown'} | ${fileInfo.modified || 'Unknown'}`));

            // Remove Icon
            const removeIcon = $('<i>').addClass('bi bi-x-circle-fill remove-item');

            listItem.append(fileInfoDiv);
            listItem.append(removeIcon);
            list.append(listItem);
        });

        selectedItemsSection.append(list);
    }

    $('#import-button').click(function() {
        if (selectedItems.size === 0) {
            alert('No items selected.');
            return;
        }

        $.ajax({
            url: '/webclient/omeroboost/api/import_selected/',
            type: 'POST',
            contentType: 'application/json',
            headers: {
                'X-CSRFToken': csrftoken
            },
            data: JSON.stringify({ selected: Array.from(selectedItems) }),
            success: function(response) {
                alert('Selected items have been imported.');
                // Clear selections
                selectedItems.clear();
                for (let key in selectedItemsInfo) delete selectedItemsInfo[key];
                $('.selected').removeClass('selected');
                updateSelectedItemsList();
            },
            error: function(xhr, status, error) {
                console.error('Import error:', error);
                alert('An error occurred during import: ' + error);
            }
        });
    });

    $('#clear-button').click(function() {
        // Clear selections
        selectedItems.clear();
        for (let key in selectedItemsInfo) delete selectedItemsInfo[key];
        $('.selected').removeClass('selected');
        updateSelectedItemsList();
    });

    // Make the separator movable
    let isResizing = false;
    let lastDownY = 0;

    $('#separator').on('mousedown', function(e) {
        isResizing = true;
        lastDownY = e.clientY;
        e.preventDefault();
    });

    $(document).on('mousemove', function(e) {
        if (!isResizing) return;

        let offsetBottom = $('#main-container').height() - (e.clientY - $('#main-container').offset().top);

        // Set minimum and maximum heights
        if (offsetBottom < 100) {
            offsetBottom = 100;
        } else if (offsetBottom > $('#main-container').height() - 100) {
            offsetBottom = $('#main-container').height() - 100;
        }

        $('#selected-items-section').css('height', offsetBottom);
        $('#file-browser-section').css('height', $('#main-container').height() - offsetBottom - $('#separator').outerHeight());

        e.preventDefault();
    });

    $(document).on('mouseup', function(e) {
        if (isResizing) {
            isResizing = false;
        }
    });

    function bindClickEvents(column, level) {
        // Directory click handling
        column.find('li').on('click', function(e) {
            const item = $(this).find('.directory-name, .file-name');
            if (item.length === 0) return;
            
            const path = item.data('path');
            
            if (item.hasClass('directory-name')) {
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    handleDirectoryDoubleClick(item, path, level);
                } else {
                    clickTimer = setTimeout(function() {
                        handleDirectoryClick(item, path, level);
                        clickTimer = null;
                    }, 300);
                }
            } else if (item.hasClass('file-name')) {
                const li = item.parent();
                if (li.hasClass('selected')) {
                    li.removeClass('selected');
                    selectedItems.delete(path);
                    delete selectedItemsInfo[path];
                } else {
                    li.addClass('selected');
                    selectedItems.add(path);
                    fetchFileInfo(path);
                }
                updateSelectedItemsList();
            }
        });
    }
});
