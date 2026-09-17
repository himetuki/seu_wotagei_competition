/**
 * Express 兼容出口 — 供 music-routes.js 等子路由文件单行替换：
 *   require("express")            → require("../http/express-compat") 的 { Router }
 *   const router = Router()       （原 express.Router()，用法不变：router.get/post，S3/S7）
 */
const { YRouter } = require("./router");

module.exports = {
  Router: function Router() {
    return new YRouter("root");
  },
};
