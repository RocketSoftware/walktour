import { Coords, dist, Dims, areaDiff, fitsWithin, getElementDims, getEdgeFocusables, isForeignTarget } from "./dom";
import { getTargetPosition } from "./positioning";
import { isElementInView, getViewportDims } from "./viewport";
import { TAB_KEYCODE } from "./constants";

//miscellaneous tour utilities

export function debounce<T extends any[]>(f: (...args: T) => void, interval: number = 300) {
  let timeoutId: number;
  return (...args: T) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => f(...args), interval);
  }
}

export function getIdString(base: string, identifier?: string): string {
  return `${base}${identifier ? `-${identifier}` : ``}`
}

export function setTargetWatcher(callback: () => void, interval: number): (() => void) {
  const intervalId: number = window.setInterval(callback, interval);

  return () => window.clearInterval(intervalId);
}

export interface SetTourUpdateListenerArgs {
  update: () => void;
  customSetListener?: (update: () => void) => void;
  customRemoveListener?: (update: () => void) => void;
  event?: string; // default is resize event
}

export function setTourUpdateListener(args: SetTourUpdateListenerArgs) {
  const { update, customSetListener, customRemoveListener, event } = { event: 'resize', ...args }
  if (customSetListener && customRemoveListener) {
    customSetListener(update);
    return () => customRemoveListener(update);
  } else {
    window.addEventListener(event, update)
    return () => window.removeEventListener(event, update);
  }
}

interface FocusTrapArgs {
  start: HTMLElement;
  end: HTMLElement;
  beforeStart?: HTMLElement;
  afterEnd?: HTMLElement;
  // element that should be excluded from the focus trap but may obtain focus.
  // any focus changes from this element will be directed back to the trap.
  // behavior is based on "verify address" example from https://www.w3.org/TR/wai-aria-practices/examples/dialog-modal/dialog.html
  lightningRod?: HTMLElement;
}

// helper function to create a keyboard focus trap, potentially including multiple elements
function getFocusTrapHandler(args: FocusTrapArgs): (e: KeyboardEvent) => void {
  const { start, end, beforeStart, afterEnd, lightningRod } = args;
  return (e: KeyboardEvent) => {
    if (e.keyCode === TAB_KEYCODE) {
      if (e.shiftKey && e.target === start) {
        e.preventDefault();
        beforeStart ? beforeStart.focus() : end.focus();
      } else if (!e.shiftKey && e.target === end) {
        e.preventDefault();
        afterEnd ? afterEnd.focus() : start.focus();
      } else if (e.target === lightningRod) {
        e.preventDefault();
        start.focus();
      }
    }
  }
}

export const setFocusTrap = (tooltipContainer: HTMLElement, target?: HTMLElement, secondarySelectors?: string[], targetScope?: Element | Document, disableMaskInteraction?: boolean): (() => void) => {
  if (!tooltipContainer) {
    return;
  }

  const { start: tooltipFirst, end: tooltipLast } = getEdgeFocusables(tooltipContainer, tooltipContainer);
  const { start: targetFirst, end: targetLast } = getEdgeFocusables(undefined, target, false);
  
  const secondaryTargets: Array<HTMLElement> = secondarySelectors ? secondarySelectors.map((selector) => {
    return targetScope.querySelector(selector);
  }): undefined;

  let tooltipBeforeStart: HTMLElement;
  let tooltipAfterEnd: HTMLElement;
  let targetTrapHandler: (e: KeyboardEvent) => void;

  if (target && !disableMaskInteraction && targetFirst && targetLast) {
    tooltipAfterEnd = targetFirst;
    tooltipBeforeStart = targetLast;
    if (secondaryTargets != undefined) {
      targetTrapHandler = getFocusTrapHandler({ start: targetFirst, end: targetLast, beforeStart: tooltipLast, afterEnd: secondaryTargets[0] });
    } else {
      targetTrapHandler = getFocusTrapHandler({ start: targetFirst, end: targetLast, beforeStart: tooltipLast, afterEnd: tooltipFirst });
    }

    target.addEventListener('keydown', targetTrapHandler);
  }

  if (secondaryTargets != undefined && !disableMaskInteraction) {
    let secondaryFocusables: any[] = [];
    let secondaryEventListeners: any[] = [];

    secondaryTargets.forEach((secondaryTarget) => {
      const { start: secondaryTargetFirst, end: secondaryTargetLast } = getEdgeFocusables(undefined, secondaryTarget, true);
      if (secondaryTargetFirst && secondaryTargetLast) {
        secondaryFocusables.push({start: secondaryTargetFirst, end: secondaryTargetLast, target: secondaryTarget});
      }
    });

    if (secondaryFocusables.length === 1) {
      targetTrapHandler = getFocusTrapHandler({ start: secondaryFocusables[0].start, end: secondaryFocusables[0].end, beforeStart: targetLast, afterEnd: tooltipFirst });
      secondaryFocusables[0].target.addEventListener('keydown', targetTrapHandler);
      secondaryEventListeners.push({handler: targetTrapHandler, target: secondaryFocusables[0].target});
    }

    if (secondaryFocusables.length > 1) {
      secondaryFocusables.forEach((focusable, index) => {
        if (index === 0) {
          targetTrapHandler = getFocusTrapHandler({ start: focusable.start, end: focusable.end, beforeStart: targetFirst, afterEnd: secondaryFocusables[index + 1].start });
        }
        if (index > 0 && secondaryFocusables.length - 1 > index) {
          targetTrapHandler = getFocusTrapHandler({ start: focusable.start, end: focusable.end, beforeStart: secondaryFocusables[index - 1].end, afterEnd: secondaryFocusables[index + 1].start });
        }
        if (index === secondaryFocusables.length - 1) {
          targetTrapHandler = getFocusTrapHandler({ start: focusable.start, end: focusable.end, beforeStart: secondaryFocusables[index - 1].end, afterEnd: tooltipFirst });
        }
        focusable.target.addEventListener('keydown', targetTrapHandler);
        secondaryEventListeners.push({handler: targetTrapHandler, target: focusable.target});
      });
    }

    const lastIndex = secondaryFocusables.length === 1 ? 0 : secondaryFocusables.length - 1;

    const tooltipTrapHandler = getFocusTrapHandler({ start: tooltipFirst, end: tooltipLast, beforeStart: targetFirst && targetLast ? tooltipBeforeStart : secondaryFocusables[lastIndex].end, afterEnd: targetFirst && targetLast ? tooltipAfterEnd : secondaryFocusables[0].start, lightningRod: tooltipContainer });
    tooltipContainer.addEventListener('keydown', tooltipTrapHandler);
    return () => {
      if (target) {
        target.removeEventListener('keydown', targetTrapHandler);
      }
      if (secondaryTargets) {
        secondaryEventListeners.forEach((listener) => {
          listener.target.removeEventListener('keydown', listener.handler);
        })
      }

      tooltipContainer.removeEventListener('keydown', tooltipTrapHandler);
    }
  }

  const tooltipTrapHandler = getFocusTrapHandler({ start: tooltipFirst, end: tooltipLast, beforeStart: tooltipBeforeStart, afterEnd: tooltipAfterEnd, lightningRod: tooltipContainer });
  tooltipContainer.addEventListener('keydown', tooltipTrapHandler);
  return () => {
    if (target) {
      target.removeEventListener('keydown', targetTrapHandler);
    }

    tooltipContainer.removeEventListener('keydown', tooltipTrapHandler);
  }
}

