/**
 * 团体赛 - 第三大轮（决赛）
 * 渲染函数
 */

function renderAll() {
  renderVisibility();
  renderStatus();
  renderGroups();
  renderArena();
  renderActions();
  renderHistory();
}

function renderVisibility() {
  const p = GBState.phase;
  DOM.battleArena.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "music_drawn" && p !== "battling" && p !== "selecting_winner_anim" && p !== "match_end" && p !== "music_playing");
  DOM.musicInfoSection.classList.toggle("hidden", p === "selecting_groups" || p === "loading");
}

function renderStatus() {
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.bracketStatus.textContent = pending ? "第三大轮 - " + pending.label : "第三大轮 - 结束";
  let hint = "";
  switch (GBState.phase) {
    case "loading": hint = "加载中..."; break;
    case "selecting_groups": hint = "请选择对战的两个组" + (pending ? "（" + GBState.groups[pending.g1].id + "组 vs " + GBState.groups[pending.g2].id + "组）" : ""); break;
    case "selecting_players": hint = "请从两组中各选1名出战选手（再次点击可回归）"; break;
    case "ready_to_battle": hint = "请点击「抽取音乐」"; break;
    case "music_drawn": hint = "请点击「开始比赛」开始对战"; break;
    case "music_playing": hint = "音乐播放中，双击屏幕结束播放"; break;
    case "battling": hint = "对战开始！请点击胜者  当前曲库：" + getMusicLibName(); break;
    case "selecting_winner_anim": hint = "结果确认中..."; break;
    case "match_end": hint = "本场结束"; break;
    default: hint = "...";
  }
  DOM.systemHint.textContent = hint;

  const match = GBState.currentMatch;
  if (match.defender && match.challenger) {
    const musicLibName = getMusicLibName();
    const drawnMusic = match.drawnMusic || "-";
    updateMusicInfo(drawnMusic, musicLibName);
  } else {
    updateMusicInfo("-", "");
  }
}

function renderGroups() {
  DOM.groupsGrid.innerHTML = "";
  const match = GBState.currentMatch;
  const activeIdxs = (match.group1Idx !== null && match.group2Idx !== null) ? [match.group1Idx, match.group2Idx] : [];
  GBState.groups.forEach((group, idx) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.id = "group-card-" + idx;
    card.dataset.groupIdx = idx;
    if (GBState.phase !== "loading" && GBState.phase !== "selecting_groups" && activeIdxs.length > 0 && !activeIdxs.includes(idx)) {
      card.classList.add("hidden");
    }
    if (group.status === "eliminated") card.classList.add("eliminated");
    const title = document.createElement("h3");
    title.className = "group-title";
    title.textContent = "Group " + group.id + " (" + group.wins + "胜 " + group.losses + "负)";
    card.appendChild(title);
    const membersDiv = document.createElement("div");
    membersDiv.className = "group-members";
    group.members.forEach((member) => {
      const el = document.createElement("div");
      el.className = "member-name";
      el.textContent = member;
      if (match.defender && match.defender.groupIdx === idx && match.defender.playerName === member) el.classList.add("active-fighter");
      if (match.challenger && match.challenger.groupIdx === idx && match.challenger.playerName === member) el.classList.add("active-fighter");
      if (canSelectMember(idx, member)) {
        el.classList.add("selectable");
        el.addEventListener("click", (e) => handleMemberClick(idx, member, e));
      }
      membersDiv.appendChild(el);
    });
    card.appendChild(membersDiv);
    if (GBState.phase === "selecting_groups" && canSelectGroup(idx)) {
      card.classList.add("selectable-group");
      if (selectedGroupIdxs.includes(idx)) card.classList.add("selected-group");
    }
    DOM.groupsGrid.appendChild(card);
  });
}

function canSelectMember(groupIdx, playerName) {
  const match = GBState.currentMatch;
  if (match.defender && match.defender.groupIdx === groupIdx && match.defender.playerName === playerName) return true;
  if (match.challenger && match.challenger.groupIdx === groupIdx && match.challenger.playerName === playerName) return true;
  if (GBState.phase === "selecting_players") {
    if (match.defender === null) return true;
    if (match.challenger === null) return groupIdx !== match.defender.groupIdx;
    return false;
  }
  return false;
}

function canSelectGroup(idx) {
  if (GBState.phase !== "selecting_groups") return false;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  if (!pending) return false;
  return idx === pending.g1 || idx === pending.g2;
}

function renderArena() {
  const match = GBState.currentMatch;
  DOM.arenaPlayer1.classList.remove("winner-anim", "loser-anim", "filled");
  DOM.arenaPlayer2.classList.remove("winner-anim", "loser-anim", "filled");
  if (!match.defender && !match.challenger) {
    DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaPlayer2Name.textContent = "?";
    DOM.arenaGroup1Label.textContent = "-"; DOM.arenaGroup2Label.textContent = "-";
    DOM.arenaRole1.textContent = "-"; DOM.arenaRole2.textContent = "-";
    return;
  }
  if (match.defender) {
    DOM.arenaPlayer1Name.textContent = match.defender.playerName;
    DOM.arenaGroup1Label.textContent = GBState.groups[match.defender.groupIdx].id + "组";
    DOM.arenaRole1.textContent = "选手1";
    DOM.arenaPlayer1.classList.add("filled");
  } else { DOM.arenaPlayer1Name.textContent = "?"; DOM.arenaGroup1Label.textContent = "-"; DOM.arenaRole1.textContent = "-"; }
  if (match.challenger) {
    DOM.arenaPlayer2Name.textContent = match.challenger.playerName;
    DOM.arenaGroup2Label.textContent = GBState.groups[match.challenger.groupIdx].id + "组";
    DOM.arenaRole2.textContent = "选手2";
    DOM.arenaPlayer2.classList.add("filled");
  } else { DOM.arenaPlayer2Name.textContent = "?"; DOM.arenaGroup2Label.textContent = "-"; DOM.arenaRole2.textContent = "-"; }
}

function renderActions() {
  const p = GBState.phase;
  const pending = GBState.bracket.pendingMatches.find((m) => !m.played);
  DOM.drawMusicBtn.classList.toggle("hidden", p !== "ready_to_battle" && p !== "music_drawn" && p !== "music_playing" && p !== "battling");
  DOM.startBattleBtn.classList.toggle("hidden", p !== "music_drawn" && p !== "music_playing" && p !== "battling");
  DOM.clearWinnerBtn.disabled = p !== "battling" && p !== "match_end" && p !== "ready_to_battle" && p !== "music_playing";
  DOM.resetMatchBtn.classList.toggle("hidden", p !== "selecting_players" && p !== "ready_to_battle" && p !== "battling" && p !== "match_end" && p !== "music_drawn" && p !== "music_playing");
  DOM.nextMatchBtn.classList.toggle("hidden", p !== "match_end" || !pending);
  DOM.finishBtn.classList.toggle("hidden", p !== "match_end" || !!pending);
}

function renderHistory() {
  DOM.matchHistory.innerHTML = "";
  GBState.bracket.completedMatches.forEach((m) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const g1 = GBState.groups[m.group1].id;
    const g2 = GBState.groups[m.group2].id;
    const winner = GBState.groups[m.winner].id;
    item.textContent = (m.label || "") + " " + g1 + "组 vs " + g2 + "组 -> " + winner + "组胜";
    DOM.matchHistory.appendChild(item);
  });
}
