enum httpStatusCode {
  Info = 100,
  OK = 200,
  BAD = 400,
  SERVER_ERROR = 500,
}
export interface requestStatus {
  statusCode: httpStatusCode;
  message?: string;
  payload?: object | attachmentPayload;
}

// todo: this should be someplace else
export interface attachmentPayload {
  fileBuffer: Buffer;
  mimeType: string;
}
