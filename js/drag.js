/**
 * Drag式比赛 — AGENTS.md 精确 UI/UX 规格实现
 *
 * 坐标系:
 *   1 GU = 容器宽度 / 50
 *   方框尺寸: 宽 4 GU × 高 1.2 GU
 *   每轮水平收缩: 5 GU
 *
 * 交互核心: 拖拽 (HTML5 Drag & Drop)
 *   仅当两父级均 Occupied → 子级 Pending → 可拖拽
 */

/* =================================================================
 *  常量和全局状态
 * ================================================================= */
const GU_RATIO = 50;
const BOX_W_GU = 4;
const BOX_H_GU = 1.2;
const ROUND_STEP_GU = 5;

const State = {
  playerSource: "player1",
  totalCount: 8,
  allPlayers: [],
  n: 3,
  nodes: [],
  nodeById: {},
  championId: null,
  phase: "playing",
  undoStack: [],
  music: { oldList: [], newList: [], exList: [], current: null },
  musicSource: "old",  // "old" | "new" | "ex"
  battleKeepBg: true,   // 比赛模式是否保留背景图
  doubleElim: false,    // 对阵树式四强双败赛开关（设置页同步）
  doubleElimActive: false, // 双败对阵是否已激活（过渡后为 true）
  doubleElimResetDone: false, // 双败总决赛 bracket reset 已触发（防止无限重置）
};

/* DOM 缓存 */
let canvasEl, nodesLayer, svgEl, containerW, containerH, GU, boxW, boxH;
let dragData = null;

/* =================================================================
 *  坐标计算引擎
 * ================================================================= */
function recomputeLayout() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  containerW = rect.width;
  containerH = rect.height;
  if (containerW === 0 || containerH === 0) return; // 元素不可见时跳过
  GU = containerW / GU_RATIO;
  boxW = BOX_W_GU * GU;
  boxH = BOX_H_GU * GU;
}

/** 计算某轮某侧某索引节点的中心坐标 */
function nodeCenter(side, round, verticalIdxInRound, nodesPerSideThisRound) {
  // round: 0-based (0=叶子)
  const totalY = containerH - 2 * GU;
  const spacing = totalY / (nodesPerSideThisRound + 1);
  const yCenter = GU + (verticalIdxInRound + 1) * spacing;

  if (side === "left") {
    const xCenter = round * ROUND_STEP_GU * GU + boxW / 2;
    return { x: xCenter, y: yCenter };
  } else if (side === "right") {
    const xCenter = containerW - round * ROUND_STEP_GU * GU - boxW / 2;
    return { x: xCenter, y: yCenter };
  } else {
    // center (champion)
    return { x: containerW / 2, y: containerH / 2 };
  }
}

/** 计算父节点对对应胜者的 Y (两父节点Y中点) */
function winnerY(parent1, parent2) {
  return (parent1.y + parent2.y) / 2;
}

/* =================================================================
 *  对阵表构建
 * ================================================================= */
function buildBracket() {
  const total = State.totalCount;
  const players = State.allPlayers.slice(0, total);
  State.n = Math.ceil(Math.log2(total));
  const fullSlots = Math.pow(2, State.n);
  const perSide = fullSlots / 2;

  // 补齐到 2^n
  const padded = [...players];
  while (padded.length < fullSlots) padded.push(null);

  State.nodes = [];
  State.nodeById = {};
  State.championId = null;

  // --- 叶子层 (round 0) ---
  const leafLeft = [], leafRight = [];
  for (let i = 0; i < perSide; i++) {
    leafLeft.push(padded[i]);
    leafRight.push(padded[perSide + i]);
  }

  const leftLeaves = leafLeft.map((name, idx) => {
    const pos = nodeCenter("left", 0, idx, perSide);
    const id = "L_" + idx;
    return { id, type: "leaf", side: "left", round: 0, index: idx,
      playerName: name, state: name ? "occupied" : "pending",
      parentIds: [], childId: null, x: pos.x, y: pos.y, badge: null };
  });

  const rightLeaves = leafRight.map((name, idx) => {
    const pos = nodeCenter("right", 0, idx, perSide);
    const id = "R_" + idx;
    return { id, type: "leaf", side: "right", round: 0, index: idx,
      playerName: name, state: name ? "occupied" : "pending",
      parentIds: [], childId: null, x: pos.x, y: pos.y, badge: null };
  });

  State.nodes.push(...leftLeaves, ...rightLeaves);
  leftLeaves.forEach(n => State.nodeById[n.id] = n);
  rightLeaves.forEach(n => State.nodeById[n.id] = n);

  // --- 递归构建胜者层 (round 1..n-1) ---
  let currentRoundNodes = { left: [...leftLeaves], right: [...rightLeaves] };
  const sideKeys = ["left", "right"];

  for (let r = 1; r < State.n; r++) {
    const nextRound = { left: [], right: [] };
    const perSideThisRound = currentRoundNodes.left.length / 2;

    for (const side of sideKeys) {
      const parents = currentRoundNodes[side];
      for (let i = 0; i < parents.length; i += 2) {
        const p1 = parents[i];
        const p2 = parents[i + 1];
        if (!p1 || !p2) continue;

        const wY = winnerY({ y: p1.y }, { y: p2.y });
        const pos = nodeCenter(side, r, i / 2, perSideThisRound);
        const id = side === "left" ? "WL_" + r + "_" + (i / 2) : "WR_" + r + "_" + (i / 2);
        const wNode = {
          id, type: "winner", side, round: r, index: i / 2,
          playerName: null, state: "pending",
          parentIds: [p1.id, p2.id], childId: null,
          x: pos.x, y: wY, badge: null,
        };
        p1.childId = id;
        p2.childId = id;
        nextRound[side].push(wNode);
        State.nodes.push(wNode);
        State.nodeById[id] = wNode;
      }
    }
    currentRoundNodes = nextRound;
  }

  // --- 冠军节点 ---
  const leftFinal = currentRoundNodes.left[0];
  const rightFinal = currentRoundNodes.right[0];
  if (leftFinal && rightFinal) {
    const champId = "CHAMPION";
    const pos = nodeCenter("center", 0, 0, 1);
    const cY = winnerY({ y: leftFinal.y }, { y: rightFinal.y });
    const champNode = {
      id: champId, type: "champion", side: "center", round: State.n, index: 0,
      playerName: null, state: "pending",
      parentIds: [leftFinal.id, rightFinal.id], childId: null,
      x: pos.x, y: cY, badge: null,
    };
    leftFinal.childId = champId;
    rightFinal.childId = champId;
    State.nodes.push(champNode);
    State.nodeById[champId] = champNode;
    State.championId = champId;
  }
}

/** 统一入口：始终构建标准淘汰赛; 双败过渡由 checkDoubleElimTransition 触发 */
function buildOrResetBracket() {
  State.nodes = [];
  State.nodeById = {};
  State.championId = null;
  State.undoStack = [];
  State.phase = "playing";
  State.doubleElimActive = false;
  State.doubleElimResetDone = false;

  // 从设置恢复真实总人数（防止被双败过渡的 totalCount=4 污染）
  const savedTotal = localStorage.getItem("dragTotalCount");
  if (savedTotal) {
    State.totalCount = Math.max(2, parseInt(savedTotal) || 8);
  }
  // 修剪选手列表到总人数
  if (State.allPlayers.length > State.totalCount) {
    State.allPlayers = State.allPlayers.slice(0, State.totalCount);
  }

  buildBracket();
  processByes();
  applyDoubleElimBadges();
}

/** 处理轮空: 仅一个父节点有玩家且另一个是叶子空位 → 自动晋级
 *  关键: 只有叶子层 null 选手才是真正的 bye；
 *  内部 winner 节点 pending 是正常等待状态，不能触发 bye */
