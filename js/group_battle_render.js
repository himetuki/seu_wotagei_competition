/**
 * 团体赛 - 第一大轮（初赛）
 * 渲染函数
 */

function renderAll() {
  renderVisibility();
  renderStatus();
  renderUnassigned();
  renderGroups();
  renderTrickPool();
  renderArena();
  renderActions();
  renderHistory();
}

function renderVisibility() {
  const p = GBState.phase;
  DOM.unassignedSection.classList.toggle("hidden", p !== "assigning");
  DOM.trickPoolSection.classList.toggle(
    "hidden",
    p === "assigning" ||
      p === "selecting_groups" ||
      p === "finished" ||
      !GBState.currentMatch.firstTrickLocked,
  );
  DOM.musicInfoSection.classList.toggle(
    "hidden",
    p === "assigning" || p === "selecting_groups",
  );
  DOM.battleArena.classList.toggle(
    "hidden",
    p !== "selecting_players" &&
      p !== "ready_to_battle" &&
      p !== "music_drawn" &&
      p !== "battling" &&
      p !== "selecting_winner_anim" &&
      p !== "selecting_next_challenger" &&
      p !== "match_end" &&
      p !== "music_playing",
  );
}

function renderStatus() {
  DOM.bracketStatus.textContent = "第一大轮 - 初赛";
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  const match = GBState.currentMatch;
  let hint = "";
  switch (GBState.phase) {
    case "assigning":
      hint = "请将12名成员分配到4个组中（每组3人）";
      break;
    case "selecting_groups":
      hint =
        "请选择对战的两个组" +
        (pending
          ? "（" +
            GBState.groups[pending.g1].id +
            "组 vs " +
            GBState.groups[pending.g2].id +
            "组）"
          : "");
      break;
    case "selecting_players":
      hint = "请从两组中各选1名出战选手（再次点击可回归）";
      break;
    case "ready_to_battle":
      if (match.defender && match.challenger) {
        hint = "选手已就位，可继续更改选手或点击「抽取音乐」";
      } else {
        hint = "请从两组中各选1名出战选手";
      }
      break;
    case "music_drawn":
      hint = "已抽取音乐，可更改选手（将重新抽取）或点击「开始比赛」";
      break;
    case "music_playing":
      hint = "音乐播放中，双击屏幕结束播放";
      break;
    case "battling":
      hint = "对战开始！请点击胜者";
      break;
    case "selecting_winner_anim":
      hint = "结果确认中...";
      break;
    case "selecting_next_challenger":
      hint =
        GBState.groups[GBState.currentMatch.nextChallengerGroupIdx].id +
        "组请派出下一位挑战者";
      break;
    case "match_end":
      hint = "本场结束";
      break;
    default:
      hint = "...";
  }
  DOM.systemHint.textContent = hint;

  if (match.defender && match.challenger) {
    const musicLibName = getMusicLibName();
    const drawnMusic = match.drawnMusic || "-";
    updateMusicInfo(drawnMusic, musicLibName);
  } else {
    updateMusicInfo("-", "");
  }
}

function renderUnassigned() {
  DOM.unassignedPool.innerHTML = "";
  GBState.unassigned.forEach((name) => {
    const el = document.createElement("div");
    el.className = "member-chip";
    if (GBState.selectedMember === name) el.classList.add("selected");
    el.textContent = name;
    DOM.unassignedPool.appendChild(el);
  });
}

function renderGroups() {
  DOM.groupsGrid.innerHTML = "";
  const match = GBState.currentMatch;
  const activeIdxs =
    match.group1Idx !== null && match.group2Idx !== null
      ? [match.group1Idx, match.group2Idx]
      : [];

  GBState.groups.forEach((group, idx) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.id = "group-card-" + idx;
    card.dataset.groupIdx = idx;

    if (
      GBState.phase !== "assigning" &&
      activeIdxs.length > 0 &&
      !activeIdxs.includes(idx)
    ) {
      card.classList.add("hidden");
    }
    if (group.status === "eliminated") card.classList.add("eliminated");

    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent =
      "Group " + group.id + " (" + group.wins + "胜 " + group.losses + "负)";
    card.appendChild(title);

    const membersDiv = document.createElement("div");
    membersDiv.className = "group-members";
    group.members.forEach((member) => {
      const el = document.createElement("div");
      el.className = "member-name";
      el.textContent = member;
      if (group.eliminated.includes(member)) {
        el.classList.add("eliminated");
        if (canRevive(member)) {
          const reviveBtn = document.createElement("button");
          reviveBtn.textContent = "复活";
          reviveBtn.className = "revive-btn";
          reviveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleRevive(idx, member);
          });
          el.appendChild(reviveBtn);
        }
      }
      if (
        match.defender &&
        match.defender.groupIdx === idx &&
        match.defender.playerName === member
      )
        el.classList.add("active-fighter");
      if (
        match.challenger &&
        match.challenger.groupIdx === idx &&
        match.challenger.playerName === member
      )
        el.classList.add("active-fighter");
      if (canSelectMember(idx, member)) {
        el.classList.add("selectable");
        el.addEventListener("click", (e) => handleMemberClick(idx, member, e));
      }
      membersDiv.appendChild(el);
    });
    card.appendChild(membersDiv);

    if (GBState.phase === "selecting_groups" && canSelectGroup(idx)) {
      card.classList.add("selectable-group");
      if (isRecommendedGroup(idx)) card.classList.add("recommended");
      if (selectedGroupIdxs.includes(idx)) card.classList.add("selected-group");
    }
    if (GBState.phase === "assigning") {
      card.classList.add("selectable-group");
    }

    DOM.groupsGrid.appendChild(card);
  });
}

