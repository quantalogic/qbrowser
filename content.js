/**
 * Helper function: simulate a click event on an element
 */
function simulateClick(element) {
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(clickEvent);
  }
  
  /**
   * Helper function: get element by XPath
   */
  function getElementByXPath(xpath) {
    return document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }
  
  /**
   * Executes a click at the provided coordinates.
   */
  function clickAtCoordinates(x, y) {
    const element = document.elementFromPoint(x, y);
    if (element) {
      simulateClick(element);
    } else {
      throw new Error('No element found at the provided coordinates');
    }
  }
  
  /**
   * Type text into the provided element.
   */
  function typeText(element, text) {
    element.focus();
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  /**
   * Execute arbitrary JavaScript code (use with caution)
   */
  function executeJavascript(script) {
    // In a real-world scenario, you might want sandbox or secure the execution of arbitrary code.
    return eval(script);
  }
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type !== 'automation-command') {
      return;
    }
  
    const command = request.payload;
    let response = { success: true };
  
    try {
      switch (command.action) {
        case 'click': {
          let element = null;
          if (command.xpath) {
            element = getElementByXPath(command.xpath);
          } else if (command.selector) {
            element = document.querySelector(command.selector);
          }
  
          if (element) {
            simulateClick(element);
          } else {
            throw new Error('Element not found for click');
          }
          break;
        }
        case 'clickAtCoordinates': {
          if (command.x !== undefined && command.y !== undefined) {
            clickAtCoordinates(command.x, command.y);
          } else {
            throw new Error('Coordinates not provided for click at coordinates');
          }
          break;
        }
        case 'type': {
          let element = null;
          if (command.xpath) {
            element = getElementByXPath(command.xpath);
          } else if (command.selector) {
            element = document.querySelector(command.selector);
          }
          if (element && command.text !== undefined) {
            typeText(element, command.text);
          } else {
            throw new Error('Element not found or text missing for type command');
          }
          break;
        }
        case 'getHtml': {
          // Return the outer HTML of the document
          response = { html: document.documentElement.outerHTML };
          break;
        }
        case 'executeScript': {
          if (!command.script) {
            throw new Error('No script provided for execution');
          }
          // Execute the provided JavaScript code and send back the result.
          const result = executeJavascript(command.script);
          response = { result };
          break;
        }
        default:
          throw new Error(`Unknown command: ${command.action}`);
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