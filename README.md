# Y.Stage X-3 比赛系统

来自 Yukari

这是 AI 写的，专用于东南大学异度沸腾动漫社 WOTA 艺团团内 WOTA 艺赛事

此项目用于保存文件，对外莫有说法，毕竟我也不懂代码，全是 AI 写的。

本地运行的服务器，使用`node server.js`或双击`y-stage3.exe`运行。

release 中的压缩包即为整个项目，依赖已全部下载在压缩包里。好像有 lowdb，numpy 什么的，出错的时候建议会弄的人自己找找错（因为我不会）。

# Y.Stage X 比赛系统使用指南 (简易版)

## 一、软件简介

Y.Stage X 是一个专为异度沸腾 WOTA 艺团设计的比赛管理软件。

它的主要功能包括：

- 管理比赛选手信息
- 管理比赛技能和音乐数据
- 统计比赛结果
- 提供比赛记录和成绩查看功能
- 模块化游戏设计

## 二、如何启动系统

### 【初学者推荐方法】直接运行程序

1. 在 Y.Stage3 文件夹中找到 y-stage3.exe 文件
2. 双击这个文件
3. 稍等片刻，系统会自动启动

### 【进阶方法】从文件夹直接启动

1. 在 Y.Stage3 文件夹上点击鼠标右键
2. 选择"在终端中打开"选项
3. 在打开的窗口中输入：`node server-lowdb.js`
4. 按回车键，当看到"服务器已启动，运行在 http://localhost:3000"的提示时，说明启动成功了

### 【麻烦方法】通过命令窗口启动

1. 按下键盘上的 Win 键(Windows 图标键)和 R 键
2. 在弹出的小窗口中输入 `cmd` 后按回车键
3. 输入 `cd 空格`，然后输入 Y.Stage3 文件夹的位置，例如：  
   `cd d:\Code\HTML\Y.Stage3`
4. 按回车键后，再输入：`node server-lowdb.js`
5. 按回车键，当看到"服务器已启动，运行在 http://localhost:3000"的提示时，说明启动成功了

## 三、如何使用系统

1. 确保系统已经启动（看到上面提到的提示信息）
2. 打开浏览器（推荐使用 Chrome 或 Edge 最新版本）
3. 在浏览器的地址栏中输入：`http://localhost:3000`
4. 按回车键，就能看到 Y.Stage 3 的主页面了
5. 在启动系统的命令窗口中：
   - 输入 `help` 或 `h` 或 `?` 可以查看帮助信息
   - 输入 `exit` 或 `q` 可以正常退出系统
   - 按 `Ctrl+C` 键可以强制退出系统
   - 输入 `t` 或 `test` 可以测试系统是否能正常保存数据

## 四、系统的主要功能

### 1. 【比赛系统】

- 一年加组比赛：包括第一章节和第二章节
- 一年内组比赛：包括上半场和下半场

​**​ 提示 ​**​

- 如果一年加组比赛成员＞ 8 人，建议先将一年内组选手替换为一年加组选手，然后在一年内组上半场界面进行一年加组 N 进 8 的比赛
- 可以使用设置界面的"选手管理"功能中的以 txt 文件批量导入选手功能，快速添加选手，所以要提前准备好选手名单
- 选手名单的 txt 文件格式：一行一个选手的名字，不需要分隔符（或者说换行符就是分隔符），文件名可以随意命名，文件后缀必须是.txt

### 2. 【小游戏】

- ​**​ 定时搬化棒 ​**​：计时挑战游戏
  - 该游戏考验选手的思维能力（乐）
- ​**​ 体态传技 ​**​：不使用手来演绎技，将之传递下去的游戏
  - 该游戏考验选手对技的熟悉程度以及对体态的理解
- ​**​ 建议添加游戏 ​**​："抢棒敲猜技"
  - 两两组队，两队 PK，选手 AB 一组，选手 CD 一组。A 和 C 站在场上桌子一旁，桌子上放置了一根化棒。然后主持人为 A 和 C 各自发出一个技的指令。然后 A 和 C 需要在音乐播放瞬间抢夺化棒，抢到的选手还需要在音乐副歌部分仅以单手（另一只手和下盘不准动）演绎出这个技。由队友 B 或 D 来猜这个技。猜对了就算成功。除此之外还有演绎加分（由评委来评定）。

### 3. 【设置中心】

- 选手管理：添加新选手、修改选手信息、删除选手
- 技能管理：添加新技能、修改技能信息、删除技能
- 奖励管理：设置比赛的奖励内容
- 音乐管理：导入和管理比赛用的音乐

### 4. 【成绩查看】

