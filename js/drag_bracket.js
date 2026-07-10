/**
 * Drag式比赛 — 对阵树构建 (标准淘汰赛 + 四强双败)
 */

/* =================================================================
 *  坐标计算引擎
 * ================================================================= */
function recomputeLayout() {
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  containerW = rect.width;
  containerH = rect.height;
  if (containerW === 0 || containerH === 0) return;
  GU = containerW / GU_RATIO;
  boxW = BOX_W_GU * GU;
  boxH = BOX_H_GU * GU;
}

function nodeCenter(side, round, verticalIdxInRound, nodesPerSideThisRound) {
  const totalY = containerH - 2 * GU;
  const spacing = totalY / (nodesPerSideThisRound + 1);
  const yCenter = GU + (verticalIdxInRound + 1) * spacing;

  if (side === "left") {
    return { x: round * ROUND_STEP_GU * GU + boxW / 2, y: yCenter };
  } else if (side === "right") {
    return { x: containerW - round * ROUND_STEP_GU * GU - boxW / 2, y: yCenter };
  } else {
    return { x: containerW / 2, y: containerH / 2 };
  }
}

function winnerY(parent1, parent2) {
  return (parent1.y + parent2.y) / 2;
}

/* =================================================================
 *  标准淘汰赛对阵表
 * ================================================================= */
function buildBracket() {
  const total = State.totalCount;
  const players = State.allPlayers.slice(0, total);
  State.n = Math.ceil(Math.log2(total));
  const fullSlots = Math.pow(2, State.n);
  const perSide = fullSlots / 2;

  const padded = [...players];
  while (padded.length < fullSlots) padded.push(null);

  State.nodes = [];
  State.nodeById = {};
  State.championId = null;

  // 叶子层
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

  // 递归构建胜者层
  let currentRoundNodes = { left: [...leftLeaves], right: [...rightLeaves] };
  const sideKeys = ["left", "right"];

  for (let r = 1; r < State.n; r++) {
    const nextRound = { left: [], right: [] };
    const perSideThisRound = currentRoundNodes.left.length / 2;

    for (const side of sideKeys) {
      const parents = currentRoundNodes[side];
      for (let i = 0; i < parents.length; i += 2) {
        const p1 = parents[i], p2 = parents[i + 1];
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
        p1.childId = id; p2.childId = id;
        nextRound[side].push(wNode);
        State.nodes.push(wNode);
        State.nodeById[id] = wNode;
      }
    }
    currentRoundNodes = nextRound;
  }

  // 冠军节点
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

function buildOrResetBracket() {
  State.nodes = [];
  State.nodeById = {};
  State.championId = null;
  State.undoStack = [];
  State.phase = "playing";
  State.doubleElimActive = false;
  State.doubleElimResetDone = false;

  const savedTotal = localStorage.getItem("dragTotalCount");
  if (savedTotal) State.totalCount = Math.max(2, parseInt(savedTotal) || 8);
  if (State.allPlayers.length > State.totalCount) {
    State.allPlayers = State.allPlayers.slice(0, State.totalCount);
  }

  buildBracket();
  processByes();
  applyDoubleElimBadges();
}

function processByes() {
  // 双败淘汰赛中不存在轮空，LL_*/WF_DROP 等空槽是在等对手就位，不是 bye
  if (State.doubleElimActive) return;
  for (const node of State.nodes) {
    if (node.state !== "pending" || node.parentIds.length < 2) continue;
    const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);
    if (parents.length !== 2) continue;

    const p1occ = parents[0].state === "occupied" && parents[0].playerName;
    const p2occ = parents[1].state === "occupied" && parents[1].playerName;
    const p1IsEmptyLeaf = parents[0].type === "leaf" && parents[0].state === "pending" && !parents[0].playerName;
    const p2IsEmptyLeaf = parents[1].type === "leaf" && parents[1].state === "pending" && !parents[1].playerName;

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
 *  四强 → 双败淘汰过渡
 * ================================================================= */
function applyDoubleElimBadges() {
  const activeNodes = State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  );
  if (activeNodes.length === 4) {
    activeNodes.forEach(n => { n.badge = "W"; });
  }
}

function getActivePlayerCount() {
  return State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  ).length;
}

function checkDoubleElimTransition() {
  if (!State.doubleElim) return false;
  if (State.doubleElimActive) return false;
  if (getActivePlayerCount() !== 4) return false;
  transitionToDoubleElim();
  return true;
}

