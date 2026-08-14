const NODE_BASE_MS = 22_000;
const TYPE_INTERVAL_MS = 16;
const MAX_TOASTS = 2;
const MAX_ACTIONS = 40;
const CONTENT = window.BOMB_ROOM_CONTENT;
const VIDEO_MANIFEST = window.BOMB_ROOM_VIDEO_MANIFEST || { entries: {}, aliases: {}, basePath: "./assets/video/" };

if (!CONTENT) throw new Error("story-content.js 未加载");

const items = {
  fuse: { name: "备用保险丝", art: "fuse", hint: "配电箱" },
  card: { name: "识别卡", art: "card", hint: "读卡器" },
  crank: { name: "金属摇柄", art: "crank", hint: "液压孔" },
  pliers: { name: "剪线钳", art: "pliers", hint: "炸弹线路" },
  screwdriver: { name: "螺丝刀", art: "screwdriver", hint: "炸弹外壳" },
};

const focuses = {
  fuseBox: { label: "配电箱", accepts: ["fuse"] },
  cardReader: { label: "读卡器", accepts: ["card"] },
  hydraulicPort: { label: "液压孔", accepts: ["crank"] },
  bombWires: { label: "炸弹线路", accepts: ["pliers"] },
  bombShell: { label: "炸弹外壳", accepts: ["screwdriver"] },
  cabinet: { label: "器材柜", accepts: [] },
  door: { label: "防爆门", accepts: [] },
  controlRoom: { label: "观察控制室", accepts: [] },
};

const npcCards = {
  Maya: {
    traits: ["谨慎", "设备逻辑强", "压力下简短直接"],
    limits: ["不是军工专家", "不主动剧透"],
  },
  Sam: {
    traits: ["冲动", "行动派", "力气大", "听得进明确理由"],
    limits: ["不会无视清楚的危险理由"],
  },
};

const intelFacts = {
  doorReinforce: "撞击会让防爆门锁机加深，门缝被压得更死。",
  wireDanger: "剪线钳靠近外露线路时，中央装置会出现危险反馈。",
  shellBlocked: "炸弹外壳的防拆结构无法用普通螺丝刀打开。",
  bombFixed: "中央装置与测试架固定，受力会让固定扣收紧。",
  controlGroup: "门控台、配电箱和读卡器仍连接在同一组线路中。",
  fuseNeed: "配电箱缺少一枚备用保险丝。",
  cardNeed: "读卡器需要设施识别卡验证权限。",
  hydraulicNeed: "防爆门低处的机械槽需要匹配摇柄。",
  realGoal: "中央装置没有现场拆除条件；可恢复的是防爆门开启流程。",
};

const itemAliases = {
  fuse: ["保险丝", "熔断器"],
  card: ["识别卡", "门禁卡", "证件", "卡片", "卡"],
  crank: ["金属摇柄", "摇柄", "手柄", "曲柄"],
  pliers: ["剪线钳", "钳子", "剪钳"],
  screwdriver: ["螺丝刀", "改锥", "起子"],
};

const targetAliases = {
  fuseBox: ["配电箱", "电箱", "保险丝槽", "空槽"],
  cardReader: ["读卡器", "刷卡器", "感应区", "门禁"],
  hydraulicPort: ["液压孔", "圆孔", "深槽", "机械槽", "接口"],
  bombWires: ["炸弹线路", "外露线路", "线路", "线束", "电线"],
  bombShell: ["炸弹外壳", "装置外壳", "外壳", "防拆螺栓"],
};

const el = {
  overlay: document.querySelector("#screenOverlay"),
  status: document.querySelector("#screenStatus"),
  label: document.querySelector("#sceneLabel"),
  story: document.querySelector("#storyText"),
  video: document.querySelector("#storyVideo"),
  presentationSelector: document.querySelector("#presentationSelector"),
  useZone: document.querySelector("#useZone"),
  toastLayer: document.querySelector("#toastLayer"),
  choices: document.querySelector("#choiceTray"),
  intelList: document.querySelector("#intelList"),
  actionList: document.querySelector("#actionList"),
  intelCount: document.querySelector("#intelCount"),
  actionCount: document.querySelector("#actionCount"),
  inventory: document.querySelector("#inventorySlots"),
  form: document.querySelector("#commandForm"),
  input: document.querySelector("#commandInput"),
  execute: document.querySelector("#executeBtn"),
  record: document.querySelector("#recordButton"),
  play: document.querySelector("#playButton"),
  stop: document.querySelector("#stopButton"),
};

const state = {
  phase: "standby",
  pausedFrom: null,
  label: "录像待机",
  status: "待机",
  fullText: "",
  typedText: "",
  typingIndex: 0,
  typingTimer: null,
  typingEntry: null,
  queue: [],
  inputEnabled: false,
  nodeTimer: null,
  timerKind: null,
  nodeStartedAt: 0,
  nodeRemainingMs: NODE_BASE_MS,
  demoIndex: 0,
  nodeIndex: 0,
  loopCount: 1,
  turnCount: 0,
  currentFocus: null,
  inventory: [],
  selectedItem: null,
  intel: [],
  actions: [],
  recentChoices: [],
  recentTurns: [],
  usedVariants: {},
  presentationMode: readPresentationMode(),
  activeVisualKey: null,
  videoFallbackShown: false,
  escaped: false,
  flags: freshFlags(),
  knowledge: freshKnowledge(),
  cabinetChecked: freshCabinet(),
  npcState: freshNpcState(),
};

function freshFlags() {
  return {
    samStopped: false,
    doorReinforced: false,
    controlRoomChecked: false,
    hydraulicFound: false,
    cabinetOpened: false,
    fuseInstalled: false,
    cardAccepted: false,
    crankInserted: false,
    samHelping: false,
  };
}

function freshKnowledge() {
  return {
    wireDanger: false,
    shellBlocked: false,
    bombFixed: false,
    controlKnown: false,
    hydraulicKnown: false,
    realGoal: false,
  };
}

function freshCabinet() {
  return { uniform: false, toolBox: false, electricBox: false, insideDoor: false, bottom: false };
}

function freshNpcState() {
  return {
    Maya: { trust: 42, stress: 36, focus: "房间结构", currentTask: "观察中央装置", calmed: true },
    Sam: { trust: 34, stress: 55, focus: "防爆门", currentTask: "准备撞门", calmed: false },
  };
}

