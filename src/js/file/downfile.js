import StatusCodes from "../codes";
import { onHandleData, log } from "../errorHandler";
import Report from "../report";

class SimpleLock {
  constructor() {
    this._locked = false;
    this._waiting = [];
  }

  async acquire() {
    while (this._locked) {
      await new Promise((resolve) => this._waiting.push(resolve));
    }
    this._locked = true;
  }

  release() {
    this._locked = false;
    if (this._waiting.length > 0) {
      const nextResolve = this._waiting.shift();
      nextResolve();
    }
  }
}

class DownloadScheduler {
  constructor(urls, chunkSize) {
    this.urls = urls; // 下载的所有地址
    this.chunkSize = chunkSize; // 每个分片的大小
    this.chunkQueue = []; // 分片任务队列，存储未下载的分片
    this.failedChunks = []; // 存储下载失败的分片
    this.completedChunks = []; // 存储下载成功的分片
    this.totalSize = 0; // 总文件大小
    this.downloadedSize = 0; // 已下载的总大小
    this.urlStatus = {}; // 用于记录每个 URL 的状态
    // 初始化 URL 状态
    for (const url of this.urls) {
      const nodeId = this.getNodeId(url);
      this.urlStatus[nodeId] = { code: 0, msg: "" }; // 初始化状态，待下载
    }
  }

  // 初始化分片任务，根据文件大小分配分片
  initializeChunks(fileSize) {
    this.totalSize = fileSize; // 记录文件的总大小
    console.log(`Total Size: ${fileSize}`);
    const totalChunks = Math.ceil(fileSize / this.chunkSize);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(fileSize - 1, (i + 1) * this.chunkSize - 1);
      this.chunkQueue.push({ start, end, size: end - start + 1 }); // 加入 size 属性
    }

    // console.log("initializeChunks;", this.chunkQueue.length);
    // this.chunkQueue.forEach((chunk, index) => {
    //   console.log(`Chunk ${index}:`, JSON.stringify(chunk));

    // });
  }

  // 更新已下载的大小
  updateDownloadedSize(chunkSize) {
    this.downloadedSize += chunkSize; // 累加已下载的大小
  }

  // 获取下载进度百分比
  getProgress() {
    return Math.floor((this.downloadedSize / this.totalSize) * 100); // 计算下载百分比
  }

  // 获取下一个需要下载的分片
  getNextChunk() {
    return this.chunkQueue.shift();
  }

  // 标记分片下载失败，将其存入失败队列
  markChunkFailed(chunk, url, error) {
    const nodeId = this.getNodeId(url);
    // 检查是否已经存在相同的失败分片
    const chunkExists = this.failedChunks.some(
      (existingChunk) =>
        existingChunk.start === chunk.start && existingChunk.end === chunk.end
    );
    // 如果不存在，则添加到失败分片列表
    if (!chunkExists) {
      chunk.retries = 0;
      this.failedChunks.push(chunk);
    }
    this.urlStatus[nodeId].code = 2; // 设置为失败状态
    this.urlStatus[nodeId].msg = `${error}`; // 更新失败消息
  }

  // 标记分片下载成功，将其存入成功队列
  markChunkCompleted(chunk, url) {
    const nodeId = this.getNodeId(url);
    // 检查是否已经存在相同的成功分片
    const chunkExists = this.completedChunks.some(
      (existingChunk) =>
        existingChunk.start === chunk.start && existingChunk.end === chunk.end
    );
    // 如果不存在，则添加到成功分片列表
    if (!chunkExists) {
      this.completedChunks.push(chunk);
    }
    this.urlStatus[nodeId].code = 1; // 设置为成功状态
    this.urlStatus[nodeId].msg = `completed`; // 更新成功消息
  }

  // 检查是否有失败的分片需要重试
  hasFailedChunks() {
    return this.failedChunks.length > 0;
  }

  // 检查是否所有分片已下载完成
  allChunksCompleted() {
    console.log(
      "【allChunksCompleted：】",
      this.completedChunks.length,
      Math.ceil(this.totalSize / this.chunkSize)
    );
    return (
      this.completedChunks.length >= Math.ceil(this.totalSize / this.chunkSize)
    );
  }
  // 获取每个 URL 的状态
  getUrlStatus() {
    return Object.keys(this.urlStatus).map((nodeId) => ({
      nodeId,
      code: this.urlStatus[nodeId].code,
      msg: this.urlStatus[nodeId].msg,
    }));
  }
  getNodeId(url) {
    const parsedUrl = new URL(url);
    const nodeId = parsedUrl.hostname.split(".")[0];
    return nodeId;
  }
}

