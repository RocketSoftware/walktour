import * as React from 'react';
import { playgroundSetup, primarySteps } from '../../demo/setup';
import { Walktour } from '../../src/components/Walktour';
import { withKnobs, boolean } from '@storybook/addon-knobs';
import { buttonStepIndex } from '../utils/setup';
import { Step } from '../../src/components/Walktour';

const playgroundDecorator = (storyFunction: () => Node) => <>
  {playgroundSetup({ buttonText: "Click Me", onButtonClick: () => alert("Thanks!") })}
  {storyFunction()}
</>
const singleButtonStep = (description: string, title?: string): Step[] => [{selector: '#one', title: title, description: description, hideNext: true, hidePrev: true, hideClose: true}];
export default {
  title: "Walktour|Options/Interaction",
  component: Walktour,
  decorators: [
    withKnobs,
    playgroundDecorator
  ]
}

export const all = () => (
  <Walktour
    steps={primarySteps()}
    disableCloseOnClick={boolean('disableCloseOnClick', true)}
    disableMaskInteraction={boolean('disableMaskInteraction', true)}
    disableNext={boolean('disableNext', false)}
    disablePrev={boolean('disablePrev', false)}
    disableClose={boolean('disableClose', true)}
  />
)

export const disableCloseOnClick = () => (
  <Walktour
    initialStepIndex={buttonStepIndex}
    steps={primarySteps()}
    disableCloseOnClick={boolean('disableCloseOnClick', true)}
  />
)

export const disableMaskInteraction = () => (
  <Walktour
    initialStepIndex={buttonStepIndex}
    steps={primarySteps()}
    disableMaskInteraction={boolean('disableMaskInteraction', true)}
  />
)

export const disableActions = () => (
  <Walktour
    steps={primarySteps()}
    disableNext={boolean('disableNext', false)}
    disablePrev={boolean('disablePrev', false)}
    disableClose={boolean('disableClose', true)}
  />
)

export const hideButtons = () => (
  <Walktour 
  steps={singleButtonStep('Show/Hide the buttons by defining booleans within the step', 'Show/Hide Buttons')}
  />
)
