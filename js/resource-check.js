/**
 * 资源检查工具
 * 用于检查各种资源是否可以正确加载
 */

// 检查音乐文件是否可访问
function checkMusicFile(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((response) => {
        if (response.ok) {
          resolve({
            status: response.status,
            url: url,
            success: true,
          });
        } else {
          resolve({
            status: response.status,
            url: url,
            success: false,
          });
        }
      })
      .catch((error) => {
        resolve({
          error: error.message,
          url: url,
          success: false,
        });
      });
  });
}

// 检查JSON文件是否可访问并格式正确
function checkJsonFile(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        resolve({
          url: url,
          success: true,
          data: data,
          count: Array.isArray(data) ? data.length : "not an array",
        });
      })
      .catch((error) => {
        resolve({
          error: error.message,
          url: url,
          success: false,
        });
      });
  });
}

// 测试所有资源
async function testResources() {
  console.log("开始检查资源...");

  // 检查音乐列表
  const musicListResult = await checkJsonFile(
    "../resource/json/musics_list_ex.json"
  );
  console.log("音乐列表检查结果:", musicListResult);

  // 如果音乐列表加载成功，随机检查几个音乐文件
  if (musicListResult.success && Array.isArray(musicListResult.data)) {
    const sampleSize = Math.min(3, musicListResult.data.length);
    const samples = [];

    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(
        Math.random() * musicListResult.data.length
      );
      const musicItem = musicListResult.data[randomIndex];
      samples.push(musicItem);

      if (musicItem.url) {
        const musicFileResult = await checkMusicFile(
          `../resource/music/${musicItem.url}`
        );
        console.log(`音乐文件 ${musicItem.name} 检查结果:`, musicFileResult);
      }
    }
  }

  // 检查选手列表
  const playerListResult = await checkJsonFile("../resource/json/player2.json");
  console.log("选手列表检查结果:", playerListResult);

  // 检查技名列表
  const tricksListResult = await checkJsonFile("../resource/json/tricks.json");
  console.log("技名列表检查结果:", tricksListResult);

  console.log("资源检查完成");
}

// 在控制台运行以下代码可以测试资源:
// testResources();