const videoDirector = {
  play(visualKey) {
    state.activeVisualKey = visualKey || null;
    if (state.presentationMode !== "video" || !visualKey) {
      this.hide();
      return;
    }

    const manifestKey = VIDEO_MANIFEST.aliases[visualKey] || visualKey;
    const entry = VIDEO_MANIFEST.entries[manifestKey];
    if (!entry || entry.status !== "ready" || !entry.file) {
      this.hide();
      if (!state.videoFallbackShown) {
        state.videoFallbackShown = true;
        toast("未完成的视频片段将自动显示文字画面。");
      }
      return;
    }

    const source = new URL(`${VIDEO_MANIFEST.basePath}${entry.file}`, document.baseURI).href;
    const startTime = Number(entry.startTime) || 0;
    if (el.video.dataset.source !== source) {
      el.video.pause();
      el.video.dataset.source = source;
      el.video.src = source;
      el.video.load();
    }
    el.video.loop = Boolean(entry.loop);
    el.video.muted = entry.muted !== false;
    el.overlay.classList.add("has-video");
    const beginPlayback = () => {
      if (Math.abs(el.video.currentTime - startTime) > 0.15) el.video.currentTime = startTime;
      el.video.play().catch(() => this.hide());
    };
    if (el.video.readyState >= 1) beginPlayback();
    else el.video.addEventListener("loadedmetadata", beginPlayback, { once: true });
  },
  pause() {
    if (!el.video.paused) el.video.pause();
  },
  resume() {
    if (state.presentationMode === "video" && el.overlay.classList.contains("has-video")) {
      const resumeAt = el.video.currentTime;
      el.video.play().catch(() => {
        el.video.currentTime = resumeAt;
        window.setTimeout(() => {
          el.video.play().catch(() => toast("视频未能自动继续，请再按一次播放键。"));
        }, 0);
      });
    }
  },
  hide() {
    el.video.pause();
    el.overlay.classList.remove("has-video");
  },
  stop() {
    this.hide();
    el.video.removeAttribute("src");
    el.video.dataset.source = "";
    state.activeVisualKey = null;
  },
};

function readPresentationMode() {
  try {
    return window.localStorage.getItem("bomb-room-presentation") === "video" ? "video" : "text";
  } catch {
    return "text";
  }
}

function setPresentationMode(mode) {
  if (!["text", "video"].includes(mode)) return;
  state.presentationMode = mode;
  try {
    window.localStorage.setItem("bomb-room-presentation", mode);
  } catch {
    // Storage is optional; the selected mode still works for this session.
  }
  if (mode === "video" && !Object.values(VIDEO_MANIFEST.entries).some((entry) => entry.status === "ready")) {
    toast("视频模式已选择，当前使用文字回退预览。");
  }
  render();
}

function submitPlayerText(raw) {
  const playerText = raw.trim();
  if (!playerText || state.phase !== "playing" || !state.inputEnabled) return;

  el.input.value = "";
  window.clearTimeout(state.nodeTimer);
  state.nodeTimer = null;
  state.timerKind = null;
  state.turnCount += 1;
  setInputEnabled(false);

  const action = classifyInput(playerText);
  const result = resolveAction(action, playerText);
  applyResult(result, playerText);

  queueStory({
    label: result.label || labelFor(result),
    status: "REC",
    narration: pickText(result.responseKey, playerText),
    visualKey: result.responseKey,
    choices: result.choices || CONTENT.choices.explore,
    flash: result.escaped,
    durationMs: storyHoldMs(result.responseKey),
    escaped: result.escaped,
  });

  const unlockedNow = maybeUnlockRealGoal();
  if (unlockedNow) {
    queueStory({
      label: "情报整合",
      status: "REC",
      narration: pickText("realGoal", playerText),
      visualKey: "realGoal",
      choices: CONTENT.choices.sequence,
      durationMs: 15_000,
    });
  }
}

function classifyInput(raw) {
  const text = normalize(raw);
  const has = (...words) => words.some((word) => text.includes(normalize(word)));
  const mentionsMaya = has("maya", "玛雅");
  const mentionsSam = has("sam", "山姆");
  const item = detectAlias(text, itemAliases);
  const target = detectAlias(text, targetAliases);
  const useVerb = has("用", "使用", "装", "安装", "插", "放到", "放进", "刷", "贴", "剪", "撬", "拧", "转动");

  if (has("循环", "上一轮", "上一次", "我死过", "死过一次", "重置", "回到刚才")) {
    return { intent: "premonition", responseKey: "premonition", realized: true };
  }

  if ((has("拦", "拉住", "按住", "阻止", "别撞", "不要撞", "停下") && (mentionsSam || has("他", "门")))) {
    return { intent: "stopSam", responseKey: state.flags.samStopped ? "stopSamAgain" : "stopSam", realized: true };
  }

  if (mentionsMaya && has("怎么办", "建议", "怎么做", "下一步", "问问", "问她", "判断")) {
    return { intent: "askMaya", responseKey: adviceKey(), realized: true };
  }

  if (mentionsSam && has("摇柄", "转", "开门", "帮忙", "协作", "用力")) {
    return { intent: "askSam", realized: true };
  }

  if (item && (target || useVerb)) {
    return { intent: "useItem", item, target: target || focusForItem(item), realized: true };
  }

  if (has("旧制服", "制服", "胸袋", "口袋", "证件袋")) return { intent: "cabinetPart", part: "uniform", realized: true };
  if (has("工具盒", "工具箱", "维护工具")) return { intent: "cabinetPart", part: "toolBox", realized: true };
  if (has("电气零件", "零件盒", "备用零件")) return { intent: "cabinetPart", part: "electricBox", realized: true };
  if (has("柜门内侧", "柜门背面", "内侧卡扣")) return { intent: "cabinetPart", part: "insideDoor", realized: true };
  if (has("柜底", "底层", "柜子底下")) return { intent: "cabinetPart", part: "bottom", realized: true };
  if (has("器材柜", "铁柜", "工具柜", "柜子", "继续翻", "继续找")) {
    return { intent: "cabinet", realized: true };
  }

  if (has("配电箱", "电箱", "保险丝槽")) return { intent: "inspectFuse", realized: true };
  if (has("读卡器", "刷卡器", "门禁")) return { intent: "inspectReader", realized: true };
  if (has("控制室", "门控台", "门控设备", "观察室")) return { intent: "inspectControl", realized: true };

  if (has("液压孔", "圆孔", "机械槽", "门边低处", "门框低处")) return { intent: "inspectDoor", realized: true };
  if (has("防爆门", "门缝", "门框", "出口")) return { intent: "inspectDoor", realized: true };

  if (has("剪线", "剪断", "线路", "线束", "外露线")) {
    if (has("剪", "钳") && state.inventory.includes("pliers")) return { intent: "useItem", item: "pliers", target: "bombWires", realized: true };
    return { intent: "inspectBomb", part: "overview", realized: true };
  }
  if (has("外壳", "防拆螺栓", "螺丝")) return { intent: "inspectBomb", part: "shell", realized: true };
  if (has("固定架", "固定结构", "测试架", "底座", "搬炸弹", "移动炸弹", "撬炸弹")) return { intent: "inspectBomb", part: "fixed", realized: true };
  if (has("炸弹", "中央装置", "倒计时", "爆炸装置")) return { intent: "inspectBomb", part: "overview", realized: true };

  if (has("环顾", "观察房间", "看看房间", "四周", "有什么", "检查房间")) return { intent: "lookRoom", realized: true };
  if (mentionsMaya) return { intent: "talkMaya", realized: true };
  if (mentionsSam) return { intent: "talkSam", realized: true };

  return { intent: "unknown", responseKey: "unknownObject", realized: false };
}