class DownFile {
  constructor(Http) {
    this.maxConcurrentDownloads = 10; // 最大并发数，限制同时下载的任务数量
    this.maxRetries = 3; // 每个分片的最大重试次数
    this.report = new Report(Http); // 用于记录下载进度等信息
    this.lock = new SimpleLock(); // 简单锁，用于控制任务的顺序和并发
    this.progressCallback = null; // 进度回调函数
    this.urlStats = {}; // 用于追踪每个 URL 的成功和失败次数
    this.mimeType = "application/octet-stream";
    this.hasSuccessfulUrl = true;
  }
  // 模拟计算系统负载的方法
  calculateSystemLoad() {
    // 这里可以根据实际情况计算系统负载，这里用随机数模拟
    return Math.floor(Math.random() * 100); // 返回 0 到 99 的随机数
  }

  // 调整并发下载数量
  adjustConcurrency() {
    const load = this.calculateSystemLoad();
    if (load > 80 && this.maxConcurrentDownloads > 1) {
      this.maxConcurrentDownloads -= 1; // 减少并发下载数
    } else if (load < 50 && this.maxConcurrentDownloads < 20) {
      this.maxConcurrentDownloads += 1; // 增加并发下载数
    }
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  // 初始化 URL 统计
  initializeUrlStats(urls) {
    urls.forEach((url) => {
      this.urlStats[url] = { success: 0, failure: 0 };
    });
  }
  // 返回可用的 URL
  async checkMultipleUrlsAvailability(urls) {
    const availableUrls = [];
    const availabilityPromises = urls.map(async (url) => {
      const isAvailable = await this.checkUrlAvailability(url);
      return isAvailable ? url : null;
    });

    // 使用 Promise.all 等待所有 Promise 完成
    const results = await Promise.all(availabilityPromises);
    // 过滤出可用的 URL
    for (const result of results) {
      if (result) {
        availableUrls.push(result);
      }
    }
    return availableUrls; // 返回可用的 URL 列表
  }

  // 检查 URL 的可用性
  async checkUrlAvailability(url, timeout = 1000) {
    try {
      const response = await Promise.race([
        fetch(url, {
          method: "GET",
          headers: {
            Range: "bytes=0-1",
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        ),
      ]);
      // 检查响应状态码是否在 200 到 206 范围内
      return response.ok && response.status >= 200 && response.status <= 206;
    } catch (error) {
      log("Error checking URL availability:" + error);
      return false;
    }
  }

  // 计算首字节的时间
  async fetchFirstByteFromUrls(urls, onImmediateResponse) {
    const timeoutDuration = 2500; // 超时时间
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration); // 超时取消
  
    // 立即返回一个初始值，可以选择提供占位数据
    const placeholderResult = { url: null, elapsedTime: Infinity };
    if (onImmediateResponse) {
      onImmediateResponse(placeholderResult); // 返回初始占位数据
    }
  
    // 利用Promise.allSettled来确保每个请求都能独立返回结果
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const startTime = performance.now(); // 开始时间
        try {
          const response = await fetch(url, {
            headers: { Range: "bytes=0-1" },
            signal: controller.signal,
          });
  
          clearTimeout(timeoutId); // 清除超时计时器
  
          if (!response.ok) {
            throw new Error(`Failed to fetch first byte, status: ${response.status}`);
          }
  
          const blob = await response.blob();
          const endTime = performance.now();
          const elapsedTime = Math.round(endTime - startTime); // 转为整数（毫秒）
  
          console.log(`Fetched 0-1 byte from ${url} in ${elapsedTime} ms`);
  
          // 每次请求完成后立刻调用回调函数返回时间（整数类型）
          if (onImmediateResponse) {
            onImmediateResponse({ url, elapsedTime });
          }
  
          return { url, elapsedTime };
        } catch (error) {
          const endTime = performance.now();
          const elapsedTime = Math.round(endTime - startTime); // 转为整数（毫秒）
  
          console.error(`Failed to fetch 0-1 byte from ${url}: ${error.message}`);
  
          // 每次请求失败时，也立刻返回时间
          if (onImmediateResponse) {
            onImmediateResponse({ url, elapsedTime });
          }
  
          return { url, elapsedTime };
        }
      })
    );
  
