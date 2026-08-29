interface PageScrollLock {
  readonly bodyTouchAction: string;
  readonly rootOverscrollBehavior: string;
}

let pageScrollLock: PageScrollLock | undefined;
const lockOwners = new Set<symbol>();

function preventPageScroll(event: Event) {
  event.preventDefault();
}

export function lockPageScroll(owner: symbol) {
  if (lockOwners.has(owner)) return;
  lockOwners.add(owner);
  if (pageScrollLock) return;
  const body = document.body;
  const root = document.documentElement;
  pageScrollLock = {
    bodyTouchAction: body.style.touchAction,
    rootOverscrollBehavior: root.style.overscrollBehavior,
  };
  body.style.touchAction = "none";
  root.style.overscrollBehavior = "none";
  document.addEventListener("touchmove", preventPageScroll, { passive: false });
  document.addEventListener("wheel", preventPageScroll, { passive: false });
}

export function unlockPageScroll(owner: symbol) {
  if (!lockOwners.delete(owner) || lockOwners.size > 0) return;
  const lock = pageScrollLock;
  if (!lock) return;
  pageScrollLock = undefined;
  document.body.style.touchAction = lock.bodyTouchAction;
  document.documentElement.style.overscrollBehavior = lock.rootOverscrollBehavior;
  document.removeEventListener("touchmove", preventPageScroll);
  document.removeEventListener("wheel", preventPageScroll);
}