function resolveAction(action) {
  const result = {
    ...action,
    responseKey: action.responseKey,
    flags: {},
    knowledge: {},
    npcPatch: {},
    intel: [],
    gainedItems: [],
    choices: CONTENT.choices.explore,
    actionLog: "",
    focus: null,
    escaped: false,
  };

  if (action.intent === "premonition") {
    result.flags.samStopped = true;
    result.npcPatch = { Sam: { trust: 46, stress: 49, calmed: true, currentTask: "检查防爆门" }, Maya: { trust: 48, focus: "门控设备" } };
    result.actionLog = "把异常记忆转成具体风险预判";
    result.choices = CONTENT.choices.opening;
  } else if (action.intent === "stopSam") {
    result.flags.samStopped = true;
    result.npcPatch = { Sam: { trust: 52, stress: 49, calmed: true, focus: "防爆门", currentTask: "检查门框" } };
    result.actionLog = state.flags.samStopped ? "再次确认 Sam 保持克制" : "在撞击前用明确理由拦住 Sam";
    result.choices = CONTENT.choices.door;
  } else if (action.intent === "askMaya") {
    result.responseKey = adviceKey();
    result.npcPatch = { Maya: { trust: clamp(state.npcState.Maya.trust + 4), stress: clamp(state.npcState.Maya.stress + 2), focus: "当前可验证步骤", currentTask: "给出设备建议" } };
    result.actionLog = "询问 Maya 当前最具体的下一步";
    result.choices = state.knowledge.controlKnown ? CONTENT.choices.sequence : CONTENT.choices.explore;
  } else if (action.intent === "askSam") {
    resolveSamAction(result);
  } else if (action.intent === "useItem") {
    resolveItemUse(result, action.item, action.target);
  } else if (action.intent === "cabinet") {
    const next = ["uniform", "toolBox", "electricBox", "insideDoor", "bottom"].find((key) => !state.cabinetChecked[key]);
    if (next) resolveCabinetPart(result, next);
    else {
      result.responseKey = "cabinetDone";
      result.focus = "cabinet";
      result.actionLog = "复查已搜索完的器材柜";
      result.choices = CONTENT.choices.explore;
    }
  } else if (action.intent === "cabinetPart") {
    resolveCabinetPart(result, action.part);
  } else if (action.intent === "inspectControl") {
    result.responseKey = state.knowledge.controlKnown ? "controlRepeat" : "controlInitial";
    result.flags.controlRoomChecked = true;
    result.knowledge.controlKnown = true;
    result.intel.push("controlGroup", "fuseNeed", "cardNeed");
    result.focus = "controlRoom";
    result.npcPatch = { Maya: { trust: clamp(state.npcState.Maya.trust + 5), stress: 42, focus: "门控线路", currentTask: "检查控制室" } };
    result.actionLog = "让 Maya 与 Daniel 检查控制室线路";
    result.choices = CONTENT.choices.sequence;
  } else if (action.intent === "inspectFuse") {
    result.responseKey = state.flags.fuseInstalled ? "fuseRepeat" : "fuseInspect";
    result.knowledge.controlKnown = true;
    result.intel.push("fuseNeed");
    result.focus = "fuseBox";
    result.actionLog = "检查配电箱与空保险丝槽";
    result.choices = [["寻找保险丝", "检查器材柜的电气零件盒"], ["检查读卡器", "查看读卡器"], ["询问 Maya", "问 Maya 下一步怎么做"]];
  } else if (action.intent === "inspectReader") {
    result.responseKey = state.flags.cardAccepted ? "cardRepeat" : "readerInspect";
    result.knowledge.controlKnown = true;
    result.intel.push("cardNeed");
    result.focus = "cardReader";
    result.actionLog = "检查读卡器的权限响应";
    result.choices = [["寻找识别卡", "检查器材柜里的旧制服和证件"], ["检查配电箱", "查看配电箱"], ["询问 Maya", "问 Maya 下一步怎么做"]];
  } else if (action.intent === "inspectDoor") {
    result.responseKey = state.flags.doorReinforced ? "doorReinforced" : state.knowledge.hydraulicKnown ? "doorRepeat" : "doorInitial";
    result.flags.hydraulicFound = true;
    result.knowledge.hydraulicKnown = true;
    result.intel.push("hydraulicNeed");
    result.focus = "hydraulicPort";
    result.npcPatch = { Sam: { trust: clamp(state.npcState.Sam.trust + 4), calmed: true, focus: "液压孔", currentTask: "确认机械槽" } };
    result.actionLog = "检查防爆门低处的机械接口";
    result.choices = CONTENT.choices.door;
  } else if (action.intent === "inspectBomb") {
    resolveBombInspection(result, action.part);
  } else if (action.intent === "lookRoom") {
    result.responseKey = "lookRoom";
    result.actionLog = "环顾安全室并确认可交互区域";
    result.choices = CONTENT.choices.explore;
  } else if (action.intent === "talkMaya") {
    result.responseKey = "talkMaya";
    result.npcPatch = { Maya: { trust: clamp(state.npcState.Maya.trust + 2), currentTask: "听取 Daniel 的具体判断" } };
    result.actionLog = "与 Maya 交换当前判断";
  } else if (action.intent === "talkSam") {
    result.responseKey = "talkSam";
    result.npcPatch = { Sam: { trust: clamp(state.npcState.Sam.trust + 2), calmed: true, currentTask: "等待明确协作目标" } };
    result.actionLog = "向 Sam 说明具体目标与风险";
    result.choices = CONTENT.choices.door;
  } else {
    result.responseKey = "unknownObject";
    result.choices = CONTENT.choices.explore;
  }

  return result;
}

