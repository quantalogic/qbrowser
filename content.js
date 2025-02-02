function simulateClick(element) {
    const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent(clickEvent);
}

function clickAtCoordinates(x, y) {
    const element = document.elementFromPoint(x, y);
    if (element) {
        simulateClick(element);
    }
}

function typeText(element, text) {
    element.focus();
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type !== 'automation-command') {
        return;
    }

    const command = request.payload;
    let response = { success: true };

    try {
        switch (command.action) {
            case 'click':
                if (command.selector) {
                    const element = document.querySelector(command.selector);
                    if (element) {
                        simulateClick(element);
                    } else {
                        throw new Error('Element not found');
                    }
                }
                break;

            case 'clickAtCoordinates':
                if (command.x !== undefined && command.y !== undefined) {
                    clickAtCoordinates(command.x, command.y);
                } else {
                    throw new Error('Coordinates not provided');
                }
                break;

            case 'type':
                if (command.selector && command.text) {
                    const element = document.querySelector(command.selector);
                    if (element) {
                        typeText(element, command.text);
                    } else {
                        throw new Error('Element not found');
                    }
                }
                break;

            default:
                throw new Error('Unknown command');
        }
    } catch (error) {
        response = {
            success: false,
            error: error.message
        };
    }

    sendResponse(response);
    return true;
});