function processByes() {
  // 双败淘汰赛中不存在轮空，LL_*/WF_DROP 等空槽是在等对手就位，不是 bye
  if (State.doubleElimActive) return;
  for (const node of State.nodes) {
    if (node.state !== "pending" || node.parentIds.length < 2) continue;
    const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
    if (parents.length !== 2) continue;

    const p1occ = parents[0].state === "occupied" && parents[0].playerName;
    const p2occ = parents[1].state === "occupied" && parents[1].playerName;

    // 只有叶子节点为空才是真正的 bye；winner 节点 pending 是正常等待
    const p1IsEmptyLeaf = parents[0].type === "leaf" && parents[0].state === "pending" && !parents[0].playerName;
    const p2IsEmptyLeaf = parents[1].type === "leaf" && parents[1].state === "pending" && !parents[1].playerName;

    // Bye: 一个占据一个叶子空位 → 自动晋级
    if (p1occ && p2IsEmptyLeaf) {
      node.playerName = parents[0].playerName;
      node.state = "occupied";
      parents[0].state = "advanced";
      node.autoBye = true;
    } else if (p2occ && p1IsEmptyLeaf) {
      node.playerName = parents[1].playerName;
      node.state = "occupied";
      parents[1].state = "advanced";
      node.autoBye = true;
    }
  }
}

/* =================================================================
 *  4强 → 双败淘汰布局转换
 * ================================================================= */
function applyDoubleElimBadges() {
  // 找出仍在竞争中的选手（occupied 且下一轮尚未晋级 → 其子节点为 pending）
  const activeNodes = State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  );

  if (activeNodes.length === 4) {
    // 标记为胜者组 W
    activeNodes.forEach(n => { n.badge = "W"; });
  }
}

/* =================================================================
 *  四强双败自动过渡 — 检测 4 人存活 → 切换双败对阵
 * ================================================================= */

/** 统计当前 occupied 且等待晋级的选手数 */
function getActivePlayerCount() {
  return State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  ).length;
}

/** 双败开关开启 + 剩余恰好 4 人 → 触发过渡 */
function checkDoubleElimTransition() {
  if (!State.doubleElim) return false;
  if (State.doubleElimActive) return false;
  if (getActivePlayerCount() !== 4) return false;

  transitionToDoubleElim();
  return true;
}

/** 提取当前 4 名存活选手，重建双败对阵 */
function transitionToDoubleElim() {
  const activeNodes = State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  );
  if (activeNodes.length !== 4) return;

  const names = activeNodes.map(n => n.playerName);
  State.allPlayers = names;
  State.totalCount = 4;
  State.doubleElimActive = true;
  State.doubleElimResetDone = false;
  State.nodes = [];
  State.nodeById = {};
  State.championId = null;
  State.undoStack = [];

  buildDoubleElimBracket();
  recomputeDoubleElimLayout();
  renderLines();
  renderNodes();
  updateStatus();
  showHint("四强双败淘汰赛已开启！");
}

/* =================================================================
 *  四强双败淘汰赛 — 对阵表构建 & 布局
 * ================================================================= */

/**
 * 4人双败淘汰赛结构 (修订版 — 标准流程 4 轮):
 *
 *   [胜者组 — 上半区]
 *   L_0(A) ──┐                     ┌── R_0(C)
 *            WL_1_0 ──┐     ┌── WR_1_0
 *   L_1(B) ──┘        │     │     ┌── R_1(D)
 *                     WF_2_0 ──────────┐
 *                                      │
 *                                   CHAMPION
 *                                      │
 *                     LF_2_0 ──────────┘
 *                  ↗          ↖
 *            LB_1_0          WF_DROP
 *          ↗       ↖         (胜者组决赛败者)
 *     LL_0(B)    LL_1(D)
 *
 *   [败者组 — 下半区]
 *
 * 标准四强双败流程 (4 轮交互，败者自动进位):
 *   第一轮 半决赛:   L_0 vs L_1 → 胜者→WL_1_0, 败者→LL_0 (自动)
 *                    R_0 vs R_1 → 胜者→WR_1_0, 败者→LL_1 (自动)
 *   第二轮 胜决+败R1: WL_1_0 vs WR_1_0 → 胜者→WF_2_0, 败者→WF_DROP (自动)
 *                    LL_0 vs LL_1 → 胜者→LB_1_0, 败者→淘汰(第4名)
 *   第三轮 败者组决赛: LB_1_0 vs WF_DROP → 胜者→LF_2_0, 败者→淘汰(第3名)
 *   第四轮 总决赛:     WF_2_0 vs LF_2_0 → CHAMPION
 *                     (若 LF 胜则加赛: 双方各1败, 再次对决)
 */
function buildDoubleElimBracket() {
  const players = State.allPlayers.slice(0, 4);
  State.n = 2;  // 2 轮基础 + 额外败者组

  State.nodes = [];
  State.nodeById = {};

  // --- 胜者组叶子（4 个初始选手） ---
  const wLeaves = [
    { id: "L_0", side: "left", index: 0, playerName: players[0] || null },
    { id: "L_1", side: "left", index: 1, playerName: players[1] || null },
    { id: "R_0", side: "right", index: 0, playerName: players[2] || null },
    { id: "R_1", side: "right", index: 1, playerName: players[3] || null },
  ];

  for (const wl of wLeaves) {
    const node = {
      id: wl.id, type: "leaf", side: wl.side, round: 0, index: wl.index,
      playerName: wl.playerName,
      state: wl.playerName ? "occupied" : "pending",
      parentIds: [], childId: null,
      x: 0, y: 0, badge: null,
    };
    State.nodes.push(node);
    State.nodeById[node.id] = node;
  }

  // --- 胜者组 Round 1: WL_1_0, WR_1_0 ---
  const wl1 = createDoubleElimWinner("WL_1_0", "left", 1, 0, ["L_0", "L_1"]);
  const wr1 = createDoubleElimWinner("WR_1_0", "right", 1, 0, ["R_0", "R_1"]);
  State.nodeById["L_0"].childId = "WL_1_0";
  State.nodeById["L_1"].childId = "WL_1_0";
  State.nodeById["R_0"].childId = "WR_1_0";
  State.nodeById["R_1"].childId = "WR_1_0";

  // --- 胜者组 Round 2: WF_2_0（胜者组决赛） ---
  const wf = createDoubleElimWinner("WF_2_0", "center", 2, 0, ["WL_1_0", "WR_1_0"]);
  wl1.childId = "WF_2_0";
  wr1.childId = "WF_2_0";

  // --- 败者组输入叶子 ---
  const lLeaves = [
    { id: "LL_0", index: 0 },
    { id: "LL_1", index: 1 },
  ];
  for (const ll of lLeaves) {
    const node = {
      id: ll.id, type: "leaf", side: "losers", round: 0, index: ll.index,
      playerName: null, state: "pending",
      parentIds: [], childId: null,
      x: 0, y: 0, badge: null,
    };
    State.nodes.push(node);
    State.nodeById[node.id] = node;
  }

  // --- 败者组 Round 1: LB_1_0 ---
  const lb1 = createDoubleElimWinner("LB_1_0", "losers", 1, 0, ["LL_0", "LL_1"]);
  State.nodeById["LL_0"].childId = "LB_1_0";
  State.nodeById["LL_1"].childId = "LB_1_0";

  // --- 胜者组决赛败者接收槽: WF_DROP (自动接收 WF 败者) ---
  const wfDrop = {
    id: "WF_DROP", type: "leaf", side: "losers", round: 0, index: 2,
    playerName: null, state: "pending",
    parentIds: [], childId: null,
    x: 0, y: 0, badge: null,
  };
  State.nodes.push(wfDrop);
  State.nodeById["WF_DROP"] = wfDrop;

  // --- 败者组决赛: LF_2_0 (双父节点: LB_1_0 + WF_DROP) ---
  const lf = createDoubleElimWinner("LF_2_0", "center", 2, 0, ["LB_1_0", "WF_DROP"]);
  lb1.childId = "LF_2_0";
  wfDrop.childId = "LF_2_0";

  // --- 总决赛: CHAMPION ---
  const champ = {
    id: "CHAMPION", type: "champion", side: "center", round: 3, index: 0,
    playerName: null, state: "pending",
    parentIds: ["WF_2_0", "LF_2_0"], childId: null,
    x: 0, y: 0, badge: null,
  };
  wf.childId = "CHAMPION";
  lf.childId = "CHAMPION";
  State.nodes.push(champ);
  State.nodeById["CHAMPION"] = champ;
  State.championId = "CHAMPION";

  recomputeDoubleElimLayout();
}