    // 筛选出所有成功的请求，并找到最快的一个
    const successfulResults = results.filter((result) => result.status === 'fulfilled');
    if (successfulResults.length === 0) {
      console.error("All URLs failed.");
      return placeholderResult;
    }
  
    // 找到耗时最短的请求
    const fastestResult = successfulResults.reduce((min, result) =>
      result.value.elapsedTime < min.value.elapsedTime ? result : min
    );
  
    console.log(`Fastest URL: ${fastestResult.value.url}, Time: ${fastestResult.value.elapsedTime} ms`);
  
    return fastestResult.value;
  }
  

  // 根据 URL 的成功率获取最佳下载地址
  getBestUrl() {
    let bestUrl = null;
    let bestSuccessRate = -1;
    for (const [url, { success, failure }] of Object.entries(this.urlStats)) {
      const total = success + failure;
      const successRate = total === 0 ? 0 : success / total;
      if (successRate > bestSuccessRate) {
        bestSuccessRate = successRate;
        bestUrl = url;
      }
    }
    return bestUrl;
  }
  // 下载任务，下载单个分片并进行标记，同时更新进度
  async downloadTask(url, chunk, scheduler) {
    try {
      //log(`Start downloading chunk: ${chunk.start}-${chunk.end} from ${url}`); // 输出开始下载的日志
      const { blob, size } = await this.downloadChunk(
        url,
        chunk.start,
        chunk.end
      ); // 下载分片
      ///大小为0：标识失败了
      if (!blob || size == 0) {
        this.urlStats[url].failure++; // 记录失败下载
        const msg = `Failed to download chunk ${chunk.start}-${
          chunk.end
        } from ${scheduler.getNodeId(
          url
        )}: Blob is missing or the downloaded size is 0.`;
        //scheduler.markChunkFailed(chunk, url, err); // 标记分片失败 (catch 会获取到，此处不需要)
        throw new Error(msg);
      } else {
        scheduler.markChunkCompleted({ start: chunk.start, blob }, url); // 标记分片成功
        scheduler.updateDownloadedSize(size); // 更新已下载的大小
        log(
          `downloadTask:${chunk.start}-${chunk.end}, size: ${size} ->successfully`
        ); // 输出下载成功的日志
        this.urlStats[url].success++; // 记录成功下载
        // 计算下载进度并通过回调函数通知
        if (this.progressCallback) {
          const progress = scheduler.getProgress();
          this.progressCallback(progress);
        }
        return { success: true, chunk }; // 返回成功的结果
      }
    } catch (error) {
      //const msg = `Failed to chunk ${chunk.start}-${chunk.end} from ${scheduler.getNodeId(url)} ${error}`;
      log(`downloadTask:Failed chunk22: ${error}`);
      scheduler.markChunkFailed(chunk, url, error); // 标记分片失败
      this.urlStats[url].failure++; // 记录失败下载
      return { success: false, chunk, error }; // 返回失败的结果
    }
  }

  // 下载单个分片，如果失败则重试，最多重试 maxRetries 次
  async downloadChunk(url, start, end, retries = 0) {
    const timeoutDuration = 5000; // 设置超时时间
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration); // 在超时后中止请求

    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: controller.signal, // 使用 AbortController 的信号
      });

      clearTimeout(timeoutId); // 清除超时计时器

      if (!response.ok) {
        throw new Error(
          `downloadChunk: Failed to download range ${start}-${end}, status: ${response.status}`
        );
      }

      const blob = await response.blob();
      log(`blob: ${start}-${end} - ${blob.size}`);
      this.mimeType = response.headers.get("Content-Type");
      return { blob, size: blob.size };
    } catch (error) {
      clearTimeout(timeoutId); // 确保在错误时也清除超时计时器

      if (error.name === "AbortError") {
        log(
          `downloadChunk: Timeout: Failed to download range ${start}-${end} in ${timeoutDuration} ms`
        );
      } else {
        log(`downloadChunk: Failed: ${start}-${end}`);
      }

      const hasSuccess = Object.values(this.urlStats).some(
        (stat) => stat.success > 0
      );
      const errorMessage = hasSuccess
        ? `downloadChunk: Failed to download range ${start}-${end}.`
        : `downloadChunk: Failed: ${start}-${end}: ${error.message}`;

      return { blob: null, size: 0, error: errorMessage }; // 返回错误信息到上一级
    }
  }

  // 主下载方法，下载文件并进行分片处理
  async downloadFile(
    urls,
    availableNodes,
    traceId,
    assetCid,
    fileName,
    fileSize,
    isOpen
  ) {
    if (!urls || urls.length == 0) {
      return onHandleData({ code: -1, msg: "Download URL does not exist" });
    }
    this.initializeUrlStats(urls); // 初始化 URL 统计
    const chunkSize = Math.min(
      10 * 1024 * 1024,
      Math.ceil(fileSize / (urls.length * 5))
    );
    const scheduler = new DownloadScheduler(urls, chunkSize);
    scheduler.initializeChunks(fileSize);
    // // 检查每个 URL 的可用性
    // const availableUrls = await this.checkMultipleUrlsAvailability(urls);
    /// 计算首字节的的时间
    let fastestTime = 0;
    // 调用 fetchFirstByteFromUrls 函数，并传入一个回调函数处理即时响应
    this.fetchFirstByteFromUrls(urls, (immediateResult) => {
      // 每当一个请求完成时，立即得到响应
      console.log("Immediate result:", immediateResult);
      fastestTime = immediateResult.elapsedTime;
    }).then((finalResult) => {
      // 最终完成时得到最快的请求结果
      console.log("Fastest result:", finalResult);
      fastestTime = finalResult.elapsedTime;
    });

    const availableUrls = urls;

    const uploadResults = [];
    log(
      "init:" +
        chunkSize +
        "..." +
        urls.length +
        "..." +
        "...." +
        scheduler.chunkQueue.length
    );
    if (availableUrls.length === 0) {
      return onHandleData({ code: -1, msg: "No available download nodes" });
    }

    let allCompleted = false;
    // 进行并行下载
    const downloadTasks = []; // 存储当前的下载任务
    const activeUrls = availableUrls.slice(); // 使用可用的 URL 列表
    const startTime = Date.now();
    this.adjustConcurrency();
    const minConcurrentDownloads = 10; // 最少保持的并发任务数
    const runningTasks = new Set(); // 当前正在运行的任务

    if (activeUrls.length === 0) {
      return onHandleData({ code: -1, msg: "No available download nodes" });
    }
    // 启动任务调度
    // （三）
    const scheduleTasks2 = async () => {
      let taskCounter = 0; // 全局任务计数器，用于标记每个任务的唯一 ID

      // 定义一个函数处理任务完成后的逻辑
      const handleTaskCompletion = (
        taskPromise,
        taskId,
        chunk,
        success,
        error
      ) => {
        runningTasks.delete(taskPromise); // 从任务池中移除任务
        // if (success) {
        //   log(
        //     `✅ Task ${taskId} completed successfully for chunk: ${chunk.start}-${chunk.end}`
        //   );
        // } else {
        //   log(
        //     `❌ Task ${taskId} failed for chunk: ${chunk.start}-${chunk.end}. ${error}`
        //   );
        // }
        tryScheduleTask(); // 调度新的任务，保持并发数量
      };
      // 调度任务的核心函数，负责实时检查并添加新任务
      const tryScheduleTask = () => {
        // 当当前运行任务数小于目标并发数，且队列中仍有待处理分片时，添加新任务
        while (
          runningTasks.size < minConcurrentDownloads && // 当前运行任务小于目标并发数
          scheduler.chunkQueue.length > 0 // 队列中仍有未处理的分片
        ) {
          const chunk = scheduler.getNextChunk(); // 从队列中获取下一个分片
          const url = activeUrls[Math.floor(Math.random() * activeUrls.length)]; // 随机选择一个下载 URL
          const taskId = ++taskCounter; // 为任务分配一个唯一 ID
          //log(`Task ${taskId} started for chunk: ${chunk.start}-${chunk.end}`); // 打印任务启动日志
          // 创建下载任务，并处理任务完成后的逻辑
          const taskPromise = this.downloadTask(url, chunk, scheduler)
            .then((res) => {
              // 成功处理：根据服务端返回决定是否成功
              handleTaskCompletion(taskPromise, taskId, chunk, res.success);
            })
            .catch((error) => {
              // 异常处理：统一标记任务失败
              handleTaskCompletion(taskPromise, taskId, chunk, false, error);
            });
          // 将新任务添加到任务池中进行跟踪
          runningTasks.add(taskPromise);
        }
      };
      // 初始化任务调度，首次启动任务填满并发池
      tryScheduleTask();
      // 等待所有任务完成
      // await Promise.all(runningTasks); // 确保所有任务完成后，调度函数退出
      // log("All tasks completed."); // 打印所有任务完成的日志
      // 调度任务，填满并发池
      //tryScheduleTask();
      // 持续检查任务是否全部完成
      while (runningTasks.size > 0 || scheduler.chunkQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 每 100ms 检查一次
        tryScheduleTask(); // 调度新的任务
      }

      log("All tasks completed."); // 打印所有任务完成的日志
    };
    // （二）
    const scheduleTasks = async () => {
      let taskCounter = 0; // 全局任务计数器，用于标记任务的唯一 ID

      // 调度器主循环：持续运行，直到分片队列和任务池都为空
      while (scheduler.chunkQueue.length > 0 || runningTasks.size > 0) {
        // 内部循环：确保任务池中至少有 minConcurrentDownloads 个任务
        while (
          runningTasks.size < minConcurrentDownloads && // 当前运行任务少于最小并发数
          scheduler.chunkQueue.length > 0 // 还有未下载的分片
        ) {
          // 从分片队列中获取下一个任务分片
          const chunk = scheduler.getNextChunk();
          // 随机从可用的 URL 中选择一个作为下载目标
          const url = activeUrls[Math.floor(Math.random() * activeUrls.length)];
          const taskId = ++taskCounter; // 给任务分配一个唯一 ID
          // 创建下载任务，并处理其成功或失败后的逻辑
          const taskPromise = this.downloadTask(url, chunk, scheduler)
            .then(() => {
              // 下载成功后，从任务池中移除该任务
              runningTasks.delete(taskPromise);
            })
            .catch((error) => {
              // 下载失败：记录失败的分片，并从任务池中移除该任务
              runningTasks.delete(taskPromise);
            });
          // 将任务添加到任务池中进行跟踪
          runningTasks.add(taskPromise);
        }

        // 如果任务池中已有足够多的任务，等待其中任意一个完成
        if (runningTasks.size >= minConcurrentDownloads) {
          await Promise.race(runningTasks);
        }

        // 使用短暂的延迟释放主线程，避免阻塞 UI 或事件循环
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    await scheduleTasks2();
    // （一）
    // while (scheduler.chunkQueue.length > 0) {
    //   log("downloadFile...........");
    //   const downloadTasks = [];
    //   // 启动并发的下载任务，直到达到 maxConcurrentDownloads 或没有分片
    //   while (
    //     scheduler.chunkQueue.length > 0 &&
    //     downloadTasks.length < this.maxConcurrentDownloads
    //   ) {
    //     const chunk = scheduler.getNextChunk(); // 获取下一个分片
    //     const url = activeUrls[Math.floor(Math.random() * activeUrls.length)]; // 随机选择一个 URL
    //     downloadTasks.push(this.downloadTask(url, chunk, scheduler)); // 启动下载任务
    //   }
    //   // 等待当前批次的所有下载任务完成
    //   try {
    //     var res = await Promise.all(downloadTasks);
    //     log("downloadTasks:", { res });
    //   } catch (error) {
    //     // 捕获错误并记录失败的分片
    //     log("Some download tasks failed.");
    //   }
    // }

    log(
      "down:",
      scheduler.hasFailedChunks() +
        ":" +
        scheduler.allChunksCompleted() +
        "-" +
        scheduler.failedChunks.length
    );

    //（一）
    const maxRetries = availableUrls.length;
    while (scheduler.hasFailedChunks()) {
      log("failedChunks:", scheduler.failedChunks);
      for (const failedChunk of [...scheduler.failedChunks]) {
        // 获取最优URL用于重试
        const urlToRetry = this.getBestUrl();
        if (!urlToRetry) {
          return onHandleData({
            code: -1,
            msg: `All available URLs failed to download ${failedChunk.start}-${failedChunk.end} cannot be retried`,
          });
        }
        // 初始化重试次数
        if (!failedChunk.retries) {
          failedChunk.retries = 0;
        }
        log("retries:" + failedChunk.retries);
        // 检查重试次数是否超过限制 最大可用地址的次数
        if (failedChunk.retries >= availableUrls.length) {
          const msg = `Max retries reached for chunk ${failedChunk.start}-${failedChunk.end}`;
          scheduler.markChunkFailed(failedChunk, urlToRetry, msg); // 标记分片失败的msg
          continue; // 跳过已超过最大重试次数的分片
        }
        try {
          const { blob } = await this.downloadChunk(
            urlToRetry,
            failedChunk.start,
            failedChunk.end
          );
          log(`Retry:`, { failedChunk, blob, urlToRetry });

          if (blob && blob.size > 0) {
            // 成功下载后从失败列表中移除分片
            scheduler.failedChunks = scheduler.failedChunks.filter(
              (chunk) => chunk.start !== failedChunk.start
            );
            this.urlStats[urlToRetry].success++; // 记录失败下载
            scheduler.updateDownloadedSize(blob.size); // 更新已下载的大小
            // 计算下载进度并通过回调函数通知
            if (this.progressCallback) {
              const progress = scheduler.getProgress();
              this.progressCallback(progress);
            }

            log("Retry:failedChunks:" + scheduler.failedChunks);
            scheduler.markChunkCompleted(
              { start: failedChunk.start, blob },
              urlToRetry
            );
          } else {
            failedChunk.retries++;
            this.urlStats[urlToRetry].failure++; // 记录失败下载
            log(`Retry:failedChunks failed:` + scheduler.failedChunks);
          }
        } catch (error) {
          // 增加重试次数
          failedChunk.retries++;
          log(
            `Failed to re-download chunk ${failedChunk.start}-${failedChunk.end}-${error}`
          );
        }
      }
      // 如果所有分片都已重试到最大次数，则退出
      if (
        scheduler.failedChunks.every(
          (chunk) => chunk.retries >= availableUrls.length
        )
      ) {
        log("All failed chunks have reached max retries.");
        break;
      }
    }
    // 检查是否所有分片已成功下载
    allCompleted = scheduler.allChunksCompleted();
    downloadTasks.length = 0; // 清空当前任务列表

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;
    const transferRate = Math.floor((fileSize / elapsedTime) * 1000);
    // 所有分片下载完成后，合并文件
    const finalBlob = this.mergeChunks(
      scheduler.completedChunks,
      this.mimeType
    );
    console.log("size:", finalBlob.size + "----" + fileSize);

    const statusCode = allCompleted ? 1 : 2;
    const statusMsg = allCompleted ? "successful" : "failed";
    const elapsedTimeValue = allCompleted ? elapsedTime : 0;
    const transferRateValue = allCompleted ? transferRate : 0;

    scheduler.getUrlStatus().forEach((item) => {
      uploadResults.push({
        status: statusCode,
        msg: statusMsg,
        elapsedTime: elapsedTimeValue,
        transferRate: transferRateValue,
        size: fileSize,
        traceId: traceId,
        nodeId: item.nodeId,
        cId: assetCid,
        log: allCompleted ? "" : { [item.nodeId]: item.msg },
        urlSize: availableUrls.length,
        availableNodes: availableNodes,
        fastestTime: fastestTime,
      });
    });

    this.report.creatReportData(uploadResults, "download");
    if (!allCompleted) {
      return onHandleData({
        code: -1,
        msg: "Failed to download chunk",
      });
    } else {
      this.saveFile(finalBlob, fileName, isOpen); // Save the downloaded file
      return onHandleData({
        code: 0,
        msg: "File downloaded successfully",
      });
    }
  }

  //合并所有下载成功的分片
  mergeChunks(chunks, mimeType) {
    const sortedChunks = chunks.sort((a, b) => a.start - b.start);
    console.log("chunks=", sortedChunks);

    const mergedBlob = new Blob(
      sortedChunks.map((chunk) => chunk.blob),
      { type: mimeType }
    );
    return mergedBlob;
  }

  // 保存下载的文件
  saveFile(blob, fileName, isOpen) {
    console.log("saveFile=", fileName);
    const url = URL.createObjectURL(blob); // 创建 URL 对象
    const a = document.createElement("a"); // 创建下载链接
    a.href = url; // 设置链接地址
    a.download = fileName; // 设置文件名
    document.body.appendChild(a); // 将链接添加到文档
    a.click(); // 触发下载
    document.body.removeChild(a); // 下载后移除链接
    // 打开文件
    if (isOpen) {
      window.open(url); // 在新窗口中打开文件
    }
    setTimeout(() => {
      URL.revokeObjectURL(url); // 释放 URL 对象
    }, 1000);
  }
}

export default DownFile;