- 查看比赛结果和获奖选手名单
  - 一年加组第二章节选定决赛胜者后，将自动跳转到排名及赛程记录界面，该界面会显示记录选手的排名和赛程信息
  - 一年内组下半场计分结束后，点击进入排名界面按钮将跳转到排名界面，然后需要手动选择各排名选手

## 五、重要文件在哪里

系统所有的数据都保存在以下文件中：

1. ​**​ 选手数据 ​**​：保存在 `resource/json` 文件夹下的

   - `player1.json`（一年加组选手）
   - `player2.json`（一年内组选手）
   - `winners.json`（获奖选手）

2. ​**​ 技能数据 ​**​：保存在 `resource/json` 文件夹下的

   - `tricks.json`（一年加组技能）
   - `tricks_for_group2.json`（一年内组技能）
   - `tricks_for_game.json`（小游戏技能）

3. ​**​ 音乐数据 ​**​：保存在 `resource/json` 文件夹下的

   - `musics_list.json`（一年加组第一章节音乐）
   - `musics_list_ex.json`（一年加组第二章节音乐）
   - `musics_list_for_group2.json`（一年内组音乐）
   - `games_musics.json`（小游戏音乐）

4. ​**​ 设置数据 ​**​：保存在 `resource/json` 文件夹下的

   - `settings.json`（系统设置）

5. ​**​ 比赛记录 ​**​：保存在系统数据库中，部分也会保存在浏览器中

   - `battle-group1-process.json`（一年加组第一章节比赛记录）
   - `battle-group1-2-process.json`（一年加组第二章节比赛记录）
   - `battle-group2-process.json`（一年内组上半场比赛记录）
   - `battle-group2-2-process.json`（一年内组下半场比赛记录）

6. **​ 其他数据 ​**​：保存在 `resource/json` 文件夹下的

   - `award.json`（一年内组奖品数据）

7. ** 游戏相关 **：保存在 `resource/json` 文件夹下的

   - `game_2_process.json`（游戏《体态传技》记录）
   - `game_2_setting.json`（游戏《体态传技》设置）

## 六、常见问题解答

​**​ 问：系统无法启动，提示"端口 3000 被占用"怎么办？​**​  
答：这说明你电脑上有其他程序正在使用 3000 端口。你可以：

1.  关闭其他可能在使用这个端口的程序（如其他网站服务）
2.  重启电脑后再尝试启动系统

​**​ 问：页面显示"无法连接到服务器"是什么原因？​**​  
答：请检查：

1.  系统是否已经启动（命令窗口是否显示成功启动的信息）
2.  尝试刷新页面（按 F5 键）
3.  如果还不行，尝试重启系统

​**​ 问：保存数据时出现错误怎么办？​**​  
答：

1.  确保没有其他程序正在打开或使用这些数据文件
2.  检查你的电脑是否有权限修改这些文件
3.  如果是在比赛中，可以先记录下信息，结束后再修复

​**​ 问：音乐无法播放怎么解决？​**​  
答：

1.  检查音乐文件是否已经放在了正确的文件夹中  
    (`resource/musics/1yearplus` ，`resource/musics/1yearminus` ，`resource/musics/1yearplus_ex` ，`resource/musics/games_musics`)
2.  确认音乐文件是 MP3 格式的
3.  检查文件名是否包含特殊字符
4.  刷新页面后再试一次

​**​ 问：如何修改音乐数据？​**​  
答：

1.  将 MP3 文件放入对应的音乐文件夹中
2.  使用系统的"音乐导入"功能导入音乐
3.  导入后需要刷新页面才能看到新添加的音乐
4.  尽量使用 MP3 格式的音乐文件，其他格式可能出问题

## 七、数据备份建议

1. 重要比赛前，备份整个 `resource/json` 文件夹  
   (可以简单地复制这个文件夹到其他地方)

2. 比赛开始前，测试一遍所有功能，确保系统正常工作

3. 不要在比赛过程中清除浏览器数据，否则可能丢失一部分记录

4. 比赛结束后，及时备份所有数据文件

⚠️ ​**​ 重要提示 ​**​：在进行大改动前，建议先备份整个 Y.Stage3 文件夹，以防数据丢失！

## 八、系统特点

1. 所有数据都保存在本地文件中，便于备份和恢复

2. 系统界面美观易用，适合各类比赛场景

3. 启动后会显示"数据库初始化成功"的提示，这表示一切正常

4. 界面采用模块化设计，容易理解和操作

5. 系统由 Copilot 与 Himetuki_Yukari 共同开发，代码结构清晰，方便维护