function resolveBombInspection(result, part) {
  result.choices = CONTENT.choices.bomb;
  result.focus = part === "shell" ? "bombShell" : "bombWires";

  if (part === "shell") {
    result.responseKey = state.knowledge.shellBlocked ? "shellRepeat" : "shellBlocked";
    result.knowledge.shellBlocked = true;
    result.intel.push("shellBlocked");
    result.actionLog = "检查炸弹外壳和防拆螺栓";
  } else if (part === "fixed") {
    result.responseKey = state.knowledge.bombFixed ? "fixedRepeat" : "fixedBlocked";
    result.knowledge.bombFixed = true;
    result.intel.push("bombFixed");
    result.actionLog = "检查中央装置的固定结构";
  } else {
    result.responseKey = "bombOverview";
    result.actionLog = "观察中央装置的可接近部位";
  }
}

function resolveCabinetPart(result, part) {
  const configs = {
    uniform: { responseKey: "cabinetUniform", items: ["card"], label: "旧制服与证件" },
    toolBox: { responseKey: "cabinetToolBox", items: ["pliers", "screwdriver"], label: "维护工具盒" },
    electricBox: { responseKey: "cabinetElectric", items: ["fuse"], label: "电气零件盒" },
    insideDoor: { responseKey: "cabinetInsideDoor", items: ["crank"], label: "柜门内侧卡扣" },
    bottom: { responseKey: "cabinetBottom", items: [], label: "器材柜底层" },
  };
  const config = configs[part];
  if (!config) return;

  if (state.cabinetChecked[part]) {
    result.responseKey = "cabinetDone";
    result.actionLog = `复查${config.label}`;
  } else {
    result.responseKey = config.responseKey;
    result.cabinetPart = part;
    result.gainedItems.push(...config.items);
    result.actionLog = `分层搜索${config.label}`;
  }
  result.flags.cabinetOpened = true;
  result.focus = "cabinet";
  result.choices = CONTENT.choices.cabinet;
}

function resolveItemUse(result, item, target) {
  result.focus = target;
  result.choices = CONTENT.choices.sequence;

  if (!items[item] || !state.inventory.includes(item)) {
    result.responseKey = "missingItem";
    result.actionLog = `尝试寻找并使用${items[item]?.name || "所需物品"}`;
    result.realized = false;
    result.choices = CONTENT.choices.cabinet;
    return;
  }

  if (item === "fuse" && target === "fuseBox") {
    result.responseKey = state.flags.fuseInstalled ? "fuseRepeat" : "fuseSuccess";
    result.flags.fuseInstalled = true;
    result.knowledge.controlKnown = true;
    result.intel.push("fuseNeed", "controlGroup");
    result.actionLog = "把备用保险丝安装进配电箱";
    return;
  }

  if (item === "card" && target === "cardReader") {
    if (state.flags.cardAccepted) result.responseKey = "cardRepeat";
    else if (!state.flags.fuseInstalled) result.responseKey = "cardNoPower";
    else {
      result.responseKey = "cardSuccess";
      result.flags.cardAccepted = true;
    }
    result.knowledge.controlKnown = true;
    result.intel.push("cardNeed", "controlGroup");
    result.actionLog = state.flags.fuseInstalled ? "使用识别卡通过门控权限" : "在供电恢复前尝试使用识别卡";
    return;
  }

  if (item === "crank" && target === "hydraulicPort") {
    if (!state.knowledge.hydraulicKnown) result.responseKey = "crankNoPort";
    else if (state.flags.crankInserted) result.responseKey = "crankRepeat";
    else {
      result.responseKey = "crankSuccess";
      result.flags.crankInserted = true;
    }
    result.intel.push("hydraulicNeed");
    result.actionLog = state.knowledge.hydraulicKnown ? "把金属摇柄插入液压孔" : "拿摇柄寻找明确的机械接口";
    result.choices = CONTENT.choices.door;
    return;
  }

  if (item === "pliers" && target === "bombWires") {
    result.responseKey = state.knowledge.wireDanger ? "wireRepeat" : "wireDanger";
    result.knowledge.wireDanger = true;
    result.intel.push("wireDanger");
    result.actionLog = "用剪线钳试探炸弹外露线路";
    result.choices = CONTENT.choices.bomb;
    return;
  }

  if (item === "screwdriver" && target === "bombShell") {
    result.responseKey = state.knowledge.shellBlocked ? "shellRepeat" : "shellBlocked";
    result.knowledge.shellBlocked = true;
    result.intel.push("shellBlocked");
    result.actionLog = "用普通螺丝刀尝试处理防拆外壳";
    result.choices = CONTENT.choices.bomb;
    return;
  }

  result.responseKey = "wrongUse";
  result.actionLog = `尝试把${items[item].name}用于${focuses[target]?.label || "当前目标"}`;
}

function resolveSamAction(result) {
  result.npcPatch = { Sam: { trust: clamp(state.npcState.Sam.trust + 5), stress: 64, calmed: true, focus: "液压摇柄", currentTask: "准备协作开门" } };
  result.focus = "hydraulicPort";
  result.choices = CONTENT.choices.sequence;

  if (!state.flags.crankInserted) result.responseKey = "samNeedCrank";
  else if (!state.flags.fuseInstalled) result.responseKey = "samNeedPower";
  else if (!state.flags.cardAccepted) result.responseKey = "samNeedCard";
  else {
    result.responseKey = "samEscape";
    result.flags.samHelping = true;
    result.escaped = true;
  }
  result.actionLog = result.escaped ? "与 Sam 协作转动摇柄并打开防爆门" : "让 Sam 准备协作转动摇柄";
}