function createDoubleElimWinner(id, side, round, index, parentIds) {
  const node = {
    id, type: "winner", side, round, index,
    playerName: null, state: "pending",
    parentIds: parentIds,
    childId: null,
    x: 0, y: 0, badge: null,
  };
  State.nodes.push(node);
  State.nodeById[id] = node;
  return node;
}

/**
 * 双败淘汰专用布局: 胜者组在上半区，败者组在下半区
 */
function recomputeDoubleElimLayout() {
  if (!canvasEl) return;
  const w = containerW, h = containerH;
  if (w === 0 || h === 0) return;

  // 胜者组 Y 中心
  const wTop = h * 0.22;
  const wBot = h * 0.38;

  // 败者组 Y 中心
  const lTop = h * 0.65;
  const lBot = h * 0.78;

  // 败者组最后
  const lfY = (lTop + lBot) / 2 + h * 0.08;

  // 胜者组决赛 & 总决赛 Y
  const wfY = (wTop + wBot) / 2;
  const champY = (wfY + lfY) / 2;

  const positions = {
    // 胜者组叶子
    L_0:   { x: w * 0.04, y: wTop },
    L_1:   { x: w * 0.04, y: wBot },
    R_0:   { x: w * 0.96, y: wTop },
    R_1:   { x: w * 0.96, y: wBot },
    // 胜者组 R1
    WL_1_0: { x: w * 0.16, y: wfY },
    WR_1_0: { x: w * 0.84, y: wfY },
    // 胜者组决赛
    WF_2_0: { x: w * 0.38, y: wfY },
    // 败者组输入
    LL_0:  { x: w * 0.08, y: lTop },
    LL_1:  { x: w * 0.08, y: lBot },
    // 败者组 R1
    LB_1_0: { x: w * 0.22, y: (lTop + lBot) / 2 },
    // WF 败者接收槽
    WF_DROP: { x: w * 0.38, y: lBot },
    // 败者组决赛
    LF_2_0: { x: w * 0.53, y: lfY },
    // 总决赛
    CHAMPION: { x: w * 0.73, y: champY },
  };

  for (const node of State.nodes) {
    const pos = positions[node.id];
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
  }
}

/* =================================================================
 *  渲染引擎
 * ================================================================= */
function renderAll() {
  recomputeLayout();

  if (State.doubleElimActive) {
    // 双败赛已激活: 使用专用布局
    recomputeDoubleElimLayout();
  } else {
    // 标准淘汰赛: 重新计算所有中心点
    for (const node of State.nodes) {
      const perSideRound0 = Math.pow(2, State.n - 1);
      if (node.type === "leaf") {
        const pos = nodeCenter(node.side, 0, node.index, perSideRound0);
        node.x = pos.x; node.y = pos.y;
      } else if (node.type === "winner") {
        const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
        if (parents.length === 2) {
          const pos = nodeCenter(node.side, node.round, node.index,
            Math.pow(2, State.n - 1 - node.round));
          node.x = pos.x;
          node.y = winnerY(parents[0], parents[1]);
        }
      } else if (node.type === "champion") {
        const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
        node.x = containerW / 2;
        node.y = parents.length === 2 ? winnerY(parents[0], parents[1]) : containerH / 2;
      }
    }
  }

  renderLines();
  renderNodes();
  updateStatus();
}

function renderNodes() {
  nodesLayer.innerHTML = "";

  for (const node of State.nodes) {
    const el = document.createElement("div");
    el.className = "node-box";
    el.id = "node-" + node.id;
    el.dataset.nodeId = node.id;

    // 尺寸
    el.style.width = boxW + "px";
    el.style.height = boxH + "px";
    el.style.left = (node.x - boxW / 2) + "px";
    el.style.top = (node.y - boxH / 2) + "px";

    // 状态样式
    el.classList.add("state-" + node.state);

    // 显示内容
    if (node.playerName) {
      const displayName = truncateName(node.playerName);
      el.textContent = displayName;
      if (displayName !== node.playerName) {
        el.title = node.playerName;
      }
    } else if (node.state === "pending") {
      // 双败赛专用标签
      if (State.doubleElimActive && node.id.startsWith("LL_")) {
        el.textContent = "败者";
      } else if (State.doubleElimActive && node.id === "WF_DROP") {
        el.textContent = "WF败者";
      } else if (State.doubleElimActive && node.id === "LF_2_0") {
        el.textContent = "败决";
      } else if (State.doubleElimActive && node.id === "WF_2_0") {
        el.textContent = "胜决";
      } else if (node.type === "champion") {
        el.textContent = "决赛";
      } else {
        el.textContent = "[TBD]";
      }
    }

    // 冠军节点特殊样式
    if (node.type === "champion") {
      el.classList.add("champion-slot");
    }

    // Badge
    if (node.badge) {
      const badge = document.createElement("span");
      badge.className = "badge " + (node.badge === "W" ? "w-badge" : "l-badge");
      badge.textContent = node.badge;
      el.appendChild(badge);
    }

    // 可拖拽判定
    if (canBeDragged(node)) {
      el.classList.add("draggable");
      el.draggable = true;
      el.addEventListener("dragstart", onDragStart);
      el.addEventListener("dragend", onDragEnd);
    }

    // 双击撤销
    if (node.state === "advanced" || node.state === "occupied") {
      el.addEventListener("dblclick", (e) => onDoubleClickNode(node, e));
    }

    // 放置目标
    if (canBeDropTarget(node)) {
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("dragenter", onDragEnter);
      el.addEventListener("dragleave", onDragLeave);
      el.addEventListener("drop", onDrop);
    }

    nodesLayer.appendChild(el);
  }
}

function renderLines() {
  svgEl.innerHTML = "";

  for (const node of State.nodes) {
    const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);

    // 双父节点：标准 bracket 连线
    if (parents.length >= 2) {
      const p1 = parents[0], p2 = parents[1];

      const mergeX = node.side === "left"
        ? p1.x + boxW / 2 + (node.x - boxW / 2 - p1.x - boxW / 2) * 0.4
        : p2.x - boxW / 2 - (p2.x - boxW / 2 - node.x - boxW / 2) * 0.4;
      const midY = (p1.y + p2.y) / 2;

      const colorClass = node.state === "pending"
        ? "pending-line"
        : (node.state === "occupied" ? "active-line" : "");

      // 构建路径: P1→合并点→P2，合并点→Winner
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      const points = [
        (p1.side === "left" || p1.side === "losers" ? p1.x + boxW / 2 : p1.x - boxW / 2) + "," + p1.y,
        mergeX + "," + p1.y,
        mergeX + "," + midY,
        mergeX + "," + p2.y,
        (p2.side === "left" || p2.side === "losers" ? p2.x + boxW / 2 : p2.x - boxW / 2) + "," + p2.y,
      ];
      path.setAttribute("points", points.join(" "));
      path.setAttribute("fill", "none");
      if (colorClass) path.classList.add(colorClass);
      svgEl.appendChild(path);

      // 合并点 → Winner 连线
      const winLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      winLine.setAttribute("x1", mergeX);
      winLine.setAttribute("y1", midY);
      winLine.setAttribute("x2", node.side === "left" || node.side === "losers" ? node.x - boxW / 2 : node.x + boxW / 2);
      winLine.setAttribute("y2", node.y);
      if (colorClass) winLine.classList.add(colorClass);
      svgEl.appendChild(winLine);
    } else if (parents.length === 1) {
      // 单父节点：画直线（通用兜底逻辑）
      const p = parents[0];
      const colorClass = node.state === "pending"
        ? "pending-line"
        : (node.state === "occupied" ? "active-line" : "");

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      // 从父节点右侧 → 子节点左侧
      line.setAttribute("x1", p.x + boxW / 2);
      line.setAttribute("y1", p.y);
      line.setAttribute("x2", node.x - boxW / 2);
      line.setAttribute("y2", node.y);
      if (colorClass) line.classList.add(colorClass);
      svgEl.appendChild(line);
    }
  }
}

