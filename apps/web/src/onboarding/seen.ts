/** 新手引导只自动弹一次，标记记在 localStorage（隐私模式下读写会抛，一律当没看过处理） */
const SEEN_KEY = "virtual-net.guide.seen";

export function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGuideSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 存不下就下次再弹一遍，不影响使用
  }
}
