document.addEventListener('DOMContentLoaded', function () {
    var scriptButton = document.getElementById('scriptButton');

    if (scriptButton) {
        // Remove any existing event listeners (if using vanilla JavaScript)
        scriptButton.replaceWith(scriptButton.cloneNode(true));
        scriptButton = document.getElementById('scriptButton'); // Refresh the reference

        // Bind the new functionality using jQuery
        $(document).ready(function () {
            $("#scriptButton").off('click'); // Unbind any existing click events
            $("#scriptButton").on('click', function () {
                $("#scripts-menu-draggable").toggle(); // Toggle visibility of the script menu widget
            });
        });
    }
});