interface NaiveShouldScrollArgs {
  root: Element;
  tooltip: HTMLElement;
  tooltipPosition?: Coords;
  target: HTMLElement;
}

function naiveShouldScroll(args: NaiveShouldScrollArgs): boolean {
  const { root, tooltip, tooltipPosition, target } = args;

  if (!isElementInView(root, tooltip, tooltipPosition)) {
    return true;
  }

  if (!isElementInView(root, target)) {
    return fitsWithin(getElementDims(target), getViewportDims(root));
  }

  return false;
}
export interface ShouldScrollArgs extends NaiveShouldScrollArgs {
  disableAutoScroll: boolean;
  allowForeignTarget: boolean;
  targetSelector: string;
}

export function shouldScroll(args: ShouldScrollArgs): boolean {
  const { root, tooltip, target, disableAutoScroll, allowForeignTarget, targetSelector } = args;
  if (!root || !tooltip || !target) {
    return false;
  }

  if (disableAutoScroll) {
    return false;
  }

  if (allowForeignTarget) {
    return !isForeignTarget(root, targetSelector);
  }
  return naiveShouldScroll({ ...args });
}

export interface TargetChangedArgs {
  root: Element;
  target: HTMLElement;
  targetCoords: Coords;
  targetDims: Dims;
  rerenderTolerance: number;
}
export function targetChanged(args: TargetChangedArgs): boolean {
  const { root, target, targetCoords, targetDims, rerenderTolerance } = args;
  if (!target && !targetCoords && !targetDims) {
    return false;
  }

  // when the target / target data are out of sync. usually due to a movingTarget, i.e. the target arg is more up to date than the pos/dims args
  if ((!target && targetCoords && targetDims) || (target && !targetCoords && !targetDims)) {
    return true;
  }

  const currentTargetSize: Dims = getElementDims(target);
  const currentTargetPosition: Coords = getTargetPosition(root, target);

  const sizeChanged: boolean = areaDiff(currentTargetSize, targetDims) > rerenderTolerance;
  const positionChanged: boolean = dist(currentTargetPosition, targetCoords) > rerenderTolerance;

  return sizeChanged || positionChanged;
}

export interface ShouldUpdateArgs extends TargetChangedArgs, ShouldScrollArgs { }

export function shouldUpdate(args: ShouldUpdateArgs): boolean {
  const { root, tooltip, target } = args;
  if (!root || !tooltip) {
    return false; // bail if these aren't present; need them for calculations
  }

  return targetChanged({ ...args }) || shouldScroll({ ...args }) || target === null;
}

export const takeActionIfValid = async (action: () => void, actionValidator?: () => Promise<boolean>) => {
  if (actionValidator) {
    const valid: boolean = await actionValidator();
    if (valid) {
      action();
    }
  } else {
    action();
  }
}

export const setNextOnTargetClick = (target: HTMLElement, next: (fromTarget?: boolean) => void, validateNext?: () => Promise<boolean>): (() => void) => {
  if (!target) {
    return;
  }

  // if valid, call a handler which 1. calls the tetheredAction function and 2. removes itself from the target
  const clickHandler = () => {
    const actionWithCleanup = () => {
      next(true);
      target.removeEventListener('click', clickHandler);
    }

    takeActionIfValid(actionWithCleanup, validateNext)
  }

  target.addEventListener('click', clickHandler);
  return () => target.removeEventListener('click', clickHandler); // return so we can remove the event elsewhere if the action doesn't get called
}