/* =================================================================
 *  拖拽判定逻辑
 * ================================================================= */
function canBeDragged(node) {
  if (node.state !== "occupied") return false;
  if (!node.childId) return false;
  const child = State.nodeById[node.childId];
  if (!child) return false;

  // 双败赛已激活: 允许任意 occupied 节点拖拽（败者需移入败者组）
  if (State.doubleElimActive) return true;

  // 子节点必须恰好有 1 或 2 个父节点
  const parentCount = child.parentIds.length;
  if (parentCount < 1 || parentCount > 2) return false;

  const parents = child.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  if (parents.length !== parentCount) return false;
  // 所有父节点都必须 occupied
  if (!parents.every(p => p.state === "occupied")) return false;

  // 正常情况: 子节点待定
  if (child.state === "pending") return true;

  // 替换情况: 子节点已被对手占据 → 允许拖拽替换
  if (child.state === "occupied" && child.playerName !== node.playerName) {
    const otherParents = parents.filter(p => p.id !== node.id);
    return otherParents.length > 0 && otherParents.every(
      p => p.state === "advanced" && p.playerName === child.playerName
    );
  }

  return false;
}

function canBeDropTarget(node) {
  // pending 永远是合法目标; occupied 的 winner/champion 可被替换
  return node.state === "pending" ||
    (node.state === "occupied" && (node.type === "winner" || node.type === "champion"));
}

/* =================================================================
 *  HTML5 拖拽事件
 * ================================================================= */
function onDragStart(e) {
  const nodeId = e.target.dataset.nodeId;
  const node = State.nodeById[nodeId];
  if (!node || !canBeDragged(node)) {
    e.preventDefault();
    return;
  }

  dragData = { fromId: nodeId, toId: node.childId };

  // 双败赛已激活: 允许拖至败者组输入槽
  if (State.doubleElimActive) {
    dragData.doubleElimExtraTargets = [];
    // LL_0, LL_1 始终可拖入（半决赛败者自动放入，此处保留兼容手动拖入）
    ["LL_0", "LL_1"].forEach(id => {
      if (State.nodeById[id] && State.nodeById[id].state === "pending") {
        dragData.doubleElimExtraTargets.push(id);
      }
    });
    // WF_DROP 可拖入（胜者组决赛败者自动放入，此处保留兼容手动拖入）
    if (State.nodeById["WF_DROP"] && State.nodeById["WF_DROP"].state === "pending") {
      dragData.doubleElimExtraTargets.push("WF_DROP");
    }
  }

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", node.playerName);
  e.target.classList.add("dragging");

  // 高亮目标
  const targetEl = document.getElementById("node-" + node.childId);
  if (targetEl) {
    targetEl.classList.add("drop-target");
  }
  // 双败赛: 高亮额外目标
  if (dragData.doubleElimExtraTargets) {
    dragData.doubleElimExtraTargets.forEach(id => {
      const el = document.getElementById("node-" + id);
      if (el) el.classList.add("drop-target");
    });
  }
}