function adviceKey() {
  const bombCount = [state.knowledge.wireDanger, state.knowledge.shellBlocked, state.knowledge.bombFixed].filter(Boolean).length;
  if (!state.flags.samStopped && state.nodeIndex === 0) return "mayaAdviceStart";
  if (bombCount > 0 && (!state.knowledge.controlKnown || !state.knowledge.hydraulicKnown)) return "mayaAdviceBomb";
  if (state.knowledge.controlKnown && state.knowledge.hydraulicKnown && !hasCoreItems()) return "mayaAdviceItems";
  if (state.knowledge.controlKnown) return "mayaAdviceSequence";
  return "mayaAdviceStart";
}

function hasCoreItems() {
  return ["fuse", "card", "crank"].every((key) => state.inventory.includes(key));
}

function applyResult(result, playerText) {
  Object.assign(state.flags, result.flags);
  Object.assign(state.knowledge, result.knowledge);

  if (result.cabinetPart) state.cabinetChecked[result.cabinetPart] = true;
  for (const key of result.gainedItems || []) {
    if (!state.inventory.includes(key)) {
      state.inventory.push(key);
      toast(`取得：${items[key].name}`);
    }
  }
  for (const key of result.intel || []) addIntel(key);

  patchNpcState(result.npcPatch);
  if (result.focus && focuses[result.focus]) state.currentFocus = result.focus;
  if (result.escaped) state.escaped = true;

  if (result.realized && result.actionLog) addAction(`“${truncate(playerText, 24)}” → ${result.actionLog}`);
  state.recentTurns.unshift({ input: playerText, intent: result.intent, result: result.actionLog || "未形成可执行动作" });
  state.recentTurns = state.recentTurns.slice(0, 12);
  render();
}

function patchNpcState(patch = {}) {
  for (const name of Object.keys(npcCards)) {
    if (!patch[name]) continue;
    state.npcState[name] = { ...state.npcState[name], ...patch[name] };
  }
}

function maybeUnlockRealGoal() {
  if (state.knowledge.realGoal) return false;
  const ready = state.knowledge.wireDanger && state.knowledge.shellBlocked && state.knowledge.bombFixed && state.knowledge.controlKnown && state.knowledge.hydraulicKnown;
  if (!ready) return false;
  state.knowledge.realGoal = true;
  addIntel("realGoal");
  return true;
}

function buildNode() {
  const index = state.nodeIndex++;
  if (index === 0) {
    if (!state.flags.samStopped && !state.flags.doorReinforced) {
      return {
        id: "samImpact",
        label: "防爆门",
        responseKey: "samImpact",
        flags: { doorReinforced: true },
        intel: ["doorReinforce"],
        npcPatch: { Sam: { stress: 65, calmed: true, currentTask: "停止撞门" }, Maya: { stress: 48, focus: "门锁反馈" } },
      };
    }
    if (!state.knowledge.hydraulicKnown) {
      return {
        id: "samSearchDoor",
        label: "防爆门低处",
        responseKey: "samSearchDoor",
        flags: { hydraulicFound: true },
        knowledge: { hydraulicKnown: true },
        intel: ["hydraulicNeed"],
        npcPatch: { Sam: { trust: 50, calmed: true, focus: "液压孔", currentTask: "检查机械槽" } },
      };
    }
  }

  if (index === 2 && !state.knowledge.controlKnown) {
    return {
      id: "mayaControl",
      label: "观察控制室",
      responseKey: "mayaControl",
      flags: { controlRoomChecked: true },
      knowledge: { controlKnown: true },
      intel: ["controlGroup", "fuseNeed", "cardNeed"],
      npcPatch: { Maya: { trust: 48, stress: 45, focus: "门控线路", currentTask: "检查配电和权限" } },
    };
  }

  if (index === 3 && !state.knowledge.hydraulicKnown) {
    return {
      id: "samPort",
      label: "防爆门低处",
      responseKey: "samPort",
      flags: { hydraulicFound: true },
      knowledge: { hydraulicKnown: true },
      intel: ["hydraulicNeed"],
      npcPatch: { Sam: { trust: 45, calmed: true, focus: "液压孔", currentTask: "确认机械接口" } },
    };
  }

  if (index >= 5) return { id: "explosion", label: "倒计时归零", responseKey: "explosion", flash: true, explosion: true };
  return { id: "pressure", label: "中央装置", responseKey: "pressure" };
}

function runNode() {
  if (state.phase !== "playing" || state.typingEntry || state.escaped) return;
  state.timerKind = null;
  const node = buildNode();

  Object.assign(state.flags, node.flags || {});
  Object.assign(state.knowledge, node.knowledge || {});
  patchNpcState(node.npcPatch);
  for (const key of node.intel || []) addIntel(key);

  queueStory({
    label: node.label,
    status: node.flash ? "信号干扰" : "REC",
    narration: pickText(node.responseKey, node.id),
    visualKey: node.responseKey,
    choices: choicesForNode(node),
    flash: node.flash,
    durationMs: node.explosion ? 10_000 : NODE_BASE_MS,
    explosion: node.explosion,
  });

  if (!node.explosion && maybeUnlockRealGoal()) {
    queueStory({
      label: "情报整合",
      status: "REC",
      narration: pickText("realGoal", node.id),
      visualKey: "realGoal",
      choices: CONTENT.choices.sequence,
      durationMs: 15_000,
    });
  }
}

function choicesForNode(node) {
  if (node.responseKey === "samImpact" || node.responseKey === "samSearchDoor" || node.responseKey === "samPort") return CONTENT.choices.door;
  if (node.responseKey === "mayaControl") return CONTENT.choices.sequence;
  return state.knowledge.realGoal ? CONTENT.choices.sequence : CONTENT.choices.explore;
}

