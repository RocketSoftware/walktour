import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Mask } from './Mask';
import { Tooltip } from './Tooltip';
import { CardinalOrientation, OrientationCoords, getTargetPosition, getTooltipPosition } from '../utils/positioning';
import { Coords, getNearestScrollAncestor, getValidPortalRoot, Dims, getElementDims } from '../utils/dom';
import { scrollToDestination } from '../utils/scroll';
import { centerViewportAroundElements } from '../utils/offset';
import { isElementInView } from '../utils/viewport';
import { debounce, getIdString, clearWatcher, shouldUpdate, removeListener, refreshListeners, setFocusTrap } from '../utils/tour';


export interface WalktourLogic {
  next: () => void;
  prev: () => void;
  close: (reset?: boolean) => void;
  goToStep: (stepNumber: number) => void;
  stepContent: Step;
  stepIndex: number;
  allSteps: Step[];
}

export interface WalktourOptions {
  disableMaskInteraction?: boolean;
  disableCloseOnClick?: boolean;
  orientationPreferences?: CardinalOrientation[];
  maskPadding?: number;
  tooltipSeparation?: number;
  transition?: string;
  customTitleRenderer?: (title?: string, tourLogic?: WalktourLogic) => JSX.Element;
  customDescriptionRenderer?: (description: string, tourLogic?: WalktourLogic) => JSX.Element;
  customFooterRenderer?: (tourLogic?: WalktourLogic) => JSX.Element;
  customTooltipRenderer?: (tourLogic?: WalktourLogic) => JSX.Element;
  customNextFunc?: (tourLogic: WalktourLogic) => void;
  customPrevFunc?: (tourLogic: WalktourLogic) => void;
  customCloseFunc?: (tourLogic: WalktourLogic) => void;
  prevLabel?: string;
  nextLabel?: string;
  closeLabel?: string;
  disableNext?: boolean;
  disablePrev?: boolean;
  disableClose?: boolean;
  disableAutoScroll?: boolean;
  getPositionFromCandidates?: (candidates: OrientationCoords[]) => Coords;
  movingTarget?: boolean;
  updateInterval?: number;
  renderTolerance?: number;
  disableMask?: boolean;
  disableSmoothScroll?: boolean;
}

export interface Step extends WalktourOptions {
  selector: string;
  title?: string;
  description: string;
}

export interface WalktourProps extends WalktourOptions {
  steps: Step[];
  initialStepIndex?: number;
  zIndex?: number;
  rootSelector?: string;
  identifier?: string;
  setUpdateListener?: (update: () => void) => void;
  removeUpdateListener?: (update: () => void) => void;
  disableListeners?: boolean;
  isOpen?: boolean;
  debug?: boolean;
}

const walktourDefaultProps: Partial<WalktourProps> = {
  maskPadding: 5,
  tooltipSeparation: 10,
  transition: 'top 300ms ease, left 300ms ease',
  disableMaskInteraction: false,
  disableCloseOnClick: false,
  zIndex: 9999,
  renderTolerance: 2,
  updateInterval: 500
}

const basePortalString: string = 'walktour-portal';
const baseMaskString: string = 'walktour-mask';
const baseTooltipContainerString: string = 'walktour-tooltip-container';