function onDragEnd(e) {
  e.target.classList.remove("dragging");
  // 清除高亮
  document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
  dragData = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function onDragEnter(e) {
  e.preventDefault();
  e.target.classList.add("drop-target");
}

function onDragLeave(e) {
  e.target.classList.remove("drop-target");
}

function onDrop(e) {
  e.preventDefault();
  e.target.classList.remove("drop-target");

  if (!dragData) return;
  // 穿透 badge 等子元素
  const box = e.target.closest(".node-box");
  const toNodeId = box ? box.dataset.nodeId : e.target.dataset.nodeId;

  // 标准目标: 当前节点的 child
  if (toNodeId === dragData.toId) {
    handleValidDrop(dragData.fromId, toNodeId);
    dragData = null;
    return;
  }

  // 双败赛额外目标: 败者组输入槽
  if (dragData.doubleElimExtraTargets && dragData.doubleElimExtraTargets.includes(toNodeId)) {
    handleValidDrop(dragData.fromId, toNodeId);
    dragData = null;
    return;
  }

  showHint("请拖放到对应内侧方框");
  dragData = null;
}

function handleValidDrop(fromId, toNodeId) {
  const fromNode = State.nodeById[fromId];
  const toNode = State.nodeById[toNodeId];
  if (!fromNode || !toNode) return;

  if (toNode.state === "pending") {
    executeAdvance(fromNode, toNode);
  } else if (toNode.state === "occupied") {
    executeReplace(fromNode, toNode);
  }
}

/** 执行晋级操作 */
function executeAdvance(fromNode, toNode) {
  // 记录 undo
  State.undoStack.push({
    fromId: fromNode.id,
    toId: toNode.id,
    prevFromState: fromNode.state,
    prevToState: toNode.state,
    prevToName: toNode.playerName,
  });

  toNode.playerName = fromNode.playerName;
  toNode.state = "occupied";
  fromNode.state = "advanced";

  // 双败赛: 自动放置败者 + bracket reset 检查
  if (State.doubleElimActive) {
    executeDoubleElimAutoAdvance(fromNode, toNode);
  }

  // 如果目标也是父节点，传播检查
  propagateAdvance(toNode);
  processByes();

  // 双败总决赛 bracket reset 检查
  if (State.doubleElimActive && checkDoubleElimBracketReset(toNode)) {
    // bracket reset 已触发，跳过常规完成检查，直接渲染
    saveState();
    renderAll();
    return;
  }

  checkCompletion();
  checkDoubleElimTransition();
  saveState();
  renderAll();
  showHint(fromNode.playerName + " 已晋级!");
}

/* =================================================================
 *  双败淘汰自动推进逻辑
 * ================================================================= */

/**
 * 双败赛自动推进：
 * 1. 叶子节点 (L_0/L_1/R_0/R_1) 晋级到半决赛胜者槽时，另一败者自动放入 LL_0/LL_1
 * 2. 半决赛胜者 (WL_1_0/WR_1_0) 晋级到胜者组决赛 (WF_2_0) 时，另一败者自动进入 WF_DROP
 */
function executeDoubleElimAutoAdvance(fromNode, toNode) {
  // --- 半决赛自动败者放置 ---
  // L_0 或 L_1 → WL_1_0 : 另一叶子 → LL_0
  if ((fromNode.id === "L_0" || fromNode.id === "L_1") && toNode.id === "WL_1_0") {
    const otherId = fromNode.id === "L_0" ? "L_1" : "L_0";
    autoPlaceLoser(otherId, "LL_0");
  }
  // R_0 或 R_1 → WR_1_0 : 另一叶子 → LL_1
  if ((fromNode.id === "R_0" || fromNode.id === "R_1") && toNode.id === "WR_1_0") {
    const otherId = fromNode.id === "R_0" ? "R_1" : "R_0";
    autoPlaceLoser(otherId, "LL_1");
  }

  // --- 胜者组决赛败者自动下放 ---
  // WL_1_0 → WF_2_0 : WR_1_0 的选手自动 → WF_DROP（作为胜者组决赛败者）
  if (fromNode.id === "WL_1_0" && toNode.id === "WF_2_0") {
    autoPlaceLoser("WR_1_0", "WF_DROP");
  }
  // WR_1_0 → WF_2_0 : WL_1_0 的选手自动 → WF_DROP
  if (fromNode.id === "WR_1_0" && toNode.id === "WF_2_0") {
    autoPlaceLoser("WL_1_0", "WF_DROP");
  }
}

/** 自动放置败者：将 loserNode 的选手放入 targetNode */
function autoPlaceLoser(loserNodeId, targetNodeId) {
  const loser = State.nodeById[loserNodeId];
  const target = State.nodeById[targetNodeId];
  if (!loser || !target) return;
  if (loser.state !== "occupied" || !loser.playerName) return;
  if (target.state !== "pending") return;

  target.playerName = loser.playerName;
  target.state = "occupied";
  loser.state = "advanced";

  // 传播：如果目标填满双父节点 → 子节点 ready
  propagateAdvance(target);
  processByes();

  showHint("⚡ " + loser.playerName + " 自动进入败者组");
}

/**
 * 双败总决赛 bracket reset 检查
 * 若败者组冠军 (LF_2_0) 战胜胜者组冠军 (WF_2_0)，
 * 双方同为 1 败 → 须加赛决定冠军
 */
function checkDoubleElimBracketReset(toNode) {
  if (toNode.id !== "CHAMPION") return false;

  const wf = State.nodeById["WF_2_0"];
  const lf = State.nodeById["LF_2_0"];
  if (!wf || !lf) return false;

  // 若 LF_2_0 的选手填入了 CHAMPION 且 WF_2_0 选手仍未使用（occupied），
  // 意味着败者组冠军获胜 → 需加赛
  if (toNode.playerName === lf.playerName && wf.state === "occupied" && wf.playerName) {
    // 已经做过 bracket reset → 这是真正的决赛结果
    if (State.doubleElimResetDone) {
      State.phase = "complete";
      showHint("🏆 总决赛加赛结束！冠军: " + toNode.playerName + "！");
      return false;
    }

    // 首次 Bracket Reset: 双方各 1 败，重置 CHAMPION 重新对决
    State.doubleElimResetDone = true;
    toNode.playerName = null;
    toNode.state = "pending";
    lf.state = "occupied"; // 恢复 LF_2_0 为 occupied

    // 撤销此次操作对应的 undo 条目
    State.undoStack.pop();

    // 级联清除 CHAMPION 下游（如有）
    cascadeClear(toNode);

    saveState();
    renderAll();
    showHint("⚠️ 胜者组冠军「" + wf.playerName + "」首次失利！双方各一败，请加赛决定冠军！");
    return true;
  }
  return false;
}

/** 替换操作：拖拽对手覆盖已晋级位置 */
function executeReplace(fromNode, toNode) {
  // 找到已被晋级的对手
  const otherParent = toNode.parentIds
    .map(id => State.nodeById[id])
    .find(p => p && p.id !== fromNode.id && p.state === "advanced");

  // 记录 undo（含替换额外信息）
  State.undoStack.push({
    fromId: fromNode.id, toId: toNode.id,
    prevFromState: fromNode.state, prevToState: toNode.state,
    prevToName: toNode.playerName,
    wasReplace: true,
    revertedId: otherParent ? otherParent.id : null,
  });

  // 回退对手
  if (otherParent) {
    otherParent.state = "occupied";
  }

  // 清除旧胜者及下游
  cascadeClear(toNode);
  toNode.playerName = null;
  toNode.state = "pending";

  // 晋级新胜者
  toNode.playerName = fromNode.playerName;
  toNode.state = "occupied";
  fromNode.state = "advanced";

  propagateAdvance(toNode);
  processByes();
  checkCompletion();
  checkDoubleElimTransition();
  saveState();
  renderAll();
  showHint("已替换为 " + fromNode.playerName);
}

/** 传播: 如果两个父级都 occupied，激活子级 */
function propagateAdvance(node) {
  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child || child.state !== "pending") return;

  const parents = child.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  if (parents.length === 2 &&
      parents[0].state === "occupied" && parents[1].state === "occupied") {
    child.state = "pending"; // 保持 pending，等待拖拽
  }
}

function checkCompletion() {
  if (!State.championId) return;
  const champ = State.nodeById[State.championId];
  if (champ && champ.state === "occupied") {
    State.phase = "complete";
    // 冠军特效
    setTimeout(() => {
      const el = document.getElementById("node-" + State.championId);
      if (el) el.classList.add("champion-glow");
    }, 100);
  }
}

/* =================================================================
 *  双击撤销
 * ================================================================= */
function onDoubleClickNode(node, e) {
  e.preventDefault();
  if (node.state === "advanced") {
    // 撤销晋级: 清除子节点的玩家名
    tryUndoAdvance(node);
  } else if (node.state === "occupied" && node.type === "winner") {
    // 清除自身, 恢复父节点
    tryClearWinner(node);
  }
}

function tryUndoAdvance(node) {
  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child) return;

  // 子节点已被对手替换 → 仅恢复自身为 occupied
  if (child.playerName !== node.playerName) {
    node.state = "occupied";
    State.phase = "playing";
    saveState();
    renderAll();
    showHint("已撤销晋级: " + node.playerName + "（对手已晋级，可拖入败者组）");
    return;
  }

  child.playerName = null;
  child.state = "pending";
  node.state = "occupied";

  // 级联清除所有下游
  cascadeClear(child);

  // 重新处理轮空
  processByes();

  State.phase = "playing";
  saveState();
  renderAll();
  showHint("已撤销晋级: " + node.playerName);
}

function tryClearWinner(node) {
  if (node.parentIds.length < 1) return;
  const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  const occupiedParents = parents.filter(p => p && p.state === "advanced" && p.playerName === node.playerName);

  node.playerName = null;
  node.state = "pending";
  occupiedParents.forEach(p => { p.state = "occupied"; });

  cascadeClear(node);

  // 重新处理轮空
  processByes();

  State.phase = "playing";
  saveState();
  renderAll();
  showHint("已回退");
}

function cascadeClear(node) {
  // 回溯：恢复当前节点的所有 advanced 父节点（它们在晋级时被设为 advanced）
  // 修复场景：清空冠军节点时，冠军的另一侧胜者（advanced）也必须恢复为 occupied
  if (node.parentIds) {
    for (const pid of node.parentIds) {
      const p = State.nodeById[pid];
      if (p && p.state === "advanced" && p.playerName === node.playerName) {
        p.state = "occupied";
      }
    }
  }

  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child || child.state !== "occupied") return;
  child.playerName = null;
  child.state = "pending";
  child.autoBye = false;
  cascadeClear(child);
}

/* =================================================================
 *  选手组切换
 * ================================================================= */
function switchPlayerSource(source) {
  if (State.playerSource === source) return;

  // 先保存当前组的进度
  if (State.nodes.length > 0) saveState();

  const oldSource = State.playerSource;
  State.playerSource = source;
  State.phase = "playing";

  document.getElementById("switch-player1-btn").classList.toggle("active", source === "player1");
  document.getElementById("switch-player2-btn").classList.toggle("active", source === "player2");

  // 重新加载配置总数（防止上一组选手的人数限制污染当前组）
  const saved = localStorage.getItem("dragTotalCount");
  if (saved) State.totalCount = Math.max(2, parseInt(saved) || 8);

  loadPlayers().then(() => {
    // 尝试恢复目标组的存档
    const raw = localStorage.getItem(storageKey(source));
    if (raw) {
      try {
        const data = JSON.parse(raw);
        // 验证存档与当前选手数据兼容
        const restoredCount = data.totalCount || 0;
        const actualAvailable = State.allPlayers.length;
        const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
        const compatible = data.nodes && data.nodes.length > 0 &&
          restoredCount <= actualAvailable &&
          isPow2(restoredCount || 1);

        if (compatible) {
          restoreState(data);
          recomputeLayout();
          renderAll();
          showHint("已切换到" + (source === "player1" ? "加组" : "内组") + "（已恢复进度）");
          return;
        }
      } catch (e) { /* 存档损坏，重新构建 */ }
    }

    // 无存档或不兼容 → 全新构建
    buildOrResetBracket();
    saveState();
    renderAll();
    showHint("已切换到" + (source === "player1" ? "加组" : "内组"));
  });
}