⚠️ ​**​ 注意 ​**​：系统需要在本地运行，不支持远程访问。如果尝试从其他电脑访问，可能会导致数据无法保存。

## 九、联系方式

如有问题或建议，请联系 Y.StageX 开发团队：

👤 QQ: 3664518772

🌐 WOTA 艺 wiki: https://wotagei.huijiwiki.com/

​**​ 更新时间 ​**​：2025 年 4 月 14 日下午 17 时

---

祝您使用愉快！来自 team 异度沸腾【姬月由佳莉/姫月ユカリ】

# seu_wotagei_competition

AI 写的，专用于东南大学异度沸腾动漫社 WOTA 艺团团内 WOTA 艺赛事

此项目用于保存文件，对外莫有说法，毕竟我也不懂代码，全是 AI 写的

本地运行的服务器，使用`node server.js`或双击`y-stage3.exe`运行。

release 中的压缩包即为整个项目，依赖已全部下载在压缩包里。好像有 lowdb，numpy 什么的，出错的时候建议会弄的人自己找找错（因为我不会）。

# Y.Stage X 比赛系统使用指南 (简易版)

## 一、软件简介

Y.Stage X 是一个专为异度沸腾 WOTA 艺团设计的比赛管理软件。

它的主要功能包括：

- 管理比赛选手信息
- 管理比赛技能和音乐数据
- 统计比赛结果
- 提供比赛记录和成绩查看功能
- 模块化游戏设计

## 二、如何启动系统

### 【初学者推荐方法】直接运行程序

1. 在 Y.Stage3 文件夹中找到 y-stage3.exe 文件
2. 双击这个文件
3. 稍等片刻，系统会自动启动

### 【进阶方法】从文件夹直接启动

1. 在 Y.Stage3 文件夹上点击鼠标右键
2. 选择"在终端中打开"选项
3. 在打开的窗口中输入：`node server-lowdb.js`
4. 按回车键，当看到"服务器已启动，运行在 http://localhost:3000"的提示时，说明启动成功了

### 【麻烦方法】通过命令窗口启动

1. 按下键盘上的 Win 键(Windows 图标键)和 R 键
2. 在弹出的小窗口中输入 `cmd` 后按回车键
3. 输入 `cd 空格`，然后输入 Y.Stage3 文件夹的位置，例如：  
   `cd d:\Code\HTML\Y.Stage3`
4. 按回车键后，再输入：`node server-lowdb.js`
5. 按回车键，当看到"服务器已启动，运行在 http://localhost:3000"的提示时，说明启动成功了

## 三、如何使用系统

1. 确保系统已经启动（看到上面提到的提示信息）
2. 打开浏览器（推荐使用 Chrome 或 Edge 最新版本）
3. 在浏览器的地址栏中输入：`http://localhost:3000`
4. 按回车键，就能看到 Y.Stage 3 的主页面了
5. 在启动系统的命令窗口中：
   - 输入 `help` 或 `h` 或 `?` 可以查看帮助信息
   - 输入 `exit` 或 `q` 可以正常退出系统
   - 按 `Ctrl+C` 键可以强制退出系统
   - 输入 `t` 或 `test` 可以测试系统是否能正常保存数据

## 四、系统的主要功能

### 1. 【比赛系统】

- 一年加组比赛：包括第一章节和第二章节
- 一年内组比赛：包括上半场和下半场

​**​ 提示 ​**​

- 如果一年加组比赛成员＞ 8 人，建议先将一年内组选手替换为一年加组选手，然后在一年内组上半场界面进行一年加组 N 进 8 的比赛
- 可以使用设置界面的"选手管理"功能中的以 txt 文件批量导入选手功能，快速添加选手，所以要提前准备好选手名单
- 选手名单的 txt 文件格式：一行一个选手的名字，不需要分隔符（或者说换行符就是分隔符），文件名可以随意命名，文件后缀必须是.txt

### 2. 【小游戏】

- ​**​ 定时搬化棒 ​**​：计时挑战游戏
  - 该游戏考验选手的思维能力（乐）
- ​**​ 体态传技 ​**​：不使用手来演绎技，将之传递下去的游戏
  - 该游戏考验选手对技的熟悉程度以及对体态的理解
- ​**​ 建议添加游戏 ​**​："抢棒敲猜技"
  - 两两组队，两队 PK，选手 AB 一组，选手 CD 一组。A 和 C 站在场上桌子一旁，桌子上放置了一根化棒。然后主持人为 A 和 C 各自发出一个技的指令。然后 A 和 C 需要在音乐播放瞬间抢夺化棒，抢到的选手还需要在音乐副歌部分仅以单手（另一只手和下盘不准动）演绎出这个技。由队友 B 或 D 来猜这个技。猜对了就算成功。除此之外还有演绎加分（由评委来评定）。