function transitionToDoubleElim() {
  const activeNodes = State.nodes.filter(n =>
    n.state === "occupied" && n.playerName &&
    n.childId && State.nodeById[n.childId]?.state === "pending"
  );
  if (activeNodes.length !== 4) return;

  State.allPlayers = activeNodes.map(n => n.playerName);
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
 *
 *  结构:
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
 * 标准四强双败流程 (4 轮交互，败者自动进位):
 *   第一轮 半决赛:   L_0 vs L_1 → 胜者→WL_1_0, 败者→LL_0 (自动)
 *                    R_0 vs R_1 → 胜者→WR_1_0, 败者→LL_1 (自动)
 *   第二轮 胜决+败R1: WL_1_0 vs WR_1_0 → 胜者→WF_2_0, 败者→WF_DROP (自动)
 *                    LL_0 vs LL_1 → 胜者→LB_1_0, 败者→淘汰(第4名)
 *   第三轮 败者组决赛: LB_1_0 vs WF_DROP → 胜者→LF_2_0, 败者→淘汰(第3名)
 *   第四轮 总决赛:     WF_2_0 vs LF_2_0 → CHAMPION
 *                     (若 LF 胜则加赛: 双方各1败, 再次对决)
 * ================================================================= */
function buildDoubleElimBracket() {
  const players = State.allPlayers.slice(0, 4);
  State.n = 2;
  State.nodes = [];
  State.nodeById = {};

  // 胜者组叶子
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
      parentIds: [], childId: null, x: 0, y: 0, badge: null,
    };
    State.nodes.push(node);
    State.nodeById[node.id] = node;
  }

  // 胜者组 R1
  const wl1 = createDoubleElimWinner("WL_1_0", "left", 1, 0, ["L_0", "L_1"]);
  const wr1 = createDoubleElimWinner("WR_1_0", "right", 1, 0, ["R_0", "R_1"]);
  State.nodeById["L_0"].childId = "WL_1_0";
  State.nodeById["L_1"].childId = "WL_1_0";
  State.nodeById["R_0"].childId = "WR_1_0";
  State.nodeById["R_1"].childId = "WR_1_0";

  // 胜者组 R2
  const wf = createDoubleElimWinner("WF_2_0", "center", 2, 0, ["WL_1_0", "WR_1_0"]);
  wl1.childId = "WF_2_0";
  wr1.childId = "WF_2_0";

  // 败者组输入叶子
  for (const ll of [{ id: "LL_0", index: 0 }, { id: "LL_1", index: 1 }]) {
    const node = {
      id: ll.id, type: "leaf", side: "losers", round: 0, index: ll.index,
      playerName: null, state: "pending",
      parentIds: [], childId: null, x: 0, y: 0, badge: null,
    };
    State.nodes.push(node);
    State.nodeById[node.id] = node;
  }

  // 败者组 R1
  const lb1 = createDoubleElimWinner("LB_1_0", "losers", 1, 0, ["LL_0", "LL_1"]);
  State.nodeById["LL_0"].childId = "LB_1_0";
  State.nodeById["LL_1"].childId = "LB_1_0";

  // WF 败者接收槽
  const wfDrop = {
    id: "WF_DROP", type: "leaf", side: "losers", round: 0, index: 2,
    playerName: null, state: "pending",
    parentIds: [], childId: null, x: 0, y: 0, badge: null,
  };
  State.nodes.push(wfDrop);
  State.nodeById["WF_DROP"] = wfDrop;

  // 败者组决赛
  const lf = createDoubleElimWinner("LF_2_0", "center", 2, 0, ["LB_1_0", "WF_DROP"]);
  lb1.childId = "LF_2_0";
  wfDrop.childId = "LF_2_0";

  // 总决赛
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
    parentIds: parentIds, childId: null,
    x: 0, y: 0, badge: null,
  };
  State.nodes.push(node);
  State.nodeById[id] = node;
  return node;
}

function recomputeDoubleElimLayout() {
  if (!canvasEl) return;
  const w = containerW, h = containerH;
  if (w === 0 || h === 0) return;

  const wTop = h * 0.22;
  const wBot = h * 0.38;
  const lTop = h * 0.65;
  const lBot = h * 0.78;
  const lfY = (lTop + lBot) / 2 + h * 0.08;
  const wfY = (wTop + wBot) / 2;
  const champY = (wfY + lfY) / 2;

  const positions = {
    L_0: { x: w * 0.04, y: wTop },
    L_1: { x: w * 0.04, y: wBot },
    R_0: { x: w * 0.96, y: wTop },
    R_1: { x: w * 0.96, y: wBot },
    WL_1_0: { x: w * 0.16, y: wfY },
    WR_1_0: { x: w * 0.84, y: wfY },
    WF_2_0: { x: w * 0.38, y: wfY },
    LL_0: { x: w * 0.08, y: lTop },
    LL_1: { x: w * 0.08, y: lBot },
    LB_1_0: { x: w * 0.22, y: (lTop + lBot) / 2 },
    WF_DROP: { x: w * 0.38, y: lBot },
    LF_2_0: { x: w * 0.53, y: lfY },
    CHAMPION: { x: w * 0.73, y: champY },
  };

  for (const node of State.nodes) {
    const pos = positions[node.id];
    if (pos) { node.x = pos.x; node.y = pos.y; }
  }
}