/** 随机排列选手（Fisher-Yates 洗牌） */
function shufflePlayers() {
  // 重新加载完整选手列表（防止被双败过渡截断），再洗牌
  loadPlayers().then(() => {
    if (State.allPlayers.length === 0) return;
    for (let i = State.allPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [State.allPlayers[i], State.allPlayers[j]] = [State.allPlayers[j], State.allPlayers[i]];
    }
    buildOrResetBracket();
    saveState();
    renderAll();
    showHint("已随机排列选手");
  });
}

function loadPlayers() {
  const file = State.playerSource === "player1" ? "player1.json" : "player2.json";
  return fetch("../resource/json/" + file)
    .then(r => r.json())
    .then(data => {
      State.allPlayers = data.map(item => (item && item.name ? item.name.trim() : "")).filter(Boolean);

      // 实际可用选手人数不能超过设置的总人数
      const effective = Math.min(State.totalCount, State.allPlayers.length);
      State.totalCount = Math.max(2, effective);

      // 验证是否为 2^n（仅提示，buildBracket 会自动补齐）
      const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
      if (!isPow2(State.allPlayers.length)) {
        const padded = Math.pow(2, Math.ceil(Math.log2(State.allPlayers.length)));
        showError("选手人数(" + State.allPlayers.length + ")非2^n，将补齐至" + padded + "个位置");
      } else {
        hideError();
      }

      document.getElementById("round-label").textContent =
        "第1轮 · " + State.totalCount + "人";
    })
    .catch(err => {
      console.error("加载选手失败:", err);
      showError("选手数据加载失败");
    });
}

