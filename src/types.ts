export type CommandAction =
  | 'click'
  | 'type'
  | 'navigate'
  | 'screenshot'
  | 'ocr'
  | 'clickAtCoordinates';

export interface Command {
  action: CommandAction;
  xpath?: string;
  text?: string;
  requestId?: string;
  apiKey?: string;
  timestamp?: string;
  // For navigate
  url?: string;
  // For clickAtCoordinates
  x?: number;
  y?: number;
}

export interface SuccessResponse {
  success: boolean;
  error?: string;
  requestId?: string;
  timestamp: string;
  // Optional screenshot data (for screenshot actions)
  screenshot?: string;
}

export interface ChromeMessage<T = any> {
  type: string;
  payload: T;
  metadata?: {
    tabId?: number;
    frameId?: number;
  };
}