# Introduction

Pick-Up-Stix allows you to create tokens out of items. These tokens can then be interacted with by players. Tokens can either be single items or containers that hold multiple other items and/or currency that can be looted by players.

I mainly play Dungeons and Dragons 5th and therefore I develop and test with that in mind and with the modules that I use in mind. So I apologize if it might take time to get to things sometimes. Please message me on discord @kamcknig anytime though with any quetions and I will get back when I can.

### This is just a personal fork for this module , hoping to see back Kyle McKnight because i don't have so much time for this

## NOTE: If you are a javascript developer and not a typescript developer, you can just use the javascript files under the dist folder or rename the file from .ts to .js

## Installation

It's always easiest to install modules from the in game add-on browser.

To install this module manually:
1.  Inside the Foundry "Configuration and Setup" screen, click "Add-on Modules"
2.  Click "Install Module"
3.  In the "Manifest URL" field, paste the following url:
`https://raw.githubusercontent.com/p4535992/pick-up-stix/master/src/module.json`
4.  Click 'Install' and wait for installation to complete
5.  Don't forget to enable the module in game using the "Manage Module" button

### libWrapper

This module uses the [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper) library for wrapping core methods. It is a hard dependency and it is recommended for the best experience and compatibility with other modules.


## Features

- Drop items from the items directory, compediums, or a player's inventory onto the canvas, player tokens, or container tokens.
- Players may pick up item tokens directly into their inventory
- Players may interact with container tokens by opening them to see a loot sheet which they can then interact with to pick up items or currency from the container.
- Create template containers by create a 'container' type item using the 'Create Item' button in the Item Directory. This template can then be dragged onto the canvas to create an instance of that container that has all of the loot configured on the container Item. You can then edit this instance of the container separtely from the one in the Item Directory.
- When interacting with a container, a selection is shown that allows players to choose which token's actor will loot the container.
- GMs may edit item and container token instances' light configuration, lock them so that players cannot interact with them, or make them invisible by opening the right click HUD on the tokens.

## Limitations

- Only one player at a time may interact with a container. This is due to the complicated nature of syncing the data between clients and the limitations of Foundry at the current time.
- You might notice a slight delay when looting items, usually this is no more than a couple hundred milliseconds or less. This again is due to the nature of syncing the data across all clients.
- Currently, to interact with an item or container token, a player's token must be within one square of the token.
- Container/item tokens cannot be copied/pasted

## Future Considrations and Plans

- Using roll tables to fill loot container
- Loot dead bodies
- Steal from living bodies using DC checks and notifications to GM if it fails
- Allowing addition of items via the 'add' button on the item config application
- Lots more, my backlog and suggestions I've received from people has filled my Trello board

## Known Issues

- Editing currency of a container template in the Item Directory does not visually show the currency in the config sheet after saving. Once you drag that template to the canvas, the token instance should have the currency though, or you can also edit the token instance's currency and that works correctly and as expected.
- The numerical inputs on the container's config should support the +/- form to add/subtract quantities, but is currently broken.

# Demo

Click to see the demo!

[![Demo thumbnail](https://turkeysunite-foundry-modules.s3.amazonaws.com/pick-up-stix/demos/pick-up-stix-demo-thumb.png)](https://turkeysunite-foundry-modules.s3.amazonaws.com/pick-up-stix/demos/pick-up-stix-demo.mp4 "Click to watch the demo video!")

## [Changelog](./changelog.md)

## Issues

Any issues, bugs, or feature requests are always welcome to be reported directly to the [Issue Tracker](https://github.com/kamcknig/pick-up-stix/issues ), or using the [Bug Reporter Module](https://foundryvtt.com/packages/bug-reporter/).

## Acknowledgements

Bootstrapped with League of Extraordinary FoundryVTT Developers  [foundry-vtt-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-types).

Mad props to the 'League of Extraordinary FoundryVTT Developers' community which helped me figure out a lot.

## Credit

Thanks to anyone who helps me with this code! I appreciate the user community's feedback on this project!