function loadMusic() {
  return Promise.all([
    fetch("../resource/json/musics_list.json").then(r => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_2.json").then(r => r.json()).catch(() => []),
    fetch("../resource/json/musics_list_ex.json").then(r => r.json()).catch(() => []),
  ]).then(([oldL, newL, exL]) => {
    State.music.oldList = oldL;
    State.music.newList = newL;
    State.music.exList = exL;
  });
}

function loadSettings() {
  const saved = localStorage.getItem("dragTotalCount");
  if (saved) State.totalCount = Math.max(2, parseInt(saved) || 8);
  return fetch("http://localhost:3000/api/drag-settings")
    .then(r => r.json())
    .then(data => {
      if (data && data.totalCount) {
        State.totalCount = Math.max(2, parseInt(data.totalCount));
      }
      if (data && typeof data.doubleElim === "boolean") {
        State.doubleElim = data.doubleElim;
      }
    })
    .catch(() => {});
}

/* =================================================================
 *  状态提示
 * ================================================================= */
function updateStatus() {
  const statusHint = document.getElementById("status-hint");
  const roundLabel = document.getElementById("round-label");

  // 更新模式标签
  const modeBadge = document.getElementById("mode-badge");
  if (modeBadge) {
    if (State.doubleElimActive) {
      modeBadge.classList.remove("hidden");
    } else {
      modeBadge.classList.add("hidden");
    }
  }

  if (State.phase === "complete") {
    const champ = State.championId ? State.nodeById[State.championId] : null;
    statusHint.textContent = "🏆 冠军: " + (champ ? champ.playerName : "—");
    roundLabel.textContent = "比赛结束";
    return;
  }

  // 双败赛已激活专用状态
  if (State.doubleElimActive) {
    updateDoubleElimStatus(statusHint, roundLabel);
    return;
  }

  // 检查是否到了决赛阶段
  const championNode = State.championId ? State.nodeById[State.championId] : null;
  const isChampionshipRound = championNode &&
    championNode.state === "pending" &&
    championNode.parentIds.every(pid => {
      const p = State.nodeById[pid];
      return p && p.state === "occupied";
    });

  // 统计进度
  const totalMatches = State.nodes.filter(n => n.type === "winner" || n.type === "champion").length;
  const completed = State.nodes.filter(n => (n.type === "winner" || n.type === "champion") && n.state === "occupied").length;
  const currentRound = findCurrentRound();

  // 双败开关已开启但尚未激活 → 显示过渡提示
  const doubleElimPending = State.doubleElim && !State.doubleElimActive && getActivePlayerCount() > 0;

  if (isChampionshipRound) {
    roundLabel.textContent = "决赛 · " + State.totalCount + "人";
    statusHint.textContent = doubleElimPending
      ? "🏆 决赛！拖拽至中央 [决赛] 方框（剩余 <4 人，双败未触发）"
      : "🏆 决赛！拖拽胜者至中央 [决赛] 方框";
  } else {
    roundLabel.textContent = "第" + (currentRound + 1) + "轮 · " + State.totalCount + "人";
    if (!draggableExists()) {
      statusHint.textContent = completed >= totalMatches
        ? "所有比赛已完成"
        : "等待双方就位后拖拽胜者晋级";
    } else {
      statusHint.textContent = doubleElimPending
        ? "拖拽胜者至内侧 [TBD] 方框以晋级（四强时自动切换双败赛）"
        : "拖拽胜者至内侧 [TBD] 方框以晋级";
    }
  }
}

/**
 * 双败赛专用状态提示
 */
function updateDoubleElimStatus(statusHint, roundLabel) {
  const wf = State.nodeById["WF_2_0"];
  const lf = State.nodeById["LF_2_0"];
  const champ = State.nodeById["CHAMPION"];
  const lb1 = State.nodeById["LB_1_0"];
  const wl1 = State.nodeById["WL_1_0"];
  const wr1 = State.nodeById["WR_1_0"];
  const ll0 = State.nodeById["LL_0"];
  const ll1 = State.nodeById["LL_1"];
  const wfDrop = State.nodeById["WF_DROP"];

  // 各阶段就绪检查
  const wfReady = wl1 && wl1.state === "occupied" && wr1 && wr1.state === "occupied";
  const lbReady = ll0 && ll0.state === "occupied" && ll1 && ll1.state === "occupied";
  const lfReady = lb1 && lb1.state === "occupied" && wfDrop && wfDrop.state === "occupied";
  const grandFinalReady = wf && wf.state === "occupied" && lf && lf.state === "occupied";
  const resetNeeded = State.doubleElimResetDone && grandFinalReady;

  if (resetNeeded) {
    roundLabel.textContent = "双败赛 · 总决赛加赛";
    statusHint.textContent = "\u2694\uFE0F 加赛决胜局！双方各一败，拖拽胜者至中央 [决赛] 方框";
    return;
  }

  // 第一轮：半决赛
  if (!wl1 || wl1.state === "pending" || !wr1 || wr1.state === "pending") {
    roundLabel.textContent = "双败赛 · 半决赛";
    if (!wl1 || wl1.state === "pending") {
      statusHint.textContent = "\uD83D\uDCCB 第一轮：拖拽左侧 (A vs B) 胜者至上方方框";
    } else {
      statusHint.textContent = "\uD83D\uDCCB 第一轮：拖拽右侧 (C vs D) 胜者至上方方框";
    }
    return;
  }

  // 第二轮：胜者组决赛 + 败者组第一轮
  if (!wf || wf.state === "pending") {
    roundLabel.textContent = "双败赛 · 胜者组决赛";
    if (wfReady) {
      statusHint.textContent = "\uD83D\uDCCB 第二轮：拖拽胜者进入 [胜决] 方框（败者自动进入败者组）";
    } else {
      statusHint.textContent = "\uD83D\uDCCB 胜者组决赛即将开始…";
    }
    return;
  }

  // WF 已确定，检查败者组
  if (!lb1 || lb1.state === "pending") {
    roundLabel.textContent = "双败赛 · 败者组第一轮";
    statusHint.textContent = lbReady
      ? "\uD83D\uDCCB 第二轮：拖拽败者组胜者至 [TBD] 方框"
      : "\uD83D\uDCCB 等待双方败者就位…";
    return;
  }

  // 第三轮：败者组决赛
  if (!lf || lf.state === "pending") {
    roundLabel.textContent = "双败赛 · 败者组决赛";
    statusHint.textContent = lfReady
      ? "\uD83D\uDCCB 第三轮：拖拽胜者进入 [败决] 方框"
      : "\uD83D\uDCCB 等待双方选手就位（胜者组败者 + 败者组胜者）";
    return;
  }

  // 第四轮：总决赛
  if (grandFinalReady) {
    roundLabel.textContent = "双败赛 · 总决赛";
    statusHint.textContent = "\uD83C\uDFC6 第四轮：拖拽胜者至中央 [决赛] 方框！（若败者组冠军胜出将触发加赛）";
    return;
  }

  roundLabel.textContent = "双败赛 · 进行中";
  statusHint.textContent = "等待各轮次选手就位";
}

function findCurrentRound() {
  for (let r = 1; r <= State.n + 1; r++) {
    const nodes = State.nodes.filter(n => n.round === r && (n.type === "winner" || n.type === "champion"));
    if (nodes.some(n => n.state === "pending" || n.state === "in_progress")) return r - 1;
    if (nodes.length > 0 && nodes.every(n => n.state === "occupied")) continue;
    return r - 1;
  }
  return State.n;
}

function draggableExists() {
  return State.nodes.some(n => canBeDragged(n));
}

/* =================================================================
 *  音乐抽取 & 比赛模式
 * ================================================================= */
let musicRolling = null;
let lastDrawnMusic = null;
let lastDrawnMusicSource = null; // "1yearplus" 或 "1yearminus"
let battleActive = false;

/** 构建带来源标记的音乐列表（遵循当前 musicSource 选择） */
function getTaggedMusicList() {
  const tagged = [];
  if (State.musicSource === "old") {
    (State.music.oldList || []).forEach(name => tagged.push({ name, source: "1yearplus" }));
  } else if (State.musicSource === "new") {
    (State.music.newList || []).forEach(name => tagged.push({ name, source: "1yearminus" }));
  } else if (State.musicSource === "ex") {
    (State.music.exList || []).forEach(name => tagged.push({ name, source: "1yearplus_ex" }));
  }
  return tagged;
}

function drawMusic() {
  const list = getTaggedMusicList();
  if (list.length === 0) {
    showHint("音乐列表为空");
    return;
  }

  const display = document.getElementById("music-display");
  const drawBtn = document.getElementById("draw-music-btn");
  const startBtn = document.getElementById("start-battle-btn");

  // 禁用按钮防止重复点击
  drawBtn.disabled = true;
  startBtn.disabled = true;
  display.classList.add("rolling");

  let ticks = 0;
  const TOTAL_TICKS = 40; // ~2 秒 (40 × 50ms)
  let currentIdx = 0;

  // 随机种子决定最终结果
  const finalIdx = Math.floor(Math.random() * list.length);
  const finalItem = list[finalIdx];

  musicRolling = setInterval(() => {
    ticks++;
    if (ticks < TOTAL_TICKS) {
      // 滚动阶段：快速切换显示
      currentIdx = (currentIdx + 1) % list.length;
      display.textContent = list[currentIdx].name;
    } else {
      // 结束：停在最终结果
      clearInterval(musicRolling);
      musicRolling = null;
      lastDrawnMusic = finalItem.name;
      lastDrawnMusicSource = finalItem.source;
      display.textContent = lastDrawnMusic;
      display.classList.remove("rolling");
      display.classList.add("selected");
      drawBtn.disabled = false;
      startBtn.disabled = false;
    }
  }, 50);
}

function startBattle() {
  if (!lastDrawnMusic) return;

  // 根据来源使用正确子目录路径
  const folder = lastDrawnMusicSource || "1yearplus";
  const musicPath = "../resource/musics/" + folder + "/" + lastDrawnMusic;
  const player = document.getElementById("music-player");
  player.src = musicPath;
  player.play().catch(() => {});

  // 音乐播放完毕后自动退出比赛模式
  player.onended = () => {
    if (battleActive) exitBattle();
  };

  // 进入比赛模式
  battleActive = true;
  document.body.classList.add("battle-mode");

  // 根据设置决定是否保留背景图
  if (State.battleKeepBg) {
    document.body.classList.add("battle-keep-bg");
  }
}

function exitBattle() {
  // 停止音乐
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  player.onended = null;

  // 退出比赛模式
  battleActive = false;
  document.body.classList.remove("battle-mode");
  document.body.classList.remove("battle-keep-bg");

  // 恢复按钮状态（保留上次抽取的音乐）
  const startBtn = document.getElementById("start-battle-btn");
  const drawBtn = document.getElementById("draw-music-btn");
  drawBtn.disabled = false;
  startBtn.disabled = !!lastDrawnMusic ? false : true;

  // 强制重新渲染选手树（比赛模式中 app-wrapper 被 display:none，退出后需重绘）
  recomputeLayout();
  renderAll();
}

/** 切换音乐库 */
function switchMusicSource(source) {
  if (State.musicSource === source) return;
  State.musicSource = source;

  document.getElementById("switch-music-old-btn").classList.toggle("active", source === "old");
  document.getElementById("switch-music-new-btn").classList.toggle("active", source === "new");
  document.getElementById("switch-music-ex-btn").classList.toggle("active", source === "ex");

  // 清除上次抽取的音乐（曲库变了）
  lastDrawnMusic = null;
  lastDrawnMusicSource = null;
  const display = document.getElementById("music-display");
  display.textContent = "—";
  display.classList.remove("rolling", "selected");
  document.getElementById("start-battle-btn").disabled = true;

  showHint("已切换到" + (source === "old" ? "1year+" : source === "new" ? "1year-" : "1year+EX") + " 曲库");
}

/* =================================================================
 *  初始化
 * ================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  canvasEl = document.getElementById("canvas");
  nodesLayer = document.getElementById("nodes-layer");
  svgEl = document.getElementById("lines-svg");

  // 加载比赛背景图设置
  const keepBg = localStorage.getItem("dragBattleKeepBg");
  if (keepBg !== null) State.battleKeepBg = keepBg !== "false";

  // 加载双败赛设置
  const doubleElim = localStorage.getItem("dragDoubleElim");
  if (doubleElim !== null) State.doubleElim = doubleElim === "true";

  // 控制按钮
  document.getElementById("switch-player1-btn").addEventListener("click", () => switchPlayerSource("player1"));
  document.getElementById("switch-player2-btn").addEventListener("click", () => switchPlayerSource("player2"));
  document.getElementById("shuffle-btn").addEventListener("click", shufflePlayers);
  document.getElementById("reset-game-btn").addEventListener("click", handleReset);
  document.getElementById("setting-btn").addEventListener("click", () => { window.location.href = "../html/setting.html"; });
  document.getElementById("home-btn").addEventListener("click", () => { window.location.href = "../html/index.html"; });

  // 启动弹窗: 读取/同步双败开关
  const modalToggle = document.getElementById("modal-double-elim-toggle");
  const modalOverlay = document.getElementById("startup-modal");
  if (modalToggle && modalOverlay) {
    // 与设置页同步
    const savedDE = localStorage.getItem("dragDoubleElim");
    modalToggle.checked = savedDE === "true";
    State.doubleElim = modalToggle.checked;

    // 开关变化 → 写入 localStorage + 服务器
    modalToggle.addEventListener("change", () => {
      const val = modalToggle.checked;
      State.doubleElim = val;
      localStorage.setItem("dragDoubleElim", String(val));
      fetch("http://localhost:3000/api/drag-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doubleElim: val }),
      }).catch(() => {});
    });

    // 关闭弹窗
    document.getElementById("modal-close-btn").addEventListener("click", () => {
      modalOverlay.classList.add("closed");
    });
  }

  // 音乐库切换按钮
  document.getElementById("switch-music-old-btn").addEventListener("click", () => switchMusicSource("old"));
  document.getElementById("switch-music-new-btn").addEventListener("click", () => switchMusicSource("new"));
  document.getElementById("switch-music-ex-btn").addEventListener("click", () => switchMusicSource("ex"));

  // 音乐抽取 & 比赛按钮
  document.getElementById("draw-music-btn").addEventListener("click", drawMusic);
  document.getElementById("start-battle-btn").addEventListener("click", startBattle);

  // 双击退出比赛模式
  document.addEventListener("dblclick", (e) => {
    if (battleActive) exitBattle();
  });

  // 窗口大小变化重渲染
  window.addEventListener("resize", debounce(() => {
    if (!canvasEl) return;
    recomputeLayout();
    renderAll();
  }, 150));

  // 加载数据（顺序：设置→选手→尝试恢复存档→验校重建）
  loadSettings()
    .then(() => Promise.all([loadPlayers(), loadMusic()]))
    .then(() => {
      const loadedSource = State.playerSource;
      loadStateFromServer().then(ok => {
        if (!ok) loadLocalState(State.playerSource);

        // 验校：恢复的存档是否与当前选手源/人数兼容
        const sourceChanged = State.playerSource !== loadedSource;
        const restoredCount = State.totalCount;
        const actualAvailable = State.allPlayers.length;
        const needRebuild = sourceChanged ||
          State.nodes.length === 0 ||
          restoredCount > actualAvailable ||
          restoredCount !== Math.pow(2, Math.ceil(Math.log2(restoredCount)));

        if (needRebuild) {
          // 存档不可用或选手源已切换 → 重新构建
          State.playerSource = loadedSource;
          State.totalCount = actualAvailable;
          buildOrResetBracket();
          document.getElementById("switch-player1-btn").classList.toggle("active", State.playerSource === "player1");
          document.getElementById("switch-player2-btn").classList.toggle("active", State.playerSource === "player2");
        }

        // 双败赛恢复：若已激活，只重新计算布局，不要 rebuild
        if (State.doubleElimActive) {
          recomputeDoubleElimLayout();
        }
        // 旧存档可能包含 LL_0 节点但未标记 doubleElimActive，需重建
        else if (State.nodeById["LL_0"]) {
          buildOrResetBracket();
        }

        recomputeLayout();
        renderAll();
      });
    });
});

/* =================================================================
 *  重置
 * ================================================================= */
function handleReset() {
  if (!confirm("确定要重置比赛？所有进度将丢失。")) return;

  // 清除当前选手源的已保存状态
  localStorage.removeItem(storageKey());
  fetch(API_CLEAR_URL, { method: "POST" }).catch(() => {});

  State.music.current = null;

  // 重置音乐与比赛状态
  if (musicRolling) { clearInterval(musicRolling); musicRolling = null; }
  lastDrawnMusic = null;
  lastDrawnMusicSource = null;
  battleActive = false;
  document.body.classList.remove("battle-mode");
  document.body.classList.remove("battle-keep-bg");
  const player = document.getElementById("music-player");
  player.pause();
  player.currentTime = 0;
  player.onended = null;
  const musicDisplay = document.getElementById("music-display");
  musicDisplay.textContent = "—";
  musicDisplay.classList.remove("rolling", "selected");
  document.getElementById("draw-music-btn").disabled = false;
  document.getElementById("start-battle-btn").disabled = true;

  // 重新加载选手（恢复被双败过渡截断的完整名单），接着重建对阵
  loadPlayers().then(() => {
    buildOrResetBracket();
    saveState();
    recomputeLayout();
    renderAll();
    showHint("已重置");
  });
}

/* =================================================================
 *  持久化
 * ================================================================= */
const API_URL = "http://localhost:3000/api/drag-process";
const API_CLEAR_URL = "http://localhost:3000/api/clear-drag-process";

/** 返回带选手源前缀的存储 key，确保两组选手进度独立 */
function storageKey(source) {
  return "dragBattleState2_" + (source || State.playerSource);
}

function getPersisted() {
  return {
    playerSource: State.playerSource,
    totalCount: State.totalCount,
    allPlayers: State.allPlayers,
    n: State.n,
    nodes: State.nodes.map(n => ({
      id: n.id, type: n.type, side: n.side, round: n.round, index: n.index,
      playerName: n.playerName, state: n.state, parentIds: n.parentIds,
      childId: n.childId, badge: n.badge, autoBye: n.autoBye,
    })),
    championId: State.championId,
    phase: State.phase,
    undoStack: State.undoStack,
    music: { current: State.music.current },
    doubleElimActive: State.doubleElimActive,
    doubleElimResetDone: State.doubleElimResetDone,
  };
}

function saveState() {
  const data = getPersisted();
  try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch (e) {}
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, lastUpdate: new Date().toISOString() }),
  }).catch(() => {});
}

