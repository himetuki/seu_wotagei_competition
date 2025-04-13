/**
 * 音乐文件路由模块
 * 处理音乐文件的上传、扫描和管理
 */
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { serverLog } = require("../utils");
const musicScanner = require("../music-scanner");

// 设置上传的存储选项
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      // 注意：在multer的此回调中，无法访问req.body中的数据
      // 尝试从查询参数获取组别
      const group = req.query.group;

      if (!group) {
        serverLog("无法从req.query获取group参数", "error");
        return cb(new Error("无法确定上传目标组别"));
      }

      serverLog(`从URL查询参数获取到组别: ${group}`, "info");

      // 根据组别选择对应的目录
      const config = musicScanner.MUSIC_DIRS.find((c) => c.dir.includes(group));

      if (!config) {
        return cb(new Error(`未找到组别: ${group}`));
      }

      const uploadDir = path.join(process.cwd(), config.dir);

      // 确保目录存在
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        serverLog(`已创建上传目录: ${uploadDir}`, "info");
      }

      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    // 保留原始文件名
    cb(null, file.originalname);
  },
});

// 禁用multer的文件类型检测，改为自己在请求处理中检测
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: function (req, file, cb) {
    // 完全放行所有文件，我们将在接收后再验证
    serverLog(
      `接收文件上传请求: ${file.originalname}, mimetype: ${file.mimetype}`,
      "info"
    );
    return cb(null, true);
  },
});

// 获取音乐文件数量
router.get("/music_count", (req, res) => {
  try {
    const group = req.query.group;
    if (!group) {
      return res.status(400).json({
        success: false,
        error: "缺少group参数",
      });
    }

    const result = musicScanner.getMusicCount(group);
    res.json({ count: result.count, success: result.success });
  } catch (error) {
    serverLog(`获取音乐数量失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`,
    });
  }
});

// 检查音乐文件是否存在
router.post("/check_music_files", (req, res) => {
  try {
    const { group, files } = req.body;

    if (!group || !files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: "参数错误",
      });
    }

    const config = musicScanner.MUSIC_DIRS.find((c) => c.dir.includes(group));

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `未找到组别: ${group}`,
      });
    }

    const dir = path.join(process.cwd(), config.dir);
    const existingFiles = [];

    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (fs.existsSync(filePath)) {
        existingFiles.push(file.name);
      }
    }

    res.json({
      success: true,
      existingFiles,
    });
  } catch (error) {
    serverLog(`检查音乐文件失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`,
    });
  }
});

