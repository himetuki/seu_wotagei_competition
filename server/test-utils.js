/**
 * 终端测试工具模块
 * 用于在终端中测试数据库操作
 */
const { serverLog } = require("./utils");

// 测试数据库名
const TEST_DB_NAME = "cli_test_database";

// 格式化输出结果
function formatResult(success, operation, details = {}) {
  return {
    time: new Date().toISOString(),
    success,
    operation,
    ...details,
  };
}

// 测试读取数据库
async function testRead(dbManager) {
  try {
    // 初始化测试数据库（如果不存在）
    const db = dbManager.init(TEST_DB_NAME, {
      timestamp: new Date().toISOString(),
      message: "这是一个命令行测试数据库",
      items: [],
    });

    // 读取数据库内容
    const data = db.getState();

    serverLog(`[测试] 读取数据库成功: ${TEST_DB_NAME}`);
    return formatResult(true, "read", { data });
  } catch (error) {
    serverLog(`[测试] 读取数据库失败: ${error.message}`, "error");
    return formatResult(false, "read", { error: error.message });
  }
}

// 测试写入数据库
async function testWrite(dbManager, content = null) {
  try {
    const db = dbManager.get(TEST_DB_NAME);
    const testItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      content:
        content || `测试数据 ${Math.random().toString(36).substring(2, 8)}`,
    };

    // 添加一条测试数据
    db.get("items").push(testItem).write();

    serverLog(`[测试] 写入数据库成功: ${JSON.stringify(testItem)}`);
    return formatResult(true, "write", {
      item: testItem,
      data: db.getState(),
    });
  } catch (error) {
    serverLog(`[测试] 写入数据库失败: ${error.message}`, "error");
    return formatResult(false, "write", { error: error.message });
  }
}

// 测试删除数据
async function testDelete(dbManager, id) {
  try {
    const db = dbManager.get(TEST_DB_NAME);

    // 如果没有提供ID，获取最后一条记录的ID
    if (!id) {
      const items = db.get("items").value();
      if (items.length === 0) {
        return formatResult(false, "delete", { error: "没有可删除的记录" });
      }
      id = items[items.length - 1].id;
    }

    // 查找项目
    const items = db.get("items").value();
    const itemExists = items.some((item) => item.id === id);

    if (!itemExists) {
      return formatResult(false, "delete", { error: `ID为${id}的项目不存在` });
    }

    // 删除指定ID的项目
    db.get("items").remove({ id: id }).write();

    serverLog(`[测试] 删除数据成功: 项目ID ${id}`);
    return formatResult(true, "delete", {
      deletedId: id,
      data: db.getState(),
    });
  } catch (error) {
    serverLog(`[测试] 删除数据失败: ${error.message}`, "error");
    return formatResult(false, "delete", { error: error.message });
  }
}

// 重置测试数据库
async function resetTestDB(dbManager) {
  try {
    const db = dbManager.get(TEST_DB_NAME);

    // 重置数据库到初始状态
    db.setState({
      timestamp: new Date().toISOString(),
      message: "测试数据库已重置",
      items: [],
    }).write();

    serverLog(`[测试] 数据库已重置: ${TEST_DB_NAME}`);
    return formatResult(true, "reset", { data: db.getState() });
  } catch (error) {
    serverLog(`[测试] 重置数据库失败: ${error.message}`, "error");
    return formatResult(false, "reset", { error: error.message });
  }
}

// 运行所有测试
async function runAllTests(dbManager) {
  serverLog("开始运行数据库操作测试...", "info");

  console.log("\n========== 数据库测试开始 ==========");

  // 重置测试环境
  const resetResult = await resetTestDB(dbManager);
  console.log(`[重置测试数据库] ${resetResult.success ? "成功" : "失败"}`);

  // 测试读取
  const readResult = await testRead(dbManager);
  console.log(`[读取测试] ${readResult.success ? "成功" : "失败"}`);

  // 测试写入
  const writeResult = await testWrite(dbManager, "测试写入内容");
  console.log(
    `[写入测试] ${writeResult.success ? "成功" : "失败"} - ID: ${
      writeResult.success ? writeResult.item.id : "N/A"
    }`
  );

  // 测试再次写入
  const writeResult2 = await testWrite(dbManager, "第二次测试写入");
  console.log(
    `[第二次写入测试] ${writeResult2.success ? "成功" : "失败"} - ID: ${
      writeResult2.success ? writeResult2.item.id : "N/A"
    }`
  );

  // 测试删除
  let deleteResult;
  if (writeResult.success) {
    deleteResult = await testDelete(dbManager, writeResult.item.id);
    console.log(
      `[删除测试] ${deleteResult.success ? "成功" : "失败"} - 已删除ID: ${
        writeResult.item.id
      }`
    );
  } else {
    console.log(`[删除测试] 跳过 - 因为写入测试失败`);
  }

  // 最终清理
  const finalReset = await resetTestDB(dbManager);
  console.log(`[最终清理] ${finalReset.success ? "成功" : "失败"}`);

  console.log("\n测试结果摘要:");
  console.log(`- 重置: ${resetResult.success ? "通过" : "失败"}`);
  console.log(`- 读取: ${readResult.success ? "通过" : "失败"}`);
  console.log(`- 写入: ${writeResult.success ? "通过" : "失败"}`);
  console.log(`- 第二次写入: ${writeResult2.success ? "通过" : "失败"}`);
  console.log(
    `- 删除: ${
      deleteResult ? (deleteResult.success ? "通过" : "失败") : "跳过"
    }`
  );
  console.log(`- 最终清理: ${finalReset.success ? "通过" : "失败"}`);

  const allPassed =
    resetResult.success &&
    readResult.success &&
    writeResult.success &&
    writeResult2.success &&
    (deleteResult ? deleteResult.success : true) &&
    finalReset.success;

  console.log(`\n整体测试结果: ${allPassed ? "全部通过 ✓" : "存在失败项 ✗"}`);
  console.log("========== 数据库测试结束 ==========\n");

  return {
    allPassed,
    resetResult,
    readResult,
    writeResult,
    writeResult2,
    deleteResult,
    finalReset,
  };
}

module.exports = {
  testRead,
  testWrite,
  testDelete,
  resetTestDB,
  runAllTests,
  TEST_DB_NAME,
};