function loadLocalState(source) {
  try {
    const raw = localStorage.getItem(storageKey(source));
    if (!raw) return;
    restoreState(JSON.parse(raw));
  } catch (e) {}
}

function loadStateFromServer() {
  return fetch(API_URL)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.nodes || data.nodes.length === 0) return false;
      // 服务器只存一份，验证选手源是否匹配
      if (data.playerSource && data.playerSource !== State.playerSource) return false;
      restoreState(data);
      return true;
    })
    .catch(() => false);
}

function restoreState(data) {
  State.playerSource = data.playerSource || "player1";
  State.totalCount = data.totalCount || 8;
  State.n = data.n || 3;
  State.phase = data.phase || "playing";
  State.undoStack = data.undoStack || [];
  State.music.current = data.music?.current || null;
  State.doubleElimActive = data.doubleElimActive || false;
  State.doubleElimResetDone = data.doubleElimResetDone || false;

  State.nodes = (data.nodes || []).map(n => ({
    id: n.id, type: n.type, side: n.side, round: n.round, index: n.index,
    playerName: n.playerName, state: n.state, parentIds: n.parentIds || [],
    childId: n.childId, badge: n.badge, autoBye: n.autoBye,
    x: 0, y: 0,
  }));

  State.nodeById = {};
  State.nodes.forEach(n => { State.nodeById[n.id] = n; });
  State.championId = data.championId || null;

  document.getElementById("switch-player1-btn").classList.toggle("active", State.playerSource === "player1");
  document.getElementById("switch-player2-btn").classList.toggle("active", State.playerSource === "player2");
}

/* =================================================================
 *  工具函数
 * ================================================================= */
function truncateName(name) {
  if (!name) return "";
  return name.length > 10 ? name.substring(0, 9) + "…" : name;
}

function showError(msg) {
  const bar = document.getElementById("error-bar");
  document.getElementById("error-msg").textContent = msg;
  bar.classList.remove("hidden");
}

function hideError() {
  document.getElementById("error-bar").classList.add("hidden");
}

function showHint(msg) {
  const hint = document.getElementById("status-hint");
  hint.textContent = msg;
  setTimeout(() => {
    if (hint.textContent === msg) updateStatus();
  }, 3000);
}

function showTooltip(x, y, msg) {
  const tt = document.getElementById("tooltip");
  tt.textContent = msg;
  tt.style.left = x + "px";
  tt.style.top = y + "px";
  tt.classList.remove("hidden");
}

function hideTooltip() {
  document.getElementById("tooltip").classList.add("hidden");
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
