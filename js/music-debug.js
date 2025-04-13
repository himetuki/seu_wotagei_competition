/**
 * 音乐播放调试助手
 * 用于检查音乐文件可用性和路径问题
 */

// 检查音乐文件路径
function checkMusicPath(filename) {
  const possiblePaths = [
    `../resource/music/${filename}`,
    `../resource/musics/${filename}`,
    `/resource/music/${filename}`,
    `/resource/musics/${filename}`,
    `./resource/musics/1yearminus/${filename}`,
    `./resource/music/1yearminus/${filename}`,
    `./resource/musics/1yearplus/${filename}`,
    `./resource/music/1yearplus/${filename}`,
    `./resource/musics/1yearplus_ex/${filename}`,
    `./resource/music/1yearplus_ex/${filename}`,
  ];

  console.log("正在检查音乐文件路径...");

  Promise.all(
    possiblePaths.map((path) => {
      return fetch(path, { method: "HEAD" })
        .then((response) => {
          return {
            path: path,
            status: response.status,
            ok: response.ok,
          };
        })
        .catch((error) => {
          return {
            path: path,
            error: error.message,
            ok: false,
          };
        });
    })
  ).then((results) => {
    console.table(results);

    // 查找可用路径
    const validPath = results.find((r) => r.ok);
    if (validPath) {
      console.log("找到有效路径:", validPath.path);
      return validPath.path;
    } else {
      console.error("未找到可用路径");
      return null;
    }
  });
}

// 扫描音乐列表及文件可用性
function scanMusicFiles() {
  fetch("../resource/json/musics_list-2.json")
    .then((response) => response.json())
    .then((musicList) => {
      console.log("音乐列表中有 " + musicList.length + " 首音乐");

      // 随机选取5首检查可用性
      const samplesToCheck = 5;
      const samples = [];

      for (let i = 0; i < Math.min(samplesToCheck, musicList.length); i++) {
        const randomIndex = Math.floor(Math.random() * musicList.length);
        samples.push(musicList[randomIndex]);
      }

      console.log("将检查以下音乐文件:");
      console.log(samples);

      // 检查每个文件
      samples.forEach(checkMusicPath);
    })
    .catch((error) => {
      console.error("无法加载音乐列表:", error);
    });
}

// 在控制台运行此函数扫描音乐文件
// scanMusicFiles();
