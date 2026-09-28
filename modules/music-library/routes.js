/**
 * 音乐文件路由模块（P13 自 server/routes/music-routes.js 迁入 music-library 功能件）
 * 处理音乐文件的上传、扫描和管理。
 * 形态改造：Express Router（app.use("/api", router)）→ 平铺 registerMusicRoutes(app)，
 * 各端点路径补 /api 前缀（行为与迁移前逐字节一致，endpoint-diff 35/35 验收）。
 */
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { serverLog, safeBasename, safeJoin } = require("../../server/utils");
const musicScanner = require("./scanner");

/**
 * 注册全部音乐路由（原 app.use("/api", router) 的平铺等价形态）
 * @param {object} app y-router app（(req,res,next) 风格与 Express 一致）
 */
function registerMusicRoutes(app) {
// 获取音乐文件数量
app.get("/api/music_count", (req, res) => {
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
app.post("/api/check_music_files", (req, res) => {
  try {
    const { group, files } = req.body;

    if (!group || !files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: "参数错误",
      });
    }

    const config = musicScanner.findConfigByGroup(group);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `未找到组别: ${group}`,
      });
    }

    const dir = musicScanner.resolveMusicDir(config.dir);
    const existingFiles = [];

    for (const file of files) {
      // file.name 来自请求体：先验类型，再只接受纯文件名并经 safeJoin 锚定
      // （与 move_to_recycle 同款防护），防其探测音乐目录之外的任意路径存在性
      if (!file || typeof file !== "object" || typeof file.name !== "string") {
        return res.status(400).json({
          success: false,
          error: "参数错误：files 数组的每项须为含 name 字符串的对象",
        });
      }
      const safeName = safeBasename(file.name);
      if (!safeName) {
        return res.status(400).json({
          success: false,
          error: "非法文件名",
        });
      }
      if (fs.existsSync(safeJoin(dir, safeName))) {
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
app.post("/api/upload_music", (req, res) => {
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
            const config = musicScanner.findConfigByGroup(uploadGroup);

            if (!config) {
              return cb(new Error(`未找到组别: ${uploadGroup}`));
            }

            const uploadDir = musicScanner.resolveMusicDir(config.dir);

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

      // 扩展名白名单为硬性门槛（MIME 客户端可伪造，仅作日志参考）：
      // 曾为「两者任一通过即收」，伪造 audio/* MIME 可把任意内容以 .html 等扩展名
      // 写入 resource/musics/，经静态层按扩展名以 text/html 服务 → 存储型 XSS
      if (!isValidExt) {
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

// 测试上传参数与表单解析的调试端点（test_upload_params / test_form_data /
// test_audio_upload）已移除：会回显任意请求头/请求体并向磁盘写临时文件，
// 属迁移前遗留的调试面；正常上传链路由 upload_music / check_music_files 承担。

// 检查上传组件状态
app.get("/api/upload_status", (req, res) => {
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
app.post("/api/update_music_list", (req, res) => {
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
app.post("/api/scan_all_music", (req, res) => {
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
app.get("/api/music_files", (req, res) => {
  try {
    const group = req.query.group;
    if (!group) {
      return res.status(400).json({
        success: false,
        error: "缺少group参数",
      });
    }

    const config = musicScanner.findConfigByGroup(group);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `未找到组别: ${group}`,
      });
    }

    const dir = musicScanner.resolveMusicDir(config.dir);
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
app.post("/api/move_to_recycle", (req, res) => {
  try {
    const { group, filename } = req.body;

    if (!group || !filename) {
      return res.status(400).json({
        success: false,
        error: "缺少必要参数",
      });
    }

    // 只接受纯文件名：filename 来自请求体，含目录成分（../ 等）一律拒绝，
    // 防其逃逸出音乐目录读写任意文件
    const safeName = safeBasename(filename);
    if (!safeName) {
      return res.status(400).json({
        success: false,
        error: "非法文件名",
      });
    }

    const config = musicScanner.findConfigByGroup(group);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `未找到组别: ${group}`,
      });
    }

    // 源文件路径（safeName 已剥离目录成分，safeJoin 再断言未越出该音乐目录）
    const musicDir = musicScanner.resolveMusicDir(config.dir);
    const sourcePath = safeJoin(musicDir, safeName);

    // 检查源文件是否存在
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({
        success: false,
        error: `文件不存在: ${safeName}`,
      });
    }

    // 确保回收文件夹存在
    const recycleDir = safeJoin(
      musicScanner.resolveMusicDir(path.join("resource", "musics", "musics_free"))
    );
    if (!fs.existsSync(recycleDir)) {
      fs.mkdirSync(recycleDir, { recursive: true });
    }

    // 目标文件路径 (添加时间戳避免重名)
    const timestamp = new Date().getTime();
    const targetPath = safeJoin(recycleDir, `${timestamp}_${safeName}`);

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
}

module.exports = { registerMusicRoutes };