### 3. 【设置中心】

- 选手管理：添加新选手、修改选手信息、删除选手
- 技能管理：添加新技能、修改技能信息、删除技能
- 奖励管理：设置比赛的奖励内容
- 音乐管理：导入和管理比赛用的音乐

### 4. 【成绩查看】

- 查看比赛结果和获奖选手名单
  - 一年加组第二章节选定决赛胜者后，将自动跳转到排名及赛程记录界面，该界面会显示记录选手的排名和赛程信息
  - 一年内组下半场计分结束后，点击进入排名界面按钮将跳转到排名界面，然后需要手动选择各排名选手

## 五、重要文件在哪里

系统所有的数据都保存在以下文件中：

1. ​**​ 选手数据 ​**​：保存在 `resource/json` 文件夹下的

   - `player1.json`（一年加组选手）
   - `player2.json`（一年内组选手）

2. ​**​ 技能数据 ​**​：保存在 `resource/json` 文件夹下的

   - `tricks.json`（一年加组技能）
   - `tricks_for_group2.json`（一年内组技能）

3. ​**​ 音乐数据 ​**​：保存在 `resource/json` 文件夹下的

   - `musics_list.json`（一年加组第一章节音乐）
   - `musics_list_ex.json`（一年加组第二章节音乐）

4. ​**​ 设置数据 ​**​：保存在 `resource/json` 文件夹下的

   - `settings.json`（系统设置）

5. ​**​ 比赛记录 ​**​：保存在系统数据库中，部分也会保存在浏览器中

## 六、常见问题解答

​**​ 问：系统无法启动，提示"端口 3000 被占用"怎么办？​**​  
答：这说明你电脑上有其他程序正在使用 3000 端口。你可以：

1.  关闭其他可能在使用这个端口的程序（如其他网站服务）
2.  重启电脑后再尝试启动系统

​**​ 问：页面显示"无法连接到服务器"是什么原因？​**​  
答：请检查：

1.  系统是否已经启动（命令窗口是否显示成功启动的信息）
2.  尝试刷新页面（按 F5 键）
3.  如果还不行，尝试重启系统

​**​ 问：保存数据时出现错误怎么办？​**​  
答：

1.  确保没有其他程序正在打开或使用这些数据文件
2.  检查你的电脑是否有权限修改这些文件
3.  如果是在比赛中，可以先记录下信息，结束后再修复

​**​ 问：音乐无法播放怎么解决？​**​  
答：

1.  检查音乐文件是否已经放在了正确的文件夹中  
    (`resource/musics/1yearplus` 或其他对应文件夹)
2.  确认音乐文件是 MP3 格式的
3.  检查文件名是否包含特殊字符
4.  刷新页面后再试一次

​**​ 问：如何修改音乐数据？​**​  
答：

1.  将 MP3 文件放入对应的音乐文件夹中
2.  使用系统的"音乐导入"功能导入音乐
3.  导入后需要刷新页面才能看到新添加的音乐

## 七、数据备份建议

1. 重要比赛前，备份整个 `resource/json` 文件夹  
   (可以简单地复制这个文件夹到其他地方)

2. 比赛开始前，测试一遍所有功能，确保系统正常工作

3. 不要在比赛过程中清除浏览器数据，否则可能丢失一部分记录

4. 比赛结束后，及时备份所有数据文件

⚠️ ​**​ 重要提示 ​**​：在进行大改动前，建议先备份整个 Y.Stage3 文件夹，以防数据丢失！

## 八、系统特点

1. 所有数据都保存在本地文件中，便于备份和恢复

2. 系统界面美观易用，适合各类比赛场景

3. 启动后会显示"数据库初始化成功"的提示，这表示一切正常

4. 界面采用模块化设计，容易理解和操作

5. 系统由 Copilot 与 Himetuki_Yukari 共同开发，代码结构清晰，方便维护

⚠️ ​**​ 注意 ​**​：系统需要在本地运行，不支持远程访问。如果尝试从其他电脑访问，可能会导致数据无法保存。

## 九、联系方式

如有问题或建议，请联系 Y.StageX 开发团队：

👤 QQ: 3664518772

🌐 WOTA 艺 wiki: https://wotagei.huijiwiki.com/

​**​ 更新时间 ​**​：2025 年 4 月 13 日晚 21 点

---

祝您使用愉快！来自 team 异度沸腾【姬月由佳莉/姫月ユカリ】