function pickText(key, seed = "") {
  const source = CONTENT.responses[key] || CONTENT.nodes[key];
  if (!Array.isArray(source) || !source.length) return "影像出现短暂干扰。";

  const used = state.usedVariants[key] || [];
  const candidates = source.map((_, index) => index).filter((index) => !used.includes(index));
  const pool = candidates.length ? candidates : source.map((_, index) => index);
  if (!candidates.length) state.usedVariants[key] = [];

  const hash = hashText(`${seed}|${state.loopCount}|${state.turnCount}|${key}`);
  const index = pool[hash % pool.length];
  state.usedVariants[key] = [...(state.usedVariants[key] || []), index];
  return source[index];
}

function queueStory(entry) {
  state.queue.push(entry);
  setInputEnabled(false);
  if (!state.typingEntry) startNextStory();
}

function startNextStory() {
  state.timerKind = null;
  if (!state.queue.length) {
    if (state.phase === "playing" && !state.escaped) {
      setInputEnabled(true);
      scheduleNextNode();
    }
    return;
  }

  const entry = state.queue.shift();
  state.typingEntry = entry;
  state.label = entry.label || "Daniel 行动";
  state.status = entry.status || "REC";
  state.fullText = entry.narration || "";
  state.typedText = "";
  state.typingIndex = 0;
  state.recentChoices = [];
  setInputEnabled(false);
  videoDirector.play(entry.visualKey);

  if (entry.flash) {
    el.overlay.classList.add("mode-flash");
    window.setTimeout(() => el.overlay.classList.remove("mode-flash"), 900);
  }
  render();
  startTyping();
}

function startTyping() {
  window.clearInterval(state.typingTimer);
  if (state.phase === "paused") return;
  state.typingTimer = window.setInterval(typeNextCharacter, TYPE_INTERVAL_MS);
}

function typeNextCharacter() {
  if (state.phase === "paused" || !state.typingEntry) return;
  if (state.typingIndex < state.fullText.length) {
    state.typedText += state.fullText[state.typingIndex++];
    el.story.textContent = state.typedText;
    return;
  }

  window.clearInterval(state.typingTimer);
  state.typingTimer = null;
  const completed = state.typingEntry;
  state.typingEntry = null;
  state.recentChoices = completed.choices || [];
  render();

  if (completed.escaped) {
    finishGame();
    return;
  }

  if (completed.explosion) {
    state.nodeRemainingMs = completed.durationMs || 8000;
    state.nodeStartedAt = Date.now();
    state.timerKind = "explosion";
    state.nodeTimer = window.setTimeout(completeExplosionLoop, state.nodeRemainingMs);
    return;
  }

  if (state.queue.length) {
    state.nodeRemainingMs = 1800;
    state.nodeStartedAt = Date.now();
    state.timerKind = "queue";
    state.nodeTimer = window.setTimeout(startNextStory, 1800);
    return;
  }

  setInputEnabled(true);
  scheduleNextNode(completed.durationMs || NODE_BASE_MS);
}

function scheduleNextNode(delay = NODE_BASE_MS) {
  if (state.phase !== "playing" || state.escaped || state.typingEntry || state.queue.length) return;
  window.clearTimeout(state.nodeTimer);
  state.nodeRemainingMs = delay;
  state.nodeStartedAt = Date.now();
  state.timerKind = "node";
  state.nodeTimer = window.setTimeout(runNode, delay);
}

function completeExplosionLoop() {
  state.timerKind = null;
  resetAfterExplosion();
  queueStory({
    label: `第 ${state.loopCount} 次记录`,
    status: "REC",
    narration: pickOpening(),
    visualKey: "opening",
    choices: CONTENT.choices.opening,
    durationMs: NODE_BASE_MS,
  });
}

function startGame() {
  resetRuntime("demo");
  state.phase = "demo";
  state.demoIndex = 0;
  el.overlay.classList.remove("mode-standby");
  playNextDemoBeat();
}

function playNextDemoBeat() {
  if (state.phase !== "demo") return;
  state.timerKind = null;
  const beat = CONTENT.demo[state.demoIndex++];
  if (!beat) {
    beginPlayableRun();
    return;
  }

  state.queue.push({
    label: beat.label,
    status: beat.status,
    narration: beat.text,
    visualKey: beat.id,
    flash: beat.flash,
    durationMs: beat.durationMs,
  });
  if (!state.typingEntry) startNextDemoStory();
}

function startNextDemoStory() {
  const entry = state.queue.shift();
  if (!entry) {
    playNextDemoBeat();
    return;
  }
  state.typingEntry = entry;
  state.label = entry.label;
  state.status = entry.status;
  state.fullText = entry.narration;
  state.typedText = "";
  state.typingIndex = 0;
  setInputEnabled(false);
  videoDirector.play(entry.visualKey);
  if (entry.flash) {
    el.overlay.classList.add("mode-flash");
    window.setTimeout(() => el.overlay.classList.remove("mode-flash"), 900);
  }
  render();
  window.clearInterval(state.typingTimer);
  state.typingTimer = window.setInterval(() => {
    if (state.phase === "paused") return;
    if (state.typingIndex < state.fullText.length) {
      state.typedText += state.fullText[state.typingIndex++];
      el.story.textContent = state.typedText;
      return;
    }
    completeDemoTyping(entry);
  }, TYPE_INTERVAL_MS);
}

function completeDemoTyping(entry) {
  window.clearInterval(state.typingTimer);
  state.typingTimer = null;
  state.typingEntry = null;
  state.nodeRemainingMs = entry.durationMs;
  state.nodeStartedAt = Date.now();
  state.timerKind = "demo";
  state.nodeTimer = window.setTimeout(playNextDemoBeat, entry.durationMs);
}

function beginPlayableRun() {
  const persistent = {
    intel: [...state.intel],
    actions: [...state.actions],
    knowledge: { ...state.knowledge },
    usedVariants: { ...state.usedVariants },
    loopCount: state.loopCount,
  };
  resetRuntime("playing");
  Object.assign(state, persistent);
  state.phase = "playing";
  queueStory({
    label: "安全室入口",
    status: "REC",
    narration: pickOpening(),
    visualKey: "opening",
    choices: CONTENT.choices.opening,
    durationMs: NODE_BASE_MS,
  });
}

