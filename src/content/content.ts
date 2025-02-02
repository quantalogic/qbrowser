import { Command } from "../types";

const isValidXPath = (xpath: string): boolean => {
  try {
    document.evaluate(xpath, document);
    return true;
  } catch (error) {
    return false;
  }
};

chrome.runtime.onMessage.addListener((message: { type: string; payload: Command }, sender, sendResponse) => {
  if (message.type !== 'automation-command') return;

  const command = message.payload;
  console.log('Content script received command:', command);

  switch (command.action) {
    case 'type':
      if (command.xpath && command.text) {
        if (!isValidXPath(command.xpath)) {
          console.error('Invalid XPath:', command.xpath);
          sendResponse({ success: false, error: 'Invalid XPath', requestId: command.requestId });
          return;
        }
        const element = document.evaluate(
          command.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue as HTMLInputElement;
        
        if (element) {
          element.value = command.text;
          sendResponse({ success: true, requestId: command.requestId });
        } else {
          console.error('Element not found for XPath:', command.xpath);
          sendResponse({ success: false, error: 'Element not found', requestId: command.requestId });
        }
      } else {
        sendResponse({ success: false, error: 'Missing XPath or text for type action', requestId: command.requestId });
      }
      break;
    case 'click':
      if (command.xpath) {
        if (!isValidXPath(command.xpath)) {
          console.error('Invalid XPath:', command.xpath);
          sendResponse({ success: false, error: 'Invalid XPath', requestId: command.requestId });
          return;
        }
        const element = document.evaluate(
          command.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue as HTMLElement;
        
        if (element) {
          element.click();
          sendResponse({ success: true, requestId: command.requestId });
        } else {
          console.error('Element not found for XPath:', command.xpath);
          sendResponse({ success: false, error: 'Element not found', requestId: command.requestId });
        }
      } else {
        sendResponse({ success: false, error: 'Missing XPath for click action', requestId: command.requestId });
      }
      break;
    case 'clickAtCoordinates':
      if (typeof command.x === 'number' && typeof command.y === 'number') {
        const element = document.elementFromPoint(command.x, command.y) as HTMLElement;
        if (element) {
          element.click();
          sendResponse({ success: true, requestId: command.requestId });
        } else {
          console.error('No element found at coordinates:', command.x, command.y);
          sendResponse({ success: false, error: 'No element found at coordinates', requestId: command.requestId });
        }
      } else {
        sendResponse({ success: false, error: 'Missing or invalid coordinates for clickAtCoordinates action', requestId: command.requestId });
      }
      break;
    default:
      console.error('Unknown command action in content script:', command.action);
      sendResponse({ success: false, error: 'Unknown command action', requestId: command.requestId });
  }
});