// 上传音乐文件
router.post("/upload_music", (req, res) => {
  try {
    // 添加详细日志用于调试
    serverLog(
      `接收到上传请求，headers: ${JSON.stringify(req.headers)}`,
      "info"
    );

    // 从URL查询参数获取组别
    const group = req.query.group;

    if (!group) {
      serverLog("URL参数中无组别参数", "error");
      return res.status(400).json({
        success: false,
        error: "请在URL查询参数中提供group参数",
      });
    }

    serverLog(`从URL参数获取组别: ${group}`, "info");

    // 修改multer配置中的目标目录设置方式
    const uploadHandler = multer({
      storage: multer.diskStorage({
        destination: function (req, file, cb) {
          try {
            // 使用查询参数中的组别
            const uploadGroup = req.query.group;

            if (!uploadGroup) {
              return cb(new Error("无法确定上传目标组别"));
            }

            // 根据组别选择对应的目录
            const config = musicScanner.MUSIC_DIRS.find((c) =>
              c.dir.includes(uploadGroup)
            );

            if (!config) {
              return cb(new Error(`未找到组别: ${uploadGroup}`));
            }

            const uploadDir = path.join(process.cwd(), config.dir);

            // 确保目录存在
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
              serverLog(`已创建上传目录: ${uploadDir}`, "info");
            }

            cb(null, uploadDir);
          } catch (error) {
            cb(error);
          }
        },
        filename: function (req, file, cb) {
          // 保留原始文件名
          cb(null, file.originalname);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
      fileFilter: function (req, file, cb) {
        // 完全放行所有文件，我们将在接收后再验证
        serverLog(
          `接收文件上传请求: ${file.originalname}, mimetype: ${file.mimetype}`,
          "info"
        );
        return cb(null, true);
      },
    }).single("file");

    // 使用临时配置的multer处理请求
    uploadHandler(req, res, function (err) {
      if (err) {
        // 记录详细的multer错误信息
        const errorMessage = err.message || "未知错误";
        serverLog(`Multer错误: ${errorMessage}`, "error");

        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            error: "文件大小超过限制(50MB)",
          });
        } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            error: "意外的文件字段名称，请使用'file'作为字段名",
          });
        } else {
          return res.status(400).json({
            success: false,
            error: `上传失败: ${errorMessage}`,
          });
        }
      }

      // 检查是否收到文件
      if (!req.file) {
        serverLog("没有收到文件数据", "error");
        return res.status(400).json({
          success: false,
          error: "没有收到文件，请确保表单中包含file字段",
        });
      }

      // 手动检查文件类型
      const filename = req.file.originalname;
      const filepath = req.file.path;
      const mimetype = req.file.mimetype;

      serverLog(
        `接收到文件: ${filename}, 类型: ${mimetype}, 路径: ${filepath}`,
        "info"
      );

      // 用更宽松的方式检查扩展名
      const ext = path.extname(filename).toLowerCase();
      const validExts = [".mp3", ".wav", ".flac", ".ogg"];
      const isValidExt = validExts.some((validExt) => ext.endsWith(validExt));

      // 用更宽松的方式检查MIME类型
      const validMimePattern = /audio\/(mpeg|mp3|wav|wave|flac|ogg|x-flac)/i;
      const isValidMime = validMimePattern.test(mimetype);

      serverLog(
        `文件类型检测: 扩展名=${isValidExt}, MIME=${isValidMime}, ext=${ext}`,
        "info"
      );

      // 如果两者都不符合，则拒绝
      if (!isValidExt && !isValidMime) {
        // 删除已上传的文件
        try {
          fs.unlinkSync(filepath);
          serverLog(`已删除无效文件: ${filepath}`, "info");
        } catch (unlinkErr) {
          serverLog(`删除无效文件失败: ${unlinkErr.message}`, "error");
        }

        return res.status(400).json({
          success: false,
          error: `不支持的文件格式: ${ext}, MIME: ${mimetype}，只支持mp3、wav、flac、ogg格式`,
        });
      }

      try {
        serverLog(
          `文件上传成功: ${req.file.originalname}, 组别: ${group}`,
          "info"
        );

        // 上传成功后，重新扫描该目录，更新JSON
        const scanResult = musicScanner.scanMusicDir(group);

        res.json({
          success: true,
          file: req.file.originalname,
          message: "文件上传成功",
          scanResult,
        });
      } catch (scanError) {
        serverLog(`扫描目录失败: ${scanError.message}`, "error");
        res.status(500).json({
          success: false,
          error: `文件已上传，但扫描失败: ${scanError.message}`,
        });
      }
    });
  } catch (error) {
    serverLog(`上传处理器错误: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `上传处理失败: ${error.message}`,
    });
  }
});

// 测试上传参数 (用于调试表单提交问题)
router.post("/test_upload_params", (req, res) => {
  try {
    // 记录所有请求信息以便调试
    serverLog(
      `测试上传参数 - Content-Type: ${req.headers["content-type"]}`,
      "info"
    );
    serverLog(`测试上传参数 - Body: ${JSON.stringify(req.body)}`, "info");

    res.json({
      success: true,
      message: "参数测试成功",
      receivedParams: {
        contentType: req.headers["content-type"],
        bodyParams: req.body,
        hasGroup: req.body && req.body.group ? true : false,
        groupValue: req.body ? req.body.group : undefined,
      },
    });
  } catch (error) {
    serverLog(`测试上传参数失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `测试失败: ${error.message}`,
    });
  }
});

// 测试表单数据解析
router.post("/test_form_data", upload.none(), (req, res) => {
  try {
    serverLog("测试表单数据 - 收到请求", "info");
    serverLog(`请求头: ${JSON.stringify(req.headers)}`, "info");
    serverLog(`请求体: ${JSON.stringify(req.body)}`, "info");

    // 检查multer是否正确解析了表单数据
    const hasGroup = req.body && req.body.group;

    res.json({
      success: true,
      message: "表单数据测试",
      requestHeaders: req.headers,
      requestBody: req.body,
      hasGroup: hasGroup,
    });
  } catch (error) {
    serverLog(`测试表单数据失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `测试失败: ${error.message}`,
    });
  }
});

// 检查上传组件状态
router.get("/upload_status", (req, res) => {
  try {
    // 检查multer是否可用
    const multerAvailable = typeof multer === "function";

    res.json({
      success: true,
      uploaderReady: multerAvailable,
      version: multerAvailable
        ? require("multer/package.json").version
        : "not installed",
    });
  } catch (error) {
    serverLog(`检查上传状态失败: ${error.message}`, "error");
    res.json({
      success: false,
      uploaderReady: false,
      error: error.message,
    });
  }
});

// 更新音乐列表JSON
router.post("/update_music_list", (req, res) => {
  try {
    const { group } = req.body;

    if (!group) {
      return res.status(400).json({
        success: false,
        error: "缺少group参数",
      });
    }

    const result = musicScanner.scanMusicDir(group);
    res.json({
      success: result.success,
      count: result.count,
      message: result.success ? "音乐列表已更新" : "更新失败",
      ...result,
    });
  } catch (error) {
    serverLog(`更新音乐列表失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `更新失败: ${error.message}`,
    });
  }
});

// 扫描所有音乐目录
router.post("/scan_all_music", (req, res) => {
  try {
    const results = musicScanner.scanAllMusicDirs();
    res.json({
      success: true,
      results,
    });
  } catch (error) {
    serverLog(`扫描所有音乐目录失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `扫描失败: ${error.message}`,
    });
  }
});

// 获取指定组别的所有音乐文件
router.get("/music_files", (req, res) => {
  try {
    const group = req.query.group;
    if (!group) {
      return res.status(400).json({
        success: false,
        error: "缺少group参数",
      });
    }

    const config = musicScanner.MUSIC_DIRS.find((c) => c.dir.includes(group));

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `未找到组别: ${group}`,
      });
    }

    const dir = path.join(process.cwd(), config.dir);
    let files = [];

    // 确保目录存在
    if (fs.existsSync(dir)) {
      files = fs
        .readdirSync(dir)
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return [".mp3", ".wav", ".flac", ".ogg"].includes(ext);
        })
        .map((file) => ({
          name: file,
          path: path.join(config.dir, file),
        }));
    }

    res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error) {
    serverLog(`获取音乐文件列表失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`,
    });
  }
});

// 移动音乐文件到回收文件夹
router.post("/move_to_recycle", (req, res) => {
  try {
    const { group, filename } = req.body;

    if (!group || !filename) {
      return res.status(400).json({
        success: false,
        error: "缺少必要参数",
      });
    }

    const config = musicScanner.MUSIC_DIRS.find((c) => c.dir.includes(group));

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `未找到组别: ${group}`,
      });
    }

    // 源文件路径
    const sourcePath = path.join(process.cwd(), config.dir, filename);

    // 检查源文件是否存在
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({
        success: false,
        error: `文件不存在: ${filename}`,
      });
    }

    // 确保回收文件夹存在
    const recycleDir = path.join(
      process.cwd(),
      "resource",
      "musics",
      "musics_free"
    );
    if (!fs.existsSync(recycleDir)) {
      fs.mkdirSync(recycleDir, { recursive: true });
    }

    // 目标文件路径 (添加时间戳避免重名)
    const timestamp = new Date().getTime();
    const targetPath = path.join(recycleDir, `${timestamp}_${filename}`);

    // 移动文件 (先复制后删除)
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);

    // 更新JSON文件
    const result = musicScanner.scanMusicDir(group);
    res.json({
      success: true,
      message: `文件 ${filename} 已移动到回收文件夹`,
      scanResult: result,
    });
  } catch (error) {
    serverLog(`移动音乐文件失败: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: `服务器错误: ${error.message}`,
    });
  }
});

// 添加测试音频文件上传端点
router.post("/test_audio_upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "没有接收到文件",
      });
    }

    // 记录文件信息
    const fileInfo = {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      extension: path.extname(req.file.originalname).toLowerCase(),
    };

    serverLog(`测试上传接收到文件: ${JSON.stringify(fileInfo)}`, "info");

    // 返回文件信息
    res.json({
      success: true,
      message: "文件接收成功（仅用于测试）",
      fileInfo,
      body: req.body,
    });

    // 删除测试上传的文件
    try {
      fs.unlinkSync(req.file.path);
      serverLog(`已删除测试上传文件: ${req.file.path}`, "info");
    } catch (unlinkErr) {
      serverLog(`删除测试上传文件失败: ${unlinkErr.message}`, "warn");
    }
  } catch (error) {
    serverLog(`测试上传端点错误: ${error.message}`, "error");
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
