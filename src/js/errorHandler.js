// src/errorHandler.js
import StatusCodes from "./codes";

export function handleError(statusCode, errorMessage) {
  let userMessage;

  switch (statusCode) {
    case StatusCodes.InitSdk_OK:
      userMessage = "Initialize SDK Success";
      break;

    case StatusCodes.BAD_REQUEST:
      userMessage = "The request was invalid. Please check your input.";
      break;
    case StatusCodes.UNAUTHORIZED:
      userMessage = "You are not authorized. Please check your credentials.";
      break;
    case StatusCodes.FORBIDDEN:
      userMessage = "You do not have permission to access this resource.";
      break;
    case StatusCodes.NOT_FOUND:
      userMessage = "The requested resource could not be found.";
      break;
    case StatusCodes.INTERNAL_SERVER_ERROR:
      userMessage = "An error occurred on the server. Please try again later.";
      break;
    case StatusCodes.SERVICE_UNAVAILABLE:
      userMessage =
        "The service is currently unavailable. Please try again later.";
      break;
    // 自定义错误码处理
    case StatusCodes.API_KEY_EMPTY:
      userMessage = "API toekn is required and cannot be empty.";
      break;
    case StatusCodes.INVALID_API_KEY:
      userMessage = "The provided API Key is invalid.";
      break;
    case StatusCodes.RESOURCE_NOT_AVAILABLE:
      userMessage = "The requested resource is not available.";
      break;
    case StatusCodes.ID_KEY_EMPTY:
      userMessage = "ID is required but was not provided.";
      break;

    case StatusCodes.ASSET_OBJ_ERROR:
      userMessage = "Invalid options provided.";
      break;

    case StatusCodes.REQUEST_ERROR:
      userMessage = "Failed to retrieve asset group information.";
      break;

    case StatusCodes.FILE_NAME_KEY_EMPTY:
      userMessage = "Name is required but was not provided.";
      break;
    case StatusCodes.PARENT_ID_ERROR:
      userMessage = "Parent ID is required but was incorrect.";
      break;
    case StatusCodes.SHARE_ERROE:
      userMessage = "The file cannot be shared.";
      break;
    case StatusCodes.ASSEST_OBJ_ERROR:
      userMessage = "assetDetail must be an object.";
      break;

    case StatusCodes.PARENT_ID_INVALID:
      userMessage =
        "Invalid 'parent' parameter. It should be a non-negative number.";
      break;

    case StatusCodes.PAGE_ERROR:
      userMessage = "Invalid 'page' parameter. It should be a positive number.";
      break;

    case StatusCodes.PAGESIZE_ERROR:
      userMessage =
        "Invalid 'pageSize' parameter. It should be a non-negative number.";
      break;

    case StatusCodes.MISSING_FIELDS_ERROR:
      userMessage = "Missing required fields in assetDetail";
      break;
    case StatusCodes.INVALID_PASSWORD:
      userMessage =
        "Invalid shortPass format. It should be a 6-character alphanumeric string.";
      break;
    case StatusCodes.AREA_ID_ERROR:
      userMessage = "area_id should be an array.";
      break;

    case StatusCodes.Group_ID_ERROR:
      userMessage = "group_id should be a non-negative integer.";
      break;

    case StatusCodes.Asset_Type_ERROR:
      userMessage = "asset_type should be 0 or 1.";
      break;

    case StatusCodes.Sdk_OK:
      userMessage = "TitanSDK initialized successfully";
      break;

    case StatusCodes.InitSdk_ERROR:
      userMessage = "Failed to initialize TitanSDK";
      break;

    case StatusCodes.Dowload_URL_ERROR:
      userMessage = "No available download address";
      break;
    case StatusCodes.Dowload_Type_ERROR:
      userMessage = "Download type not found";
      break;

    case StatusCodes.SUCCESSFULLY:
      userMessage = "Success";
      break;
    case StatusCodes.FAILURE:
      userMessage = "Failure";
      break;

    default:
      userMessage = "An unknown error occurred.";
  }

  return {
    code: statusCode,
    msg: errorMessage || userMessage,
  };
}

export function log(message, data = {}) {
  const options = JSON.parse(localStorage.getItem("titanOptions"));
  if (options.debug) {
    if (Object.keys(data).length > 0) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

export function onHandleData({ code, msg = "", data = {} } = {}) {
  let errorDetails = { code, msg };
  if (!msg) {
    errorDetails = handleError(code, msg);
  }

  return {
    code: errorDetails.code,
    msg: errorDetails.msg,
    data: data || {},
  };
}
