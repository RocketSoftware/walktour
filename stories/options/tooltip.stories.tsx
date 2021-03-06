import * as React from 'react';
import { playgroundSetup, primarySteps } from '../../demo/setup';
import { Walktour } from '../../src/components/Walktour';
import { withKnobs, text } from '@storybook/addon-knobs';

const playgroundDecorator = (storyFunction: () => Node) => <>
  {playgroundSetup({ buttonText: "Click Me", onButtonClick: () => alert("Thanks!") })}
  {storyFunction()}
</>

export default {
  title: "Walktour|Options/Tooltip Content",
  component: Walktour,
  decorators: [
    withKnobs,
    playgroundDecorator
  ]
}

export const buttonLabels = () => (
  <Walktour
    steps={primarySteps()}
    nextLabel={text("nextLabel", "next")}
    prevLabel={text("prevLabel", "prev")}
    closeLabel={text("closeLabel", "close")}
  />
)