export const Walktour = (props: WalktourProps) => {

  const {
    steps,
    initialStepIndex,
    isOpen
  } = props;

  const controlled = isOpen !== undefined;
  const [isOpenState, setIsOpenState] = React.useState<boolean>(isOpen == undefined);
  const [target, setTarget] = React.useState<HTMLElement>(undefined);
  const [tooltipPosition, setTooltipPosition] = React.useState<Coords>(undefined);
  const [currentStepIndex, setCurrentStepIndex] = React.useState<number>(initialStepIndex || 0);
  const [tourRoot, setTourRoot] = React.useState<Element>(undefined);

  const tooltipContainer = React.useRef<HTMLElement>(undefined);
  const portal = React.useRef<HTMLElement>(undefined);
  const targetPosition = React.useRef<Coords>(undefined);
  const targetSize = React.useRef<Dims>(undefined);
  const watcherId = React.useRef<number>(undefined);
  // we use this ref to store a particular (debounced) version of the updateTour function, so that 
  // we can remove it using removeEventListener even when called from a different step 
  const updateRef = React.useRef<() => void>(undefined);
  // similarly, we store the callback to clear the focus trap(s)
  const removeTrapRef = React.useRef<() => void>(undefined);


  const currentStepContent: Step = steps[currentStepIndex];
  const tourOpen: boolean = controlled ? isOpen : isOpenState;

  const options: WalktourOptions & WalktourProps & Step = {
    ...walktourDefaultProps,
    ...props,
    ...currentStepContent
  }

  const {
    maskPadding,
    disableMaskInteraction,
    disableCloseOnClick,
    tooltipSeparation,
    transition,
    orientationPreferences,
    customTooltipRenderer,
    zIndex,
    rootSelector,
    customNextFunc,
    customPrevFunc,
    customCloseFunc,
    disableClose,
    disableNext,
    disablePrev,
    disableAutoScroll,
    identifier,
    getPositionFromCandidates,
    movingTarget,
    renderTolerance,
    updateInterval,
    disableMask,
    setUpdateListener,
    removeUpdateListener,
    disableListeners,
    disableSmoothScroll,
    debug,
  } = options;

  React.useEffect(() => {
    return cleanup;
  }, []);

  // set/reset the tour root 
  React.useEffect(() => {
    let root: Element;
    if (rootSelector) {
      root = document.querySelector(rootSelector);
    }
    if (!root) {
      root = getNearestScrollAncestor(portal.current);
    }

    if (tourOpen !== false && root !== tourRoot) {
      setTourRoot(root);
    }
  }, [rootSelector, identifier, tourOpen])


  // update tour when step changes
  React.useEffect(() => {
    if (debug) {
      console.log(`walktour debug (${identifier ? `${identifier}, ` : ""}${currentStepIndex}):`, {
        "options:": options,
        "tour logic:": tourLogic,
        "previous state/vars:": {
          isOpenState,
          tourRoot,
          target,
          tooltipPosition,
          targetPosition,
          currentStepIndex,
          watcherId,
          updateRef,
          targetSize,
        }
      })
    }
    if (tooltipContainer.current && tourOpen) {
      tooltipContainer.current.focus();
      updateTour(tooltipContainer.current);
    }
  }, [currentStepIndex, currentStepContent, tourOpen, tourRoot, tooltipContainer.current])

  // update tooltip and target position in state
  const updateTour = (tooltipContainer: HTMLElement) => {
    const root: Element = tourRoot;

    // clean up existing listeners
    clearWatcher(watcherId);
    removeTrapRef.current && removeTrapRef.current();

    if (!root || !tooltipContainer) {
      setTarget(null);
      setTooltipPosition(null);         
      targetPosition.current = null;
      targetSize.current = null;
      return;
    }

    const getTarget = (): HTMLElement => document.querySelector(currentStepContent.selector);
    const currentTarget: HTMLElement = getTarget();
    const currentTargetPosition: Coords = getTargetPosition(root, currentTarget);
    const currentTargetDims: Dims = getElementDims(currentTarget);
    const tooltipPosition: Coords = getTooltipPosition({
      target: currentTarget,
      tooltip: tooltipContainer,
      padding: disableMask ? 0 : maskPadding,
      tooltipSeparation,
      orientationPreferences,
      tourRoot: root,
      getPositionFromCandidates,
      scrollDisabled: disableAutoScroll
    });

    setTarget(currentTarget);
    setTooltipPosition(tooltipPosition);
    targetPosition.current = currentTargetPosition;
    targetSize.current = currentTargetDims;

    //focus trap subroutine
    removeTrapRef.current = setFocusTrap(tooltipContainer, currentTarget, disableMaskInteraction);

    // if scroll is not disabled, scroll to target if it's out of view or if the tooltip would be placed out of the viewport
    if (!disableAutoScroll && currentTarget && (!isElementInView(root, currentTarget) || !isElementInView(root, tooltipContainer, tooltipPosition))) {
      scrollToDestination(root, centerViewportAroundElements(root, tooltipContainer, currentTarget, tooltipPosition, currentTargetPosition), disableSmoothScroll)
    }

    const debouncedUpdate = debounce(() => {
      const availableTarget = getTarget();
      if (shouldUpdate(root, tooltipContainer, availableTarget, disableAutoScroll, targetPosition.current, targetSize.current, renderTolerance)) {
        updateTour(tooltipContainer);
      }
    })

    // if the user requests a watcher and there's supposed to be a target
    if (movingTarget && (currentTarget || currentStepContent.selector)) {
      watcherId.current = window.setInterval(debouncedUpdate, updateInterval)
    }

    !disableListeners && refreshListeners(debouncedUpdate, updateRef, setUpdateListener, removeUpdateListener);
  }

  const goToStep = (stepIndex: number) => {
    if (stepIndex >= steps.length || stepIndex < 0) {
      return;
    }
    setCurrentStepIndex(stepIndex);
  }

  const cleanup = (reset?: boolean) => {
    reset && goToStep(0);
    !controlled && setIsOpenState(false);
    clearWatcher(watcherId);
    removeListener(updateRef.current, removeUpdateListener);
    removeTrapRef.current && removeTrapRef.current();
    target && target.focus(); // return focus to last target when closed
  }

  const baseLogic: WalktourLogic = {
    next: () => goToStep(currentStepIndex + 1),
    prev: () => goToStep(currentStepIndex - 1),
    close: (reset?: boolean) => cleanup(reset),
    goToStep: goToStep,
    stepContent: { ...options }, //pass options in as well to expose any defaults that aren't specified
    stepIndex: currentStepIndex,
    allSteps: steps
  };

  const tourLogic: WalktourLogic = {
    ...baseLogic,
    ...customNextFunc && { next: () => customNextFunc(baseLogic) },
    ...customPrevFunc && { prev: () => customPrevFunc(baseLogic) },
    ...customCloseFunc && { close: () => customCloseFunc(baseLogic) }
  };

  const keyPressHandler = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        if (!disableClose) {
          tourLogic.close();
        }
        break;
      case "ArrowRight":
        event.preventDefault();
        if (!disableNext) {
          tourLogic.next()
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (!disablePrev) {
          tourLogic.prev();
        }
        break;
    }
  }

  //don't render if the tour is hidden or if there's no step data
  if (!tourOpen || !currentStepContent) {
    return null;
  };

  const portalStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: zIndex,
    visibility: tooltipPosition ? 'visible' : 'hidden',
    pointerEvents: "none"
  }

  const tooltipContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: tooltipPosition && tooltipPosition.y,
    left: tooltipPosition && tooltipPosition.x,
    transition: transition,
    pointerEvents: 'auto'
  }

  // render mask, tooltip, and their shared "portal" container
  const render = () => (
    <div
      ref={ref => portal.current = ref}
      id={getIdString(basePortalString, identifier)}
      style={portalStyle}
    >
      {tourRoot &&
        <>
          <Mask
            maskId={getIdString(baseMaskString, identifier)}
            target={target}
            disableMaskInteraction={disableMaskInteraction}
            disableCloseOnClick={disableCloseOnClick}
            disableMask={disableMask}
            padding={maskPadding}
            tourRoot={tourRoot}
            close={tourLogic.close}
          />

          <div
            ref={ref => tooltipContainer.current = ref}
            id={getIdString(baseTooltipContainerString, identifier)}
            style={tooltipContainerStyle}
            onKeyDown={keyPressHandler}
            tabIndex={0}>
            {customTooltipRenderer
              ? customTooltipRenderer(tourLogic)
              : <Tooltip
                {...tourLogic}
              />
            }
          </div>
        </>
      }
    </div>);

  // on first render, put everything in its normal context.
  // after first render (once we've determined the tour root) spawn a portal there for rendering.
  if (tourRoot) {
    return ReactDOM.createPortal(render(), getValidPortalRoot(tourRoot));
  } else {
    return render();
  }
}

