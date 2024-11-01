import { Http } from "./http";

import StatusCodes from "./codes";

import CommService from "./commService";
import { Validator } from "./validators";
import { log, onHandleData } from "./errorHandler";
// import "../assets/css/main.css";

class TitanStorage {
  static instance = null;

  constructor({ token, url, debug = false }) {
    this.commService = new CommService(new Http(token, url, debug));
  }
  /**
   * Initialize SDK, ensuring it is only initialized once
   * @param {Object} options - Initialization parameters
   * @returns {Object} Initialization result
   */
  static initialize(options = { token: "", debug: false, url: "" }) {
    try {
      const status = Validator.validateApiKey(options.token);
      if (status) {
        log(status);
        return status;
      }
      localStorage.setItem("titanOptions", JSON.stringify(options));
      TitanStorage.instance = new TitanStorage(options);
      const successStatus = onHandleData({ code: StatusCodes.SUCCESSFULLY });
      log(successStatus);
      return successStatus;
    } catch (error) {
      return onHandleData({ code: StatusCodes.InitSdk_ERROR });
    }
  }

  /**
   * Get the singleton instance of TitanStorage
   * @returns {TitanStorage} TitanSDK instance
   */
  static getInstance() {
    if (!TitanStorage.instance) {
      const options = JSON.parse(localStorage.getItem("titanOptions"));
      var statue = Validator.validateApiKey(options.token);
      if (statue) {
        log(statue);
      }
      TitanStorage.instance = new TitanStorage(options);
    }
    return TitanStorage.instance;
  }

  async updateToken(newToekn) {
    const data = this.commService.updateToken(newToekn);
    return data;
  }

  async updateLanguage(language) {
    const data = this.commService.updateLanguage(language);
    return data;
  }

  /**
   * Get the area IDs
   * @returns {Promise<Object>} List of area IDs
   */
  async listRegions() {
    const data = await this.commService.onAreaId();
    return data;
  }
  /**
   * Create a folder
   * @param {Object} params - Folder parameters
   * @param {string} params.name - Folder name
   * @param {number} params.parent - Parent folder ID
   * @returns {Promise<Object>} Result of the creation
   */
  async createFolder(options = { name: "", parent: 0 }) {
    const data = await this.commService.onCreateGroup(
      options.name,
      options.parent
    );
    return data;
  }
  /**
   * Get the list of asset groups
   * @param {number} page - Page number
   * @param {number} parent - Parent folder ID
   * @param {number} pageSize - Number of items per page
   * @returns {Promise<Object>} Asset group list data
   */
  async listDirectoryContents(
    options = {
      page: 1,
      parent: 0,
      pageSize: 10,
    }
  ) {
    const data = await this.commService.onAssetGroupList(
      options.page,
      options.parent,
      options.pageSize
    );
    return data;
  }

  /**
   * Rename a folder
   * @param {Object} options - Rename parameters
   * @param {number} options.groupId - Folder CID
   * @param {string} options.name - New name
   * @returns {Promise<Object>} Result of the rename operation
   */
  async renameFolder(options = { groupId: -1, name: "" }) {
    const data = await this.commService.renameGroup(options);
    return data;
  }

  /**
   * Rename an asset
   * @param {Object} options - Rename parameters
   * @param {number} options.assetId - Asset CID
   * @param {string} options.name - New name
   * @returns {Promise<Object>} Result of the rename operation
   */
  async renameAsset(options = { assetId: -1, name: "" }) {
    const data = await this.commService.renameAsset(options);
    return data;
  }

  /**
   * delete group
   * @param {Object} options -  delete parameters
   * @param {number} options.groupId - grouo ID
   * @returns {Promise<Object>}  Result of the rename operation
   */
  async deleteFolder(options = { groupId: -1 }) {
    const data = await this.commService.deleteGroup(options);
    return data;
  }
  /**
   * Delete a folder
   * @param {Object} options - Delete parameters
   * @param {number} options.groupId - Folder ID
   * @returns {Promise<Object>} Result of the delete operation
   */
  async deleteAsset(options = { assetId: -1, areaId: [] }) {
    const data = await this.commService.deleteAsset(options);
    return data;
  }
  /**
   * Get user information
   * @returns {Promise<Object>} User information
   */
  async getUserProfile() {
    const data = await this.commService.userInfo();
    return data;
  }

  /**
   * 获取文件和文件夹详细
   * 当cid 不为空时：获取文件信息，当 groupid不为空时获取文件夹信息
   */
  async getltemDetails(options = { cId: -1, groupId: -1 }) {
    const data = await this.commService.getAssetGroupInfo(options);
    return data;
  }

  /**
   * Share asset
   * @param {Object} options - Share parameters
   * @param {Object} options.id - Group ID or Asset CID, cannot be empty
   * @param {Number} options.expireAt - Share expiration date (in days), default is permanent. If provided, the input value must be a positive integer.
   * @param {string} options.shortPass - The access password is not mandatory. When it is not empty (a password consisting of 6 digits and letters), it needs to be verified whether it is valid
   * @param {string} options.hasDay - Whether it is a day, default no, supports timestamp when false, supports days when true
   * @param {string} options.hasDomain -Whether to carry the domain name by default. If it is false, the domain name needs to be concatenated
   * @returns {Promise<Object>} Share result
   */

  async createSharedLink(
    options = {
      id: null,
      expireAt: null,
      shortPass: "",
      hasDay: false,
      hasDomain: true,
    }
  ) {
    const data = await this.commService.onShare(options);
    return data;
  }
  /**
   * Upload a file
   * @param {File} file - File to be uploaded
   * @param {Object} assetData - Additional data related to the asset
   * @param {Function} onProgress - Progress callback function
   * @param {Function} onWritableStream - Progress callback function
   * @returns {Promise<Object>} Upload result
   */

  async uploadAsset(file, assetData, onProgress, onStreamStatus, onCancel) {
    const data = await this.commService.onFileUpload(
      file,
      assetData,
      onProgress,
      onStreamStatus,
      onCancel
    );
    return data;
  }

  /**
   * Download an asset
   * @param {Object} options - Download parameters
   * @param {string} options.assetCid - Asset CID
   * @param {string} options.assetType - Asset type (file or folder)
   * @param {string} [options.userId] - Optional user ID
   * @param {string} [options.areaId] - area ID
   * @param {boolean} [options.hasTempFile] - Use temporary file (true or false)
   * @param {string} [options.tempFileName] - Temporary file name
   * @param {number} [options.fileSize] - File size
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Download result
   */
  async downloadAsset(
    options = {
      areaId: "",
      assetCid: "",
      assetType: "",
      userId: "",
      hasTempFile: false,
      tempFileName: "",
      fileSize: 0,
      isOpen: false
    },
    onProgress
  ) {
    const data = await this.commService.onFileDown(options, onProgress);
    return data;
  }
}

export default TitanStorage;