function renderTrickPool() {
  DOM.trickPool.innerHTML = "";
  if (
    GBState.phase === "assigning" ||
    GBState.phase === "selecting_groups" ||
    GBState.phase === "finished"
  )
    return;
  const match = GBState.currentMatch;
  if (!match.firstTrickLocked) return;

  const info = document.createElement("p");
  info.style.color = "#888";
  info.style.fontSize = "0.85rem";
  info.style.marginBottom = "8px";
  info.textContent = "技池展示（第一大轮可参考，不强制选择）";
  DOM.trickPool.appendChild(info);

  GBState.trickPool.forEach((trick) => {
    const el = document.createElement("span");
    el.className = "trick-chip";
    el.textContent = trick;
    if (match.selectedTrick === trick) {
      el.classList.add("selected-trick");
    }
    el.addEventListener("click", () => {
      match.selectedTrick = trick;
      saveState();
      renderAll();
      showToast("已选择首个技：" + trick, "success");
    });
    DOM.trickPool.appendChild(el);
  });
}

function canSelectMember(groupIdx, playerName) {
  const group = GBState.groups[groupIdx];
  const match = GBState.currentMatch;
  if (
    match.defender &&
    match.defender.groupIdx === groupIdx &&
    match.defender.playerName === playerName
  )
    return true;
  if (
    match.challenger &&
    match.challenger.groupIdx === groupIdx &&
    match.challenger.playerName === playerName
  )
    return true;
  if (group.eliminated.includes(playerName)) return false;

  if (
    GBState.phase === "selecting_players" ||
    GBState.phase === "ready_to_battle" ||
    GBState.phase === "music_drawn"
  ) {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
  if (GBState.phase === "selecting_next_challenger") {
    return groupIdx === match.nextChallengerGroupIdx;
  }
  return false;
}

function canSelectGroup(idx) {
  if (GBState.phase !== "selecting_groups") return false;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return false;
  return idx === pending.g1 || idx === pending.g2;
}

function isRecommendedGroup(idx) {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  return pending ? idx === pending.g1 || idx === pending.g2 : false;
}

function renderArena() {
  const match = GBState.currentMatch;
  DOM.arenaPlayer1.classList.remove("winner-anim", "loser-anim", "filled");
  DOM.arenaPlayer2.classList.remove("winner-anim", "loser-anim", "filled");
  if (!match.defender && !match.challenger) {
    DOM.arenaPlayer1Name.textContent = "?";
    DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-";
    DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole1.textContent = "-";
    DOM.arenaRole2.textContent = "-";
    return;
  }
  if (match.defender) {
    DOM.arenaPlayer1Name.textContent = match.defender.playerName;
    DOM.arenaGroup1Label.textContent =
      GBState.groups[match.defender.groupIdx].id + "组";
    DOM.arenaRole1.textContent = "守擂者";
    DOM.arenaPlayer1.classList.add("filled");
  } else {
    DOM.arenaPlayer1Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-";
    DOM.arenaRole1.textContent = "-";
  }
  if (match.challenger) {
    DOM.arenaPlayer2Name.textContent = match.challenger.playerName;
    DOM.arenaGroup2Label.textContent =
      GBState.groups[match.challenger.groupIdx].id + "组";
    DOM.arenaRole2.textContent = "挑战者";
    DOM.arenaPlayer2.classList.add("filled");
  } else {
    DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole2.textContent = "-";
  }
}

function renderActions() {
  const p = GBState.phase;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.matchGroupsBtn.classList.toggle(
    "hidden",
    p !== "assigning" || GBState.unassigned.length > 0,
  );
  DOM.drawMusicBtn.classList.toggle(
    "hidden",
    p !== "ready_to_battle" &&
      p !== "music_drawn" &&
      p !== "music_playing" &&
      p !== "battling",
  );
  DOM.startBattleBtn.classList.toggle(
    "hidden",
    p !== "music_drawn" && p !== "music_playing" && p !== "battling",
  );
  DOM.clearWinnerBtn.disabled =
    p !== "battling" &&
    p !== "selecting_next_challenger" &&
    p !== "match_end" &&
    p !== "ready_to_battle" &&
    p !== "music_playing";
  DOM.resetMatchBtn.classList.toggle(
    "hidden",
    p !== "selecting_players" &&
      p !== "ready_to_battle" &&
      p !== "battling" &&
      p !== "selecting_next_challenger" &&
      p !== "match_end" &&
      p !== "music_drawn" &&
      p !== "music_playing",
  );
  DOM.nextMatchBtn.classList.toggle("hidden", p !== "match_end" || !pending);
  DOM.nextRoundBtn.classList.toggle("hidden", p !== "match_end" || !!pending);
}

function renderHistory() {
  DOM.matchHistory.innerHTML = "";
  GBState.bracket.completedMatches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const g1 = GBState.groups[m.group1].id;
    const g2 = GBState.groups[m.group2].id;
    const winner = GBState.groups[m.winner].id;
    item.textContent =
      g1 +
      "组 vs " +
      g2 +
      "组 -> " +
      winner +
      "组胜 (" +
      m.duelHistory.length +
      "场单挑)";
    DOM.matchHistory.appendChild(item);
  });
}