function pickOpening() {
  const source = CONTENT.opening;
  const key = "opening";
  const used = state.usedVariants[key] || [];
  const candidates = source.map((_, index) => index).filter((index) => !used.includes(index));
  const pool = candidates.length ? candidates : source.map((_, index) => index);
  if (!candidates.length) state.usedVariants[key] = [];
  const index = pool[hashText(`${state.loopCount}|${state.turnCount}`) % pool.length];
  state.usedVariants[key] = [...(state.usedVariants[key] || []), index];
  return source[index];
}

function resetRuntime(phase = "playing") {
  window.clearTimeout(state.nodeTimer);
  window.clearInterval(state.typingTimer);
  videoDirector.stop();
  Object.assign(state, {
    phase,
    pausedFrom: null,
    label: phase === "demo" ? "录像启动" : "安全室入口",
    status: phase === "demo" ? "演示" : "REC",
    fullText: "",
    typedText: "",
    typingIndex: 0,
    typingTimer: null,
    typingEntry: null,
    queue: [],
    inputEnabled: false,
    nodeTimer: null,
    timerKind: null,
    nodeStartedAt: 0,
    nodeRemainingMs: NODE_BASE_MS,
    demoIndex: 0,
    nodeIndex: 0,
    loopCount: 1,
    turnCount: 0,
    currentFocus: null,
    inventory: [],
    selectedItem: null,
    intel: [],
    actions: [],
    recentChoices: [],
    recentTurns: [],
    usedVariants: {},
    activeVisualKey: null,
    videoFallbackShown: false,
    escaped: false,
    flags: freshFlags(),
    knowledge: freshKnowledge(),
    cabinetChecked: freshCabinet(),
    npcState: freshNpcState(),
  });
  setInputEnabled(false);
  render();
}

function resetAfterExplosion() {
  window.clearTimeout(state.nodeTimer);
  state.loopCount += 1;
  state.nodeIndex = 0;
  state.currentFocus = null;
  state.inventory = [];
  state.selectedItem = null;
  state.recentTurns = [];
  state.flags = freshFlags();
  state.cabinetChecked = freshCabinet();
  state.npcState = freshNpcState();
  state.queue = [];
  state.timerKind = null;
  state.escaped = false;
  render();
}

function pauseGame() {
  if (!["playing", "demo"].includes(state.phase)) return;
  state.pausedFrom = state.phase;
  state.phase = "paused";
  window.clearTimeout(state.nodeTimer);
  window.clearInterval(state.typingTimer);
  videoDirector.pause();
  if (state.nodeStartedAt) state.nodeRemainingMs = Math.max(0, state.nodeRemainingMs - (Date.now() - state.nodeStartedAt));
  state.status = "暂停";
  setInputEnabled(false);
  render();
}

function resumeGame() {
  if (state.phase !== "paused") return;
  state.phase = state.pausedFrom || "playing";
  state.status = state.phase === "demo" ? "演示" : "REC";
  videoDirector.resume();

  if (state.typingEntry) {
    if (state.phase === "demo") startNextDemoStoryFromPause();
    else startTyping();
  } else if (state.phase === "demo") {
    state.nodeStartedAt = Date.now();
    state.timerKind = "demo";
    state.nodeTimer = window.setTimeout(playNextDemoBeat, state.nodeRemainingMs || 500);
  } else if (state.timerKind === "queue" && state.queue.length) {
    state.nodeStartedAt = Date.now();
    state.nodeTimer = window.setTimeout(startNextStory, state.nodeRemainingMs || 500);
  } else if (state.timerKind === "explosion") {
    state.nodeStartedAt = Date.now();
    state.nodeTimer = window.setTimeout(completeExplosionLoop, state.nodeRemainingMs || 500);
  } else {
    scheduleNextNode(state.nodeRemainingMs || NODE_BASE_MS);
    setInputEnabled(true);
  }
  render();
}

function startNextDemoStoryFromPause() {
  window.clearInterval(state.typingTimer);
  state.typingTimer = window.setInterval(() => {
    if (state.phase === "paused" || !state.typingEntry) return;
    if (state.typingIndex < state.fullText.length) {
      state.typedText += state.fullText[state.typingIndex++];
      el.story.textContent = state.typedText;
      return;
    }
    completeDemoTyping(state.typingEntry);
  }, TYPE_INTERVAL_MS);
}

function finishGame() {
  state.phase = "escaped";
  state.status = "记录完成";
  window.clearTimeout(state.nodeTimer);
  setInputEnabled(false);
  render();
}

function setInputEnabled(enabled) {
  const canEnable = enabled && state.phase === "playing" && !state.typingEntry && !state.queue.length && !state.escaped;
  state.inputEnabled = canEnable;
  el.input.disabled = !canEnable;
  el.execute.disabled = !canEnable;
  el.form.classList.toggle("is-disabled", !canEnable);

  if (state.phase === "standby") el.input.placeholder = "按下右侧红色录制键开始...";
  else if (state.phase === "demo") el.input.placeholder = "开头演示不可操作，影像将自动推进...";
  else if (state.phase === "paused") el.input.placeholder = "播放已暂停...";
  else if (!canEnable) el.input.placeholder = "影像正在记录...";
  else el.input.placeholder = "输入 Daniel 的行动，例如：让 Maya 检查观察控制室";
}

function addIntel(key) {
  const text = intelFacts[key];
  if (!text || state.intel.includes(text)) return;
  state.intel.unshift(text);
  toast("新情报已记录");
}

function addAction(text) {
  state.actions.unshift(text);
  state.actions = state.actions.slice(0, MAX_ACTIONS);
}

function render() {
  el.label.textContent = state.label;
  el.status.textContent = state.status;
  el.story.textContent = state.typedText;
  el.overlay.classList.toggle("mode-standby", state.phase === "standby");
  el.overlay.classList.toggle("mode-video-selected", state.presentationMode === "video");
  renderPresentationSelector();
  renderRecords();
  renderInventory();
  renderUseZone();
  renderChoices();
}

