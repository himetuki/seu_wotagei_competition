/**
 * Drag式比赛 — 渲染引擎 & 状态提示
 */

/* =================================================================
 *  渲染主入口
 * ================================================================= */
function renderAll() {
  recomputeLayout();

  if (State.doubleElimActive) {
    recomputeDoubleElimLayout();
  } else {
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

/* =================================================================
 *  节点渲染
 * ================================================================= */
function renderNodes() {
  nodesLayer.innerHTML = "";

  for (const node of State.nodes) {
    const el = document.createElement("div");
    el.className = "node-box";
    el.id = "node-" + node.id;
    el.dataset.nodeId = node.id;

    el.style.width = boxW + "px";
    el.style.height = boxH + "px";
    el.style.left = (node.x - boxW / 2) + "px";
    el.style.top = (node.y - boxH / 2) + "px";

    el.classList.add("state-" + node.state);

    if (node.playerName) {
      const displayName = truncateName(node.playerName);
      el.textContent = displayName;
      if (displayName !== node.playerName) el.title = node.playerName;
    } else if (node.state === "pending") {
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

    if (node.type === "champion") {
      el.classList.add("champion-slot");
    }

    if (node.badge) {
      const badge = document.createElement("span");
      badge.className = "badge " + (node.badge === "W" ? "w-badge" : "l-badge");
      badge.textContent = node.badge;
      el.appendChild(badge);
    }

    if (canBeDragged(node)) {
      el.classList.add("draggable");
      el.draggable = true;
      el.addEventListener("dragstart", onDragStart);
      el.addEventListener("dragend", onDragEnd);
    }

    if (node.state === "advanced" || node.state === "occupied") {
      el.addEventListener("dblclick", (e) => onDoubleClickNode(node, e));
    }

    if (canBeDropTarget(node)) {
      el.addEventListener("dragover", onDragOver);
      el.addEventListener("dragenter", onDragEnter);
      el.addEventListener("dragleave", onDragLeave);
      el.addEventListener("drop", onDrop);
    }

    nodesLayer.appendChild(el);
  }
}

/* =================================================================
 *  连线渲染
 * ================================================================= */
function renderLines() {
  svgEl.innerHTML = "";

  for (const node of State.nodes) {
    const parents = node.parentIds.map(id => State.nodeById[id]).filter(Boolean);

    if (parents.length >= 2) {
      const p1 = parents[0], p2 = parents[1];
      const mergeX = node.side === "left"
        ? p1.x + boxW / 2 + (node.x - boxW / 2 - p1.x - boxW / 2) * 0.4
        : p2.x - boxW / 2 - (p2.x - boxW / 2 - node.x - boxW / 2) * 0.4;
      const midY = (p1.y + p2.y) / 2;

      const colorClass = node.state === "pending"
        ? "pending-line" : (node.state === "occupied" ? "active-line" : "");

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

      const winLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      winLine.setAttribute("x1", mergeX);
      winLine.setAttribute("y1", midY);
      winLine.setAttribute("x2", node.side === "left" || node.side === "losers" ? node.x - boxW / 2 : node.x + boxW / 2);
      winLine.setAttribute("y2", node.y);
      if (colorClass) winLine.classList.add(colorClass);
      svgEl.appendChild(winLine);
    } else if (parents.length === 1) {
      const p = parents[0];
      const colorClass = node.state === "pending"
        ? "pending-line" : (node.state === "occupied" ? "active-line" : "");

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
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
 *  状态提示
 * ================================================================= */
function updateStatus() {
  const statusHint = document.getElementById("status-hint");
  const roundLabel = document.getElementById("round-label");

  const modeBadge = document.getElementById("mode-badge");
  if (modeBadge) {
    modeBadge.classList.toggle("hidden", !State.doubleElimActive);
  }

  if (State.phase === "complete") {
    const champ = State.championId ? State.nodeById[State.championId] : null;
    statusHint.textContent = "🏆 冠军: " + (champ ? champ.playerName : "—");
    roundLabel.textContent = "比赛结束";
    return;
  }

  if (State.doubleElimActive) {
    updateDoubleElimStatus(statusHint, roundLabel);
    return;
  }

  const championNode = State.championId ? State.nodeById[State.championId] : null;
  const isChampionshipRound = championNode &&
    championNode.state === "pending" &&
    championNode.parentIds.every(pid => {
      const p = State.nodeById[pid];
      return p && p.state === "occupied";
    });

  const totalMatches = State.nodes.filter(n => n.type === "winner" || n.type === "champion").length;
  const completed = State.nodes.filter(n => (n.type === "winner" || n.type === "champion") && n.state === "occupied").length;
  const currentRound = findCurrentRound();
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
        ? "所有比赛已完成" : "等待双方就位后拖拽胜者晋级";
    } else {
      statusHint.textContent = doubleElimPending
        ? "拖拽胜者至内侧 [TBD] 方框以晋级（四强时自动切换双败赛）"
        : "拖拽胜者至内侧 [TBD] 方框以晋级";
    }
  }
}

function updateDoubleElimStatus(statusHint, roundLabel) {
  const wf = State.nodeById["WF_2_0"];
  const lf = State.nodeById["LF_2_0"];
  const lb1 = State.nodeById["LB_1_0"];
  const wl1 = State.nodeById["WL_1_0"];
  const wr1 = State.nodeById["WR_1_0"];
  const ll0 = State.nodeById["LL_0"];
  const ll1 = State.nodeById["LL_1"];
  const wfDrop = State.nodeById["WF_DROP"];

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

  if (!wl1 || wl1.state === "pending" || !wr1 || wr1.state === "pending") {
    roundLabel.textContent = "双败赛 · 半决赛";
    statusHint.textContent = (!wl1 || wl1.state === "pending")
      ? "\uD83D\uDCCB 第一轮：拖拽左侧 (A vs B) 胜者至上方方框"
      : "\uD83D\uDCCB 第一轮：拖拽右侧 (C vs D) 胜者至上方方框";
    return;
  }

  if (!wf || wf.state === "pending") {
    roundLabel.textContent = "双败赛 · 胜者组决赛";
    statusHint.textContent = wfReady
      ? "\uD83D\uDCCB 第二轮：拖拽胜者进入 [胜决] 方框（败者自动进入败者组）"
      : "\uD83D\uDCCB 胜者组决赛即将开始…";
    return;
  }

  if (!lb1 || lb1.state === "pending") {
    roundLabel.textContent = "双败赛 · 败者组第一轮";
    statusHint.textContent = lbReady
      ? "\uD83D\uDCCB 第二轮：拖拽败者组胜者至 [TBD] 方框"
      : "\uD83D\uDCCB 等待双方败者就位…";
    return;
  }

  if (!lf || lf.state === "pending") {
    roundLabel.textContent = "双败赛 · 败者组决赛";
    statusHint.textContent = lfReady
      ? "\uD83D\uDCCB 第三轮：拖拽胜者进入 [败决] 方框"
      : "\uD83D\uDCCB 等待双方选手就位（胜者组败者 + 败者组胜者）";
    return;
  }

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
