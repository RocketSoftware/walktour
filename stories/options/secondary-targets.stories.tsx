import * as React from 'react';
import { playgroundSetup, secondarySteps, primaryIntoSecondary } from '../../demo/setup';
import { Step, Walktour } from '../../src/components/Walktour';

export default {
  title: "Walktour|Options/Secondary Targets",
  component: Walktour,
}

const primarySteps = (): Step[] => [
    { selector: '#one', title: 'Guided Tour Component', description: 'Welcome to the tour!', secondarySelectors: ['#two', '#three', '.four', '#five', '#six', '#nine']},
    { selector: '#two', title: 'Keyboard Navigation', description: 'Use the arrow keys or tab to a specific button', secondarySelectors: ['#one', '.four', '#nine'] },
    { selector: "#three", description:"this is a test", secondarySelectors: ['#two', '.four', '#five', '#six', '#nine'] },
    { selector: "#nine", title: "Accessibility!", description: "The tooltip traps focus for keyboard users. The trap includes the target element(s)!" },
    { selector: '.four', title: 'Full CSS Selector Support', description: 'Any valid query selector works for targeting elements' },
  ]

const steps: { [index: string]: () => Step[] } = {
  default: () => primarySteps(),
  defaultSecondary: () => secondarySteps(),
}

const basicTour = (open?: boolean, close?: () => void, stepsOverride?: Step[]) => <Walktour disableCloseOnClick disableMaskInteraction={false} identifier="1" customCloseFunc={close} isOpen={open} steps={steps.default()} />
const scopedTour = (rootSelector: string) => <Walktour rootSelector={rootSelector} identifier="2" steps={steps.defaultSecondary()} />

export const full = () => {
  const [tourOpen, setTourOpen] = React.useState<boolean>(true);

  return (
    <>
      {playgroundSetup({ buttonText: "Toggle Tour", onButtonClick: () => setTourOpen(!tourOpen) })}
      {basicTour(tourOpen, () => setTourOpen(false), primaryIntoSecondary())}
      {scopedTour("#demo-container")}
    </>
  )
}