function renderPresentationSelector() {
  if (!el.presentationSelector) return;
  el.presentationSelector.querySelectorAll("[data-presentation]").forEach((button) => {
    const active = button.dataset.presentation === state.presentationMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderRecords() {
  el.intelCount.textContent = String(state.intel.length);
  el.actionCount.textContent = String(state.actions.length);
  el.intelList.classList.toggle("empty-list", state.intel.length === 0);
  el.actionList.classList.toggle("empty-list", state.actions.length === 0);
  el.intelList.innerHTML = state.intel.length
    ? state.intel.map((text) => `<li>${escapeHtml(text)}</li>`).join("")
    : "<li>确认过的稳定信息会记录在这里。</li>";
  el.actionList.innerHTML = state.actions.length
    ? state.actions.map((text) => `<li>${escapeHtml(text)}</li>`).join("")
    : "<li>玩家输入并在故事中实现的行动会保留在这里。</li>";
}

function renderInventory() {
  const slots = [...state.inventory];
  while (slots.length < 5) slots.push(null);
  el.inventory.innerHTML = slots.map((key) => {
    if (!key) return '<div class="item-slot empty">空</div>';
    const selected = state.selectedItem === key ? "selected" : "";
    return `<button class="item-slot ${selected}" data-item="${key}" draggable="true">
      <span class="item-art ${items[key].art}"></span>
      <strong>${items[key].name}</strong>
      <small>${itemStatus(key)}</small>
    </button>`;
  }).join("");
}

function renderUseZone() {
  if (state.phase !== "playing" || !state.currentFocus || !focuses[state.currentFocus]) {
    el.useZone.classList.remove("is-visible", "is-hot");
    el.useZone.innerHTML = "";
    return;
  }

  const focus = focuses[state.currentFocus];
  const usable = state.inventory.filter((key) => focus.accepts.includes(key));
  el.useZone.classList.add("is-visible");
  el.useZone.innerHTML = `<div><strong>当前查看：${escapeHtml(focus.label)}</strong><span>${usable.length ? "可点击或拖入道具。" : "也可输入文字指定行动。"}</span></div>
    ${usable.map((key) => `<button data-use-item="${key}">使用 ${escapeHtml(items[key].name)}</button>`).join("")}`;
}

function renderChoices() {
  const choices = state.phase === "playing" && !state.typingEntry && !state.queue.length ? state.recentChoices : [];
  el.choices.classList.toggle("has-choices", choices.length > 0);
  el.choices.innerHTML = choices.map(([label, action]) => `<button data-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`).join("");
}

function itemStatus(key) {
  if (key === "fuse" && state.flags.fuseInstalled) return "已安装";
  if (key === "card" && state.flags.cardAccepted) return "已验证";
  if (key === "crank" && state.flags.crankInserted) return "已插入";
  return state.currentFocus ? `可试用于${focuses[state.currentFocus]?.label || "当前目标"}` : `适合：${items[key].hint}`;
}

function labelFor(result) {
  if (result.escaped) return "防爆门开启";
  if (result.intent === "askMaya" || result.intent === "talkMaya") return "Maya 回应";
  if (result.intent === "askSam" || result.intent === "talkSam" || result.intent === "stopSam") return "Sam 回应";
  if (result.focus && focuses[result.focus]) return focuses[result.focus].label;
  return "Daniel 行动";
}

function detectAlias(text, dictionary) {
  for (const [key, aliases] of Object.entries(dictionary)) {
    if (aliases.some((alias) => text.includes(normalize(alias)))) return key;
  }
  return null;
}

function focusForItem(item) {
  return { fuse: "fuseBox", card: "cardReader", crank: "hydraulicPort", pliers: "bombWires", screwdriver: "bombShell" }[item] || null;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[\s，。！？、；：“”‘’"'：,.!?;()-]/g, "");
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function storyHoldMs(responseKey) {
  if (responseKey === "samEscape") return 18_000;
  if (["wireDanger", "shellBlocked", "fixedBlocked", "realGoal"].includes(responseKey)) return 15_000;
  return 12_000;
}

function toast(text) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = text;
  el.toastLayer.prepend(item);
  [...el.toastLayer.children].slice(MAX_TOASTS).forEach((child) => child.remove());
  window.setTimeout(() => item.remove(), 4200);
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

function truncate(value, limit) {
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

el.record.addEventListener("click", () => {
  if (state.phase === "standby") startGame();
  else window.location.reload();
});

el.play.addEventListener("click", () => {
  if (state.phase === "paused") resumeGame();
  else if (state.phase === "demo" && !state.typingEntry) {
    window.clearTimeout(state.nodeTimer);
    state.timerKind = null;
    playNextDemoBeat();
  }
});

el.stop.addEventListener("click", pauseGame);

el.presentationSelector.querySelectorAll("[data-presentation]").forEach((button) => {
  button.addEventListener("click", () => setPresentationMode(button.dataset.presentation));
});

el.video.addEventListener("error", () => {
  videoDirector.hide();
  if (state.presentationMode === "video") toast("视频加载失败，已继续文字画面。");
});

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPlayerText(el.input.value);
});

el.choices.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) submitPlayerText(button.dataset.action);
});

el.inventory.addEventListener("click", (event) => {
  const button = event.target.closest("[data-item]");
  if (!button) return;
  const item = button.dataset.item;
  state.selectedItem = state.selectedItem === item ? null : item;
  if (!state.currentFocus) toast("你拿起某物，但还没有明确要把它用到哪里。");
  else submitPlayerText(`把${items[item].name}用到${focuses[state.currentFocus].label}`);
  render();
});

el.inventory.addEventListener("dragstart", (event) => {
  const button = event.target.closest("[data-item]");
  if (!button) return;
  event.dataTransfer.setData("text/plain", button.dataset.item);
  event.dataTransfer.effectAllowed = "move";
});

el.useZone.addEventListener("dragover", (event) => {
  if (!state.currentFocus) return;
  event.preventDefault();
  el.useZone.classList.add("is-hot");
});

el.useZone.addEventListener("dragleave", () => el.useZone.classList.remove("is-hot"));

el.useZone.addEventListener("drop", (event) => {
  event.preventDefault();
  el.useZone.classList.remove("is-hot");
  const item = event.dataTransfer.getData("text/plain");
  if (item && items[item] && state.currentFocus) submitPlayerText(`把${items[item].name}用到${focuses[state.currentFocus].label}`);
});

el.useZone.addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-item]");
  if (!button || !state.currentFocus) return;
  const item = button.dataset.useItem;
  submitPlayerText(`把${items[item].name}用到${focuses[state.currentFocus].label}`);
});

render();
setInputEnabled(false);
