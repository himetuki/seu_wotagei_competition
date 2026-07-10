/**
 * Drag式比赛 — 拖拽交互 & 晋级/撤销逻辑
 */

/* =================================================================
 *  拖拽判定
 * ================================================================= */
function canBeDragged(node) {
  if (node.state !== "occupied") return false;
  if (!node.childId) return false;
  const child = State.nodeById[node.childId];
  if (!child) return false;

  if (State.doubleElimActive) return true;

  const parentCount = child.parentIds.length;
  if (parentCount < 1 || parentCount > 2) return false;

  const parents = child.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  if (parents.length !== parentCount) return false;
  if (!parents.every(p => p.state === "occupied")) return false;

  if (child.state === "pending") return true;

  if (child.state === "occupied" && child.playerName !== node.playerName) {
    const otherParents = parents.filter(p => p.id !== node.id);
    return otherParents.length > 0 && otherParents.every(
      p => p.state === "advanced" && p.playerName === child.playerName
    );
  }

  return false;
}

function canBeDropTarget(node) {
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

  if (State.doubleElimActive) {
    dragData.doubleElimExtraTargets = [];
    ["LL_0", "LL_1"].forEach(id => {
      if (State.nodeById[id] && State.nodeById[id].state === "pending") {
        dragData.doubleElimExtraTargets.push(id);
      }
    });
    if (State.nodeById["WF_DROP"] && State.nodeById["WF_DROP"].state === "pending") {
      dragData.doubleElimExtraTargets.push("WF_DROP");
    }
  }

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", node.playerName);
  e.target.classList.add("dragging");

  const targetEl = document.getElementById("node-" + node.childId);
  if (targetEl) targetEl.classList.add("drop-target");

  if (dragData.doubleElimExtraTargets) {
    dragData.doubleElimExtraTargets.forEach(id => {
      const el = document.getElementById("node-" + id);
      if (el) el.classList.add("drop-target");
    });
  }
}

function onDragEnd(e) {
  e.target.classList.remove("dragging");
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
  const box = e.target.closest(".node-box");
  const toNodeId = box ? box.dataset.nodeId : e.target.dataset.nodeId;

  if (toNodeId === dragData.toId) {
    handleValidDrop(dragData.fromId, toNodeId);
    dragData = null;
    return;
  }

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

/* =================================================================
 *  晋级操作
 * ================================================================= */
function executeAdvance(fromNode, toNode) {
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

  if (State.doubleElimActive) {
    executeDoubleElimAutoAdvance(fromNode, toNode);
  }

  propagateAdvance(toNode);
  processByes();

  if (State.doubleElimActive && checkDoubleElimBracketReset(toNode)) {
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
 *  双败淘汰自动推进
 * ================================================================= */

/**
 * 双败赛自动推进:
 * 1. 叶子晋级到半决赛胜者槽 → 败者自动放入 LL_0/LL_1
 * 2. 半决赛胜者晋级到胜者组决赛 → 败者自动放入 WF_DROP
 */
function executeDoubleElimAutoAdvance(fromNode, toNode) {
  if ((fromNode.id === "L_0" || fromNode.id === "L_1") && toNode.id === "WL_1_0") {
    autoPlaceLoser(fromNode.id === "L_0" ? "L_1" : "L_0", "LL_0");
  }
  if ((fromNode.id === "R_0" || fromNode.id === "R_1") && toNode.id === "WR_1_0") {
    autoPlaceLoser(fromNode.id === "R_0" ? "R_1" : "R_0", "LL_1");
  }
  if (fromNode.id === "WL_1_0" && toNode.id === "WF_2_0") {
    autoPlaceLoser("WR_1_0", "WF_DROP");
  }
  if (fromNode.id === "WR_1_0" && toNode.id === "WF_2_0") {
    autoPlaceLoser("WL_1_0", "WF_DROP");
  }
}

function autoPlaceLoser(loserNodeId, targetNodeId) {
  const loser = State.nodeById[loserNodeId];
  const target = State.nodeById[targetNodeId];
  if (!loser || !target) return;
  if (loser.state !== "occupied" || !loser.playerName) return;
  if (target.state !== "pending") return;

  target.playerName = loser.playerName;
  target.state = "occupied";
  loser.state = "advanced";

  propagateAdvance(target);
  processByes();

  showHint("⚡ " + loser.playerName + " 自动进入败者组");
}

/**
 * 双败总决赛 bracket reset:
 * 若败者组冠军战胜胜者组冠军 → 双方各1败 → 加赛
 */
function checkDoubleElimBracketReset(toNode) {
  if (toNode.id !== "CHAMPION") return false;

  const wf = State.nodeById["WF_2_0"];
  const lf = State.nodeById["LF_2_0"];
  if (!wf || !lf) return false;

  if (toNode.playerName === lf.playerName && wf.state === "occupied" && wf.playerName) {
    if (State.doubleElimResetDone) {
      State.phase = "complete";
      showHint("🏆 总决赛加赛结束！冠军: " + toNode.playerName + "！");
      return false;
    }

    State.doubleElimResetDone = true;
    toNode.playerName = null;
    toNode.state = "pending";
    lf.state = "occupied";

    State.undoStack.pop();
    cascadeClear(toNode);

    saveState();
    renderAll();
    showHint("⚠️ 胜者组冠军「" + wf.playerName + "」首次失利！双方各一败，请加赛决定冠军！");
    return true;
  }
  return false;
}

/* =================================================================
 *  替换 & 传播 & 完成检查
 * ================================================================= */
function executeReplace(fromNode, toNode) {
  const otherParent = toNode.parentIds
    .map(id => State.nodeById[id])
    .find(p => p && p.id !== fromNode.id && p.state === "advanced");

  State.undoStack.push({
    fromId: fromNode.id, toId: toNode.id,
    prevFromState: fromNode.state, prevToState: toNode.state,
    prevToName: toNode.playerName,
    wasReplace: true,
    revertedId: otherParent ? otherParent.id : null,
  });

  if (otherParent) otherParent.state = "occupied";

  cascadeClear(toNode);
  toNode.playerName = null;
  toNode.state = "pending";

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

function propagateAdvance(node) {
  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child || child.state !== "pending") return;

  const parents = child.parentIds.map(id => State.nodeById[id]).filter(Boolean);
  if (parents.length === 2 &&
      parents[0].state === "occupied" && parents[1].state === "occupied") {
    child.state = "pending";
  }
}

function checkCompletion() {
  if (!State.championId) return;
  const champ = State.nodeById[State.championId];
  if (champ && champ.state === "occupied") {
    State.phase = "complete";
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
    tryUndoAdvance(node);
  } else if (node.state === "occupied" && node.type === "winner") {
    tryClearWinner(node);
  }
}

function tryUndoAdvance(node) {
  if (!node.childId) return;
  const child = State.nodeById[node.childId];
  if (!child) return;

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

  cascadeClear(child);
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
  processByes();

  State.phase = "playing";
  saveState();
  renderAll();
  showHint("已回退");
}

function cascadeClear(node) {
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
