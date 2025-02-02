// src/types.ts
export type CommandAction =
  | 'click'
  | 'type'
  | 'navigate'
  | 'screenshot'
  | 'ocr'
  | 'clickAtCoordinates'
  | 'getHtml'
  | 'executeScript';

export interface Command {
  action: CommandAction;
  requestId?: string;
  apiKey?: string;
  timestamp?: string;
  // For navigate action
  url?: string;
  // For click and type commands
  xpath?: string;
  selector?: string;
  text?: string;
  // For clickAtCoordinates command
  x?: number;
  y?: number;
  // For executeScript command
  script?: string;
}

export interface SuccessResponse {
  success: boolean;
  error?: string;
  requestId?: string;
  timestamp: string;
  // Optional screenshot data (for screenshot actions)
  screenshot?: string;
  action?: string;
  result?: any;
  message?: string;
}

export interface ChromeMessage<T = any> {
  type: string;
  payload: T;
  metadata?: {
    tabId?: number;
    frameId?: number;
  };
}