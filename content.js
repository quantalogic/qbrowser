// content.js
"use strict";

function logError(error, context) {
  console.error(`[Content Script Error][${context}]:`, error);
  return {
    success: false,
    error: error.message,
    context: context,
    stack: error.stack
  };
}

/**
 * Simulate a mouse click event on an element.
 */
function simulateClick(element) {
  const clickEvent = new MouseEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(clickEvent);
}

/**
 * Retrieve an element by its XPath.
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
 * Execute a click at specific coordinates.
 */
function clickAtCoordinates(x, y) {
  const element = document.elementFromPoint(x, y);
  if (element) {
    simulateClick(element);
  } else {
    throw new Error("No element found at the provided coordinates");
  }
}

/**
 * Type text into a provided element.
 */
function typeText(element, text) {
  element.focus();
  element.value = text;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Execute arbitrary JavaScript code with timeout.
 */
function executeJavascript(script) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Script execution timed out after 5000ms"));
    }, 5000);

    try {
      const func = new Function(script);
      const result = func();
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(new Error("Script execution failed: " + error.message));
    }
  });
}

// Add cleanup handler
const cleanup = () => {
  // Cleanup any ongoing operations
  chrome.runtime.onMessage.removeListener(messageListener);
};

// Store listener reference for cleanup
const messageListener = async (request, sender, sendResponse) => {
  if (request.type === "PING") {
    sendResponse({ status: "OK" });
    return;
  }

  if (request.type !== "automation-command") {
    return;
  }

  const command = request.payload;
  
  // Add execution timeout
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Command execution timed out")), 10000);
  });

  try {
    const result = await Promise.race([
      processCommand(command),
      timeoutPromise
    ]);
    sendResponse(result);
  } catch (error) {
    sendResponse(logError(error, command.action));
  }
  
  return true;
};

chrome.runtime.onMessage.addListener(messageListener);

// Cleanup on unload
window.addEventListener('unload', cleanup);

async function processCommand(command) {
  let response = { success: true };
  
  // Add context verification
  if (!document.documentElement) {
    throw new Error("Document not ready");
  }

  switch (command.action) {
    case "click": {
      let element = command.xpath
        ? getElementByXPath(command.xpath)
        : document.querySelector(command.selector);
      if (element) {
        simulateClick(element);
      } else {
        throw new Error("Element not found for click");
      }
      break;
    }
    case "clickAtCoordinates": {
      if (command.x !== undefined && command.y !== undefined) {
        clickAtCoordinates(command.x, command.y);
      } else {
        throw new Error("Coordinates not provided for clickAtCoordinates");
      }
      break;
    }
    case "type": {
      let element = command.xpath
        ? getElementByXPath(command.xpath)
        : document.querySelector(command.selector);
      if (element && command.text !== undefined) {
        typeText(element, command.text);
      } else {
        throw new Error("Element not found or text missing for type command");
      }
      break;
    }
    case "getHtml": {
      response = { html: document.documentElement.outerHTML };
      break;
    }
    case "executeScript": {
      if (!command.script) {
        throw new Error("No script provided for execution");
      }
      const result = await executeJavascript(command.script);
      response = { result };
      break;
    }
    default:
      throw new Error("Unknown command: " + command.action);
  }
  
  return response;
}

// Notify background script that content script is ready
chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }).catch(() => {
  console.debug("Background script not ready